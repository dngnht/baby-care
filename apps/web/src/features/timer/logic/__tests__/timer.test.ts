import { describe, expect, it } from 'vitest'
import type { LogEntry, LogPayload, LogType } from '../../../../core/db/schema'
import { elapsedMinutes, findRunningTimer, isTimerType, startPayload, stopPayload } from '../timer'

const RUNNING: LogPayload = { timer: 'running' }

function entry(
  id: string,
  type: LogType,
  startAt: string,
  payload: LogPayload = {},
  endAt?: string,
): LogEntry {
  const base: LogEntry = { id, babyId: 'baby-1', type, startAt, payload, createdBy: 'parent' }
  return endAt === undefined ? base : { ...base, endAt }
}

const at = (day: number, hour: number, minute = 0): string =>
  new Date(2026, 10, day, hour, minute, 0).toISOString()

describe('isTimerType', () => {
  it('accepts only breast feeds and sleep', () => {
    expect(isTimerType('feed_breast')).toBe(true)
    expect(isTimerType('sleep')).toBe(true)
    for (const type of ['feed_bottle', 'solid', 'diaper', 'temp', 'note'] as LogType[]) {
      expect(isTimerType(type)).toBe(false)
    }
  })
})

describe('findRunningTimer', () => {
  it('returns the newest running timer regardless of input order', () => {
    const entries = [
      entry('new', 'sleep', at(8, 9), RUNNING),
      entry('old', 'feed_breast', at(8, 7), RUNNING),
    ]

    expect(findRunningTimer(entries)?.id).toBe('new')
    expect(findRunningTimer([...entries].reverse())?.id).toBe('new')
  })

  it('skips entries that were already stopped', () => {
    const entries = [
      entry('stopped', 'sleep', at(8, 9), RUNNING, at(8, 10)),
      entry('running', 'sleep', at(7, 9), RUNNING),
    ]

    expect(findRunningTimer(entries)?.id).toBe('running')
  })

  it('ignores timer types without the running marker', () => {
    const entries = [
      entry('finished-feed', 'feed_breast', at(8, 9), { side: 'left' }),
      entry('running', 'feed_breast', at(8, 8), RUNNING),
    ]

    expect(findRunningTimer(entries)?.id).toBe('running')
  })

  it('ignores non-timer types even when they carry the marker', () => {
    const entries = [
      entry('bottle', 'feed_bottle', at(8, 9), RUNNING),
      entry('diaper', 'diaper', at(8, 9), RUNNING),
    ]

    expect(findRunningTimer(entries)).toBeNull()
  })

  it('returns null when nothing is running', () => {
    expect(findRunningTimer([])).toBeNull()
    expect(findRunningTimer([entry('stopped', 'sleep', at(8, 9), RUNNING, at(8, 10))])).toBeNull()
  })
})

describe('elapsedMinutes', () => {
  it('counts whole minutes since startAt', () => {
    const started = entry('timer', 'sleep', at(8, 7, 45), RUNNING)

    expect(elapsedMinutes(started, new Date(2026, 10, 8, 9, 35, 0))).toBe(110)
    expect(elapsedMinutes(started, new Date(2026, 10, 8, 8, 0, 0))).toBe(15)
  })

  it('never returns a negative duration', () => {
    const started = entry('timer', 'sleep', at(8, 9), RUNNING)

    expect(elapsedMinutes(started, new Date(2026, 10, 8, 8, 0, 0))).toBe(0)
  })
})

describe('startPayload', () => {
  it('adds the running marker to an empty payload', () => {
    expect(startPayload()).toEqual({ timer: 'running' })
  })

  it('keeps base data and does not mutate the input', () => {
    const base: LogPayload = { side: 'left' }
    const payload = startPayload(base)

    expect(payload).toEqual({ side: 'left', timer: 'running' })
    expect(base).toEqual({ side: 'left' })
  })
})

describe('stopPayload', () => {
  it('removes the marker and keeps the remaining details', () => {
    expect(stopPayload({ timer: 'running', side: 'right', note: 'Bú đêm' })).toEqual({
      side: 'right',
      note: 'Bú đêm',
    })
  })

  it('does not mutate the input payload', () => {
    const payload: LogPayload = { timer: 'running', amountMl: 120 }
    stopPayload(payload)

    expect(payload).toEqual({ timer: 'running', amountMl: 120 })
  })

  it('returns an empty payload when only the marker was present', () => {
    expect(stopPayload(RUNNING)).toEqual({})
  })
})
