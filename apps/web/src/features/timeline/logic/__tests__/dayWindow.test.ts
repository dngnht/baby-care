import { describe, expect, it } from 'vitest'
import type { LogEntry } from '../../../../core/db/schema'
import { toDayKey } from '../../../../core/time/day'
import { applyTimeChange, dayRange, sortNewestFirst, withTimeOfDay } from '../dayWindow'

function entry(partial: Partial<LogEntry> & Pick<LogEntry, 'startAt'>): LogEntry {
  return {
    id: partial.id ?? 'log-1',
    babyId: 'baby-1',
    type: partial.type ?? 'feed_bottle',
    startAt: partial.startAt,
    payload: partial.payload ?? {},
    createdBy: partial.createdBy ?? 'test',
    ...(partial.endAt === undefined ? {} : { endAt: partial.endAt }),
  }
}

describe('dayRange', () => {
  it('covers the whole local day, inclusive on both ends', () => {
    const noon = new Date(2026, 2, 6, 12, 30, 15, 500)
    const { from, to } = dayRange(noon)

    expect(from.getHours()).toBe(0)
    expect(from.getMinutes()).toBe(0)
    expect(from.getSeconds()).toBe(0)
    expect(from.getMilliseconds()).toBe(0)

    expect(to.getHours()).toBe(23)
    expect(to.getMinutes()).toBe(59)
    expect(to.getSeconds()).toBe(59)
    expect(to.getMilliseconds()).toBe(999)

    expect(toDayKey(from)).toBe(toDayKey(noon))
    expect(toDayKey(to)).toBe(toDayKey(noon))
  })

  it('does not mutate the day it receives', () => {
    const day = new Date(2026, 2, 6, 12, 30)
    dayRange(day)
    expect(day.getHours()).toBe(12)
    expect(day.getMinutes()).toBe(30)
  })
})

describe('applyTimeChange', () => {
  it('moves the start to the given local time on the same day', () => {
    const start = new Date(2026, 2, 6, 8, 30, 0)
    const { startAt } = applyTimeChange(entry({ startAt: start.toISOString() }), '08:30')

    expect(startAt?.toISOString()).toBe(start.toISOString())
    expect(startAt?.getHours()).toBe(8)
    expect(startAt?.getMinutes()).toBe(30)
  })

  it('zeroes seconds so a time input always round-trips', () => {
    const start = new Date(2026, 2, 6, 6, 15, 42, 900)
    const { startAt } = applyTimeChange(entry({ startAt: start.toISOString() }), '07:05')

    expect(startAt?.getHours()).toBe(7)
    expect(startAt?.getMinutes()).toBe(5)
    expect(startAt?.getSeconds()).toBe(0)
    expect(startAt?.getMilliseconds()).toBe(0)
  })

  it('keeps the local calendar day, even late at night', () => {
    const lateNight = new Date(2026, 2, 6, 23, 50, 0)
    const before = applyTimeChange(entry({ startAt: lateNight.toISOString() }), '00:10')
    const after = applyTimeChange(entry({ startAt: lateNight.toISOString() }), '23:55')

    expect(toDayKey(before.startAt as Date)).toBe('2026-03-06')
    expect(toDayKey(after.startAt as Date)).toBe('2026-03-06')
    // A time earlier than midnight does NOT roll the date forward or back.
    expect(before.startAt?.getDate()).toBe(6)
    expect(after.startAt?.getDate()).toBe(6)
  })

  it('keeps an endAt that is still after the new start', () => {
    const start = new Date(2026, 2, 6, 10, 0, 0)
    const end = new Date(2026, 2, 6, 11, 0, 0)
    const patch = applyTimeChange(entry({ type: 'sleep', startAt: start.toISOString(), endAt: end.toISOString() }), '10:15')

    expect(patch.endAt?.toISOString()).toBe(end.toISOString())
  })

  it('pulls endAt up to startAt when the new start passes it', () => {
    const start = new Date(2026, 2, 6, 10, 0, 0)
    const end = new Date(2026, 2, 6, 10, 30, 0)
    const patch = applyTimeChange(entry({ type: 'sleep', startAt: start.toISOString(), endAt: end.toISOString() }), '11:00')

    expect(patch.startAt?.getTime()).toBe(new Date(2026, 2, 6, 11, 0, 0).getTime())
    expect(patch.endAt?.getTime()).toBe(patch.startAt?.getTime())
  })

  it('returns an empty patch for malformed or out-of-range input', () => {
    const base = entry({ startAt: new Date(2026, 2, 6, 8, 0, 0).toISOString() })

    expect(applyTimeChange(base, '25:99')).toEqual({})
    expect(applyTimeChange(base, '24:00')).toEqual({})
    expect(applyTimeChange(base, '08:60')).toEqual({})
    expect(applyTimeChange(base, '8:3')).toEqual({})
    expect(applyTimeChange(base, '')).toEqual({})
    expect(applyTimeChange(base, 'ab:cd')).toEqual({})
  })

  it('returns an empty patch when the stored startAt is unparseable', () => {
    expect(applyTimeChange(entry({ startAt: 'not-a-date' }), '08:30')).toEqual({})
  })
})

describe('withTimeOfDay', () => {
  it('accepts a single-digit hour and rejects impossible times', () => {
    const base = new Date(2026, 2, 6, 6, 15, 0).toISOString()

    expect(withTimeOfDay(base, '8:30')?.getHours()).toBe(8)
    expect(withTimeOfDay(base, '08:30')?.getMinutes()).toBe(30)
    expect(withTimeOfDay(base, '23:59')?.getHours()).toBe(23)
    expect(withTimeOfDay(base, '24:00')).toBeUndefined()
    expect(withTimeOfDay(base, '12:60')).toBeUndefined()
    expect(withTimeOfDay(base, 'nope')).toBeUndefined()
  })
})

describe('sortNewestFirst', () => {
  it('orders newest first without mutating the input', () => {
    const oldest = entry({ id: 'a', startAt: new Date(2026, 2, 6, 7, 0, 0).toISOString() })
    const newest = entry({ id: 'b', startAt: new Date(2026, 2, 6, 18, 0, 0).toISOString() })
    const middle = entry({ id: 'c', startAt: new Date(2026, 2, 6, 12, 0, 0).toISOString() })
    const input = [oldest, newest, middle]

    const sorted = sortNewestFirst(input)

    expect(sorted.map((item) => item.id)).toEqual(['b', 'c', 'a'])
    expect(input.map((item) => item.id)).toEqual(['a', 'b', 'c'])
  })

  it('is stable for entries sharing the same timestamp', () => {
    const startAt = new Date(2026, 2, 6, 9, 0, 0).toISOString()
    const first = entry({ id: 'first', startAt })
    const second = entry({ id: 'second', startAt })
    const third = entry({ id: 'third', startAt })

    expect(sortNewestFirst([first, second, third]).map((item) => item.id)).toEqual([
      'first',
      'second',
      'third',
    ])
  })

  it('keeps unparseable timestamps last', () => {
    const valid = entry({ id: 'valid', startAt: new Date(2026, 2, 6, 9, 0, 0).toISOString() })
    const broken = entry({ id: 'broken', startAt: 'nope' })

    expect(sortNewestFirst([broken, valid]).map((item) => item.id)).toEqual(['valid', 'broken'])
  })
})
