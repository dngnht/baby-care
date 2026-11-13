import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRepo, type Repo } from '../../../../core/db/repo'
import type { LogEntry } from '../../../../core/db/schema'
import { loadRunningTimer, startTimer, stopTimer } from '../timerService'
import { startPayload } from '../timer'

const BABY_ID = 'baby-1'
const NOW = new Date(2026, 10, 8, 9, 30, 0)

const minutesLater = (date: Date, minutes: number): Date =>
  new Date(date.getTime() + minutes * 60_000)

const hoursLater = (date: Date, hours: number): Date => minutesLater(date, hours * 60)

/** Every row for the baby, wide window so assertions never miss a write. */
async function allLogs(repo: Repo): Promise<LogEntry[]> {
  return repo.listLogs(BABY_ID, hoursLater(NOW, -100), hoursLater(NOW, 100))
}

describe('timerService', () => {
  let dbName: string
  let repo: Repo

  beforeEach(() => {
    // Unique database per test => no shared state with other suites.
    dbName = `beyeu_timer_${crypto.randomUUID()}`
    repo = createRepo(dbName)
  })

  afterEach(async () => {
    await repo.destroy()
  })

  it('startTimer persists exactly one entry with no endAt and the running marker', async () => {
    const started = await startTimer(repo, BABY_ID, 'feed_breast', NOW)

    const logs = await allLogs(repo)
    expect(logs).toHaveLength(1)
    expect(logs[0]?.id).toBe(started.id)
    expect(logs[0]?.type).toBe('feed_breast')
    expect(logs[0]?.startAt).toBe(NOW.toISOString())
    expect(logs[0]?.endAt).toBeUndefined()
    expect(logs[0]?.payload).toEqual({ timer: 'running' })
  })

  it('stopTimer stamps endAt and removes the marker, keeping the log as one entry', async () => {
    const started = await startTimer(repo, BABY_ID, 'sleep', NOW)
    const stopAt = minutesLater(NOW, 95)

    const stopped = await stopTimer(repo, started, stopAt)
    expect(stopped.endAt).toBe(stopAt.toISOString())
    expect(stopped.payload).toEqual({})

    const logs = await allLogs(repo)
    expect(logs).toHaveLength(1)
    expect(logs[0]?.id).toBe(started.id)
    expect(logs[0]?.endAt).toBe(stopAt.toISOString())
    expect(logs[0]?.payload.timer).toBeUndefined()
  })

  it('stopTimer keeps payload details that were stored next to the marker', async () => {
    const entry = await repo.addLog({
      babyId: BABY_ID,
      type: 'feed_breast',
      startAt: NOW,
      payload: startPayload({ side: 'left' }),
      createdBy: 'parent',
    })

    const stopped = await stopTimer(repo, entry, minutesLater(NOW, 20))

    expect(stopped.payload).toEqual({ side: 'left' })
    expect(stopped.endAt).toBe(minutesLater(NOW, 20).toISOString())
  })

  it('loadRunningTimer returns the newest running timer and ignores stopped rows', async () => {
    await repo.addLog({
      babyId: BABY_ID,
      type: 'sleep',
      startAt: hoursLater(NOW, -3),
      endAt: hoursLater(NOW, -2),
      payload: startPayload(),
      createdBy: 'parent',
    })
    const newest = await startTimer(repo, BABY_ID, 'feed_breast', minutesLater(NOW, -10))

    const running = await loadRunningTimer(repo, BABY_ID, NOW)

    expect(running?.id).toBe(newest.id)
    expect(running?.startAt).toBe(minutesLater(NOW, -10).toISOString())
  })

  it('loadRunningTimer ignores a timer older than 48 hours', async () => {
    await repo.addLog({
      babyId: BABY_ID,
      type: 'sleep',
      startAt: hoursLater(NOW, -49),
      payload: startPayload(),
      createdBy: 'parent',
    })

    expect(await loadRunningTimer(repo, BABY_ID, NOW)).toBeNull()
  })

  it('startTimer throws while another timer is running and writes nothing', async () => {
    await startTimer(repo, BABY_ID, 'sleep', NOW)

    await expect(startTimer(repo, BABY_ID, 'feed_breast', minutesLater(NOW, 1))).rejects.toThrow(
      /already running/,
    )
    expect(await allLogs(repo)).toHaveLength(1)
  })

  it('startTimer works again once the previous timer was stopped', async () => {
    const first = await startTimer(repo, BABY_ID, 'sleep', NOW)
    await stopTimer(repo, first, minutesLater(NOW, 30))

    const second = await startTimer(repo, BABY_ID, 'feed_breast', minutesLater(NOW, 31))

    expect(second.id).not.toBe(first.id)
    expect(await loadRunningTimer(repo, BABY_ID, minutesLater(NOW, 32))).toMatchObject({
      id: second.id,
      startAt: minutesLater(NOW, 31).toISOString(),
    })
  })

  it('restores the same timer with its original startAt after a reload', async () => {
    const started = await startTimer(repo, BABY_ID, 'sleep', NOW)

    // Simulate a page reload: drop the connection and reopen the same database.
    repo.close()
    const reopened = createRepo(dbName)

    try {
      const restored = await loadRunningTimer(reopened, BABY_ID, minutesLater(NOW, 5))

      expect(restored).not.toBeNull()
      expect(restored?.id).toBe(started.id)
      expect(restored?.startAt).toBe(started.startAt)
      expect(restored?.endAt).toBeUndefined()
      expect(restored?.payload).toEqual({ timer: 'running' })
    } finally {
      await reopened.destroy()
    }
  })
})
