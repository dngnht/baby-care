import { describe, expect, it } from 'vitest'
import type { LogEntry, LogType } from '../../../../core/db/schema'
import {
  buildQuickLog,
  DEFAULT_CREATED_BY,
  parseAmountMl,
  parseTempC,
  pickDefaults,
  shouldAskAmount,
} from '../quickLog'

const NOW = new Date(2026, 10, 8, 9, 30, 0)

function entry(
  id: string,
  type: LogType,
  startAt: Date,
  payload: Record<string, unknown> = {},
): LogEntry {
  return {
    id,
    babyId: 'baby-1',
    type,
    startAt: startAt.toISOString(),
    payload,
    createdBy: 'parent',
  }
}

const at = (day: number, hour: number, minute = 0): Date =>
  new Date(2026, 10, day, hour, minute, 0)

describe('pickDefaults', () => {
  it('takes the side and amount from the most recent log of each type', () => {
    const entries = [
      entry('bottle-old', 'feed_bottle', at(6, 8), { amountMl: 90 }),
      entry('breast-old', 'feed_breast', at(6, 7), { side: 'left' }),
      entry('breast-new', 'feed_breast', at(8, 7), { side: 'right' }),
      entry('bottle-new', 'feed_bottle', at(8, 8), { amountMl: 120 }),
    ]

    expect(pickDefaults(entries)).toEqual({ side: 'right', amountMl: 120 })
  })

  it('does not depend on the incoming order', () => {
    const entries = [
      entry('new', 'feed_breast', at(8, 9), { side: 'left' }),
      entry('old', 'feed_breast', at(7, 9), { side: 'right' }),
    ]

    expect(pickDefaults(entries).side).toBe('left')
  })

  it('skips malformed payloads and picks the next usable row', () => {
    const entries = [
      entry('broken', 'feed_breast', at(8, 9), { side: 'middle' }),
      entry('usable', 'feed_breast', at(7, 9), { side: 'both' }),
      entry('text-amount', 'feed_bottle', at(8, 9), { amountMl: '120' }),
      entry('real-amount', 'feed_bottle', at(7, 9), { amountMl: 60 }),
    ]

    expect(pickDefaults(entries)).toEqual({ side: 'both', amountMl: 60 })
  })

  it('returns no defaults when there is no history', () => {
    expect(pickDefaults([])).toEqual({})
    expect(pickDefaults([entry('solid', 'solid', at(8, 9))])).toEqual({})
  })
})

describe('buildQuickLog', () => {
  it('maps every tile type to its log type', () => {
    const types: LogType[] = ['feed_breast', 'solid', 'diaper', 'sleep', 'temp']
    for (const type of types) {
      expect(buildQuickLog(type, 'baby-1', {}, NOW).type).toBe(type)
    }
  })

  it('logs the breast side, falling back to both', () => {
    expect(buildQuickLog('feed_breast', 'baby-1', {}, NOW).payload).toEqual({ side: 'both' })
    expect(buildQuickLog('feed_breast', 'baby-1', { side: 'left' }, NOW).payload).toEqual({
      side: 'left',
    })
  })

  it('logs a wet diaper by default', () => {
    expect(buildQuickLog('diaper', 'baby-1', {}, NOW).payload).toEqual({ diaperKind: 'wet' })
  })

  it('reuses the last bottle amount and stays empty without one', () => {
    expect(buildQuickLog('feed_bottle', 'baby-1', { amountMl: 120 }, NOW).payload).toEqual({
      amountMl: 120,
    })
    expect(buildQuickLog('feed_bottle', 'baby-1', {}, NOW).payload).toEqual({})
  })

  it('never invents a measurement for the remaining types', () => {
    for (const type of ['solid', 'sleep', 'temp', 'med', 'symptom', 'note'] as LogType[]) {
      expect(buildQuickLog(type, 'baby-1', { side: 'left', amountMl: 120 }, NOW).payload).toEqual({})
    }
  })

  it('uses the given instant untouched and stamps the author', () => {
    const built = buildQuickLog('solid', 'baby-1', {}, NOW)

    expect(built.startAt).toBe(NOW)
    expect(built.babyId).toBe('baby-1')
    expect(built.createdBy).toBe(DEFAULT_CREATED_BY)
    expect(built.endAt).toBeUndefined()
  })
})

describe('parseAmountMl', () => {
  it('accepts whole positive millilitres', () => {
    expect(parseAmountMl('120')).toBe(120)
    expect(parseAmountMl(' 60 ')).toBe(60)
  })

  it('rejects blanks, decimals, text, zero and negatives', () => {
    expect(parseAmountMl('')).toBeUndefined()
    expect(parseAmountMl('12.5')).toBeUndefined()
    expect(parseAmountMl('abc')).toBeUndefined()
    expect(parseAmountMl('0')).toBeUndefined()
    expect(parseAmountMl('-10')).toBeUndefined()
  })
})

describe('parseTempC', () => {
  it('accepts decimals with a dot or a comma and keeps one decimal', () => {
    expect(parseTempC('37.5')).toBe(37.5)
    expect(parseTempC('37,5')).toBe(37.5)
    expect(parseTempC('38.46')).toBe(38.5)
  })

  it('rejects blanks, text and non-positive values', () => {
    expect(parseTempC('')).toBeUndefined()
    expect(parseTempC('   ')).toBeUndefined()
    expect(parseTempC('nóng')).toBeUndefined()
    expect(parseTempC('0')).toBeUndefined()
    expect(parseTempC('-1')).toBeUndefined()
  })
})

describe('shouldAskAmount', () => {
  it('asks for a volume when no bottle history exists', () => {
    expect(shouldAskAmount('feed_bottle', {})).toBe(true)
  })

  it('reuses the previous volume when there is one', () => {
    expect(shouldAskAmount('feed_bottle', { amountMl: 120 })).toBe(false)
  })

  it('never asks for other tile types', () => {
    expect(shouldAskAmount('feed_breast', {})).toBe(false)
    expect(shouldAskAmount('diaper', {})).toBe(false)
    expect(shouldAskAmount('sleep', {})).toBe(false)
  })
})
