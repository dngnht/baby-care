import { describe, expect, it } from 'vitest'
import type { LogEntry, LogType } from '../../../core/db/schema'
import { describeLog, isTimerRunning, readAmountMl, readDiaperKind, readSide, readTempC } from '../describeLog'

function entry(type: LogType, startAt: Date, payload: Record<string, unknown> = {}, endAt?: Date): LogEntry {
  const base: LogEntry = {
    id: 'log-1',
    babyId: 'baby-1',
    type,
    startAt: startAt.toISOString(),
    payload,
    createdBy: 'parent',
  }
  return endAt === undefined ? base : { ...base, endAt: endAt.toISOString() }
}

const START = new Date(2026, 2, 6, 8, 0, 0)

describe('payload guards', () => {
  it('reads only well-formed values', () => {
    expect(readSide({ side: 'left' })).toBe('left')
    expect(readSide({ side: 'middle' })).toBeUndefined()
    expect(readDiaperKind({ diaperKind: 'dirty' })).toBe('dirty')
    expect(readDiaperKind({ diaperKind: 3 })).toBeUndefined()
    expect(readAmountMl({ amountMl: 90 })).toBe(90)
    expect(readAmountMl({ amountMl: '90' })).toBeUndefined()
    expect(readTempC({ tempC: Number.NaN })).toBeUndefined()
  })

  it('detects a running timer marker', () => {
    expect(isTimerRunning({ payload: { timer: 'running' } })).toBe(true)
    expect(isTimerRunning({ payload: { timer: 'done' } })).toBe(false)
    expect(isTimerRunning({ payload: {} })).toBe(false)
  })
})

describe('describeLog', () => {
  it('describes a bottle feed amount', () => {
    expect(describeLog(entry('feed_bottle', START, { amountMl: 120 }))).toBe('120 ml')
  })

  it('describes the breast side', () => {
    expect(describeLog(entry('feed_breast', START, { side: 'left' }))).toBe('Trái')
    expect(describeLog(entry('feed_breast', START, { side: 'both' }))).toBe('Cả hai')
  })

  it('describes the diaper kind', () => {
    expect(describeLog(entry('diaper', START, { diaperKind: 'wet' }))).toBe('Ướt')
  })

  it('describes a finished sleep with its duration', () => {
    const end = new Date(START.getTime() + 95 * 60_000)
    expect(describeLog(entry('sleep', START, {}, end))).toBe('1h35')
  })

  it('measures a running sleep up to now', () => {
    const now = new Date(START.getTime() + 30 * 60_000)
    expect(describeLog(entry('sleep', START, { timer: 'running' }), now)).toBe('30p')
  })

  it('describes temperature and free-text notes', () => {
    expect(describeLog(entry('temp', START, { tempC: 37.5 }))).toBe('37.5°C')
    expect(describeLog(entry('note', START, { note: 'Bé cười lần đầu' }))).toBe('Bé cười lần đầu')
  })

  it('returns an empty string when there is nothing to show', () => {
    expect(describeLog(entry('solid', START))).toBe('')
  })
})
