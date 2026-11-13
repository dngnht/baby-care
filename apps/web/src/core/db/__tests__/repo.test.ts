import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRepo, type Repo } from '../repo'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const iso = (value: Date): string => value.toISOString()

describe('repo', () => {
  let repo: Repo
  let babyId: string

  beforeEach(async () => {
    // Unique database per test => no shared state between test cases.
    repo = createRepo(`beyeu_test_${crypto.randomUUID()}`)
    const baby = await repo.createBaby({
      name: 'Bé An',
      sex: 'F',
      birthDate: new Date('2025-01-15T00:00:00.000Z'),
      gestationalWeeks: 39,
      birthWeightG: 3200,
      birthLengthCm: 50,
    })
    babyId = baby.id
  })

  afterEach(async () => {
    await repo.destroy()
  })

  it('createBaby persists the baby with a UUID id and ISO UTC birth date', async () => {
    const baby = await repo.createBaby({
      name: 'Bé Bình',
      sex: 'M',
      birthDate: new Date('2025-06-01T10:30:00+07:00'),
      gestationalWeeks: 40,
      birthWeightG: 3500,
      birthLengthCm: 51.5,
    })

    expect(baby.id).toMatch(UUID_V4)
    expect(baby.birthDate).toBe('2025-06-01T03:30:00.000Z')
    expect(await repo.getBaby(baby.id)).toEqual(baby)
    expect(await repo.listBabies()).toHaveLength(2)
  })

  it('addLog stores 3 entries; listLogs returns the 2 in range newest first', async () => {
    const first = new Date('2026-03-01T08:00:00.000Z')
    const second = new Date('2026-03-01T12:00:00.000Z')
    const third = new Date('2026-03-01T20:00:00.000Z')

    await repo.addLog({ babyId, type: 'feed_breast', startAt: first, payload: { side: 'L' }, createdBy: 'me' })
    await repo.addLog({ babyId, type: 'feed_bottle', startAt: second, payload: { ml: 90 }, createdBy: 'me' })
    await repo.addLog({ babyId, type: 'diaper', startAt: third, payload: { kind: 'wet' }, createdBy: 'me' })

    const inRange = await repo.listLogs(babyId, first, second)

    expect(inRange).toHaveLength(2)
    expect(inRange.map((entry) => entry.startAt)).toEqual([iso(second), iso(first)])
  })

  it('deleteLog removes the entry from listLogs', async () => {
    const start = new Date('2026-03-02T09:00:00.000Z')
    const kept = await repo.addLog({ babyId, type: 'sleep', startAt: start, payload: {}, createdBy: 'me' })
    const removed = await repo.addLog({ babyId, type: 'note', startAt: start, payload: {}, createdBy: 'me' })

    await repo.deleteLog(removed.id)

    const result = await repo.listLogs(babyId, start, start)
    expect(result.map((entry) => entry.id)).toEqual([kept.id])
    expect(result.some((entry) => entry.id === removed.id)).toBe(false)
  })

  it('logs generated ids are UUIDs and endAt is stored as ISO UTC', async () => {
    const startAt = new Date('2026-03-03T10:00:00+07:00')
    const endAt = new Date('2026-03-03T11:30:00+07:00')

    const entry = await repo.addLog({ babyId, type: 'sleep', startAt, endAt, payload: {}, createdBy: 'me' })

    expect(entry.id).toMatch(UUID_V4)
    expect(entry.startAt).toBe('2026-03-03T03:00:00.000Z')
    expect(entry.endAt).toBe('2026-03-03T04:30:00.000Z')
  })

  it('listLogs is inclusive, excludes other babies and returns empty when from > to', async () => {
    const otherBaby = await repo.createBaby({
      name: 'Bé Cường',
      sex: 'M',
      birthDate: new Date('2025-02-01T00:00:00.000Z'),
      gestationalWeeks: 38,
      birthWeightG: 3000,
      birthLengthCm: 49,
    })
    const at = new Date('2026-03-04T07:00:00.000Z')
    const mine = await repo.addLog({ babyId, type: 'temp', startAt: at, payload: { celsius: 37 }, createdBy: 'me' })
    await repo.addLog({ babyId: otherBaby.id, type: 'temp', startAt: at, payload: {}, createdBy: 'me' })

    expect(await repo.listLogs(babyId, at, at)).toEqual([mine])
    expect(await repo.listLogs(babyId, at, new Date('2026-03-03T00:00:00.000Z'))).toEqual([])
  })

  it('updateLog merges a patch and persists it', async () => {
    const entry = await repo.addLog({
      babyId,
      type: 'note',
      startAt: new Date('2026-03-05T08:00:00.000Z'),
      payload: { text: 'first' },
      createdBy: 'me',
    })

    const updated = await repo.updateLog(entry.id, {
      payload: { text: 'edited' },
      endAt: new Date('2026-03-05T09:00:00.000Z'),
    })

    expect(updated.payload).toEqual({ text: 'edited' })
    expect(updated.endAt).toBe('2026-03-05T09:00:00.000Z')
    expect(await repo.db.logs.get(entry.id)).toEqual(updated)
  })

  it('addMeasurement returns the stored record with ISO UTC date and lists measurements', async () => {
    const measurement = await repo.addMeasurement({
      babyId,
      date: new Date('2026-03-06T10:00:00+07:00'),
      weightG: 7800,
      lengthCm: 68.5,
      headCm: 43,
    })

    expect(measurement.id).toMatch(UUID_V4)
    expect(measurement.date).toBe('2026-03-06T03:00:00.000Z')
    expect(measurement).toMatchObject({ babyId, weightG: 7800, lengthCm: 68.5, headCm: 43 })
    expect(await repo.listMeasurements(babyId)).toEqual([measurement])
  })

  it('supports vaccine dose and milestone CRUD', async () => {
    const dose = await repo.addVaccineDose({
      babyId,
      vaccineCode: 'BCG',
      doseNo: 1,
      dueDate: new Date('2025-01-15T00:00:00.000Z'),
    })
    const laterDose = await repo.addVaccineDose({
      babyId,
      vaccineCode: 'DTP',
      doseNo: 1,
      dueDate: new Date('2025-03-15T00:00:00.000Z'),
    })

    expect((await repo.listVaccineDoses(babyId)).map((item) => item.id)).toEqual([dose.id, laterDose.id])

    const updatedDose = await repo.updateVaccineDose(dose.id, {
      givenDate: new Date('2025-01-16T09:00:00.000Z'),
      lot: 'LOT-1',
      place: 'Trạm y tế',
    })
    expect(updatedDose).toMatchObject({
      givenDate: '2025-01-16T09:00:00.000Z',
      lot: 'LOT-1',
      place: 'Trạm y tế',
    })

    await repo.setMilestoneCheck({ babyId, milestoneId: 'head_up', achievedAt: new Date('2025-03-01T00:00:00.000Z') })
    await repo.setMilestoneCheck({ babyId, milestoneId: 'head_up', achievedAt: new Date('2025-03-02T00:00:00.000Z') })

    expect(await repo.listMilestoneChecks(babyId)).toEqual([
      { babyId, milestoneId: 'head_up', achievedAt: '2025-03-02T00:00:00.000Z' },
    ])
  })
})
