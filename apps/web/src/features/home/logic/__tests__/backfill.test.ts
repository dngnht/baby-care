import { describe, expect, it } from 'vitest'
import {
  BACKFILL_OFFSET_MINUTES,
  parseBackfill,
  parseDateTimeLocal,
  previewDuration,
  suggestBackfillAt,
  toDateTimeLocal,
} from '../backfill'

const NOW = new Date(2026, 4, 20, 12, 34, 0)

describe('suggestBackfillAt', () => {
  it('defaults to two hours ago rounded down to five minutes', () => {
    const suggestion = suggestBackfillAt(NOW)
    expect(BACKFILL_OFFSET_MINUTES).toBe(120)
    expect(suggestion.getHours()).toBe(10)
    expect(suggestion.getMinutes()).toBe(30)
    expect(suggestion.getSeconds()).toBe(0)
  })

  it('accepts a different offset', () => {
    expect(suggestBackfillAt(NOW, 45).getMinutes()).toBe(45)
  })
})

describe('datetime-local helpers', () => {
  it('round-trips a date', () => {
    const value = toDateTimeLocal(new Date(2026, 10, 9, 7, 5))
    expect(value).toBe('2026-11-09T07:05')
    expect(parseDateTimeLocal(value)?.getTime()).toBe(new Date(2026, 10, 9, 7, 5).getTime())
  })

  it('rejects malformed and impossible dates', () => {
    expect(parseDateTimeLocal('2026-11-09 07:05')).toBeNull()
    expect(parseDateTimeLocal('2026-11-09T07:05:30')).toBeNull()
    expect(parseDateTimeLocal('2026-02-30T07:05')).toBeNull()
  })
})

describe('parseBackfill', () => {
  const at = '2026-05-20T10:30'

  it('builds a bottle feed with the edited amount', () => {
    const result = parseBackfill({ type: 'feed_bottle', at, amountMl: '140' }, NOW)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.startAt.getTime()).toBe(new Date(2026, 4, 20, 10, 30).getTime())
    expect(result.value.payload).toEqual({ amountMl: 140 })
    expect(result.value.endAt).toBeUndefined()
  })

  it('allows a bottle feed without an amount', () => {
    const result = parseBackfill({ type: 'feed_bottle', at, amountMl: '' }, NOW)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.payload).toEqual({})
  })

  it('rejects an impossible volume', () => {
    expect(parseBackfill({ type: 'feed_bottle', at, amountMl: '0' }, NOW)).toEqual({
      ok: false,
      error: 'value',
    })
    expect(parseBackfill({ type: 'feed_bottle', at, amountMl: 'abc' }, NOW)).toEqual({
      ok: false,
      error: 'value',
    })
  })

  it('keeps the selected side and diaper kind', () => {
    const breast = parseBackfill({ type: 'feed_breast', at, side: 'left' }, NOW)
    expect(breast.ok && breast.value.payload).toEqual({ side: 'left' })
    const diaper = parseBackfill({ type: 'diaper', at, diaperKind: 'dirty' }, NOW)
    expect(diaper.ok && diaper.value.payload).toEqual({ diaperKind: 'dirty' })
  })

  it('derives the sleep end from the duration', () => {
    const result = parseBackfill({ type: 'sleep', at, durationMinutes: '45' }, NOW)
    expect(result.ok).toBe(true)
    if (!result.ok || result.value.endAt === undefined) return
    expect((result.value.endAt.getTime() - result.value.startAt.getTime()) / 60_000).toBe(45)
  })

  it('rejects a sleep that would end in the future', () => {
    const result = parseBackfill({ type: 'sleep', at: '2026-05-20T12:00', durationMinutes: '120' }, NOW)
    expect(result).toEqual({ ok: false, error: 'time' })
  })

  it('rejects a future time and an unknown type', () => {
    expect(parseBackfill({ type: 'feed_bottle', at: '2026-05-20T13:00' }, NOW)).toEqual({
      ok: false,
      error: 'time',
    })
    expect(parseBackfill({ type: 'solid', at } as never, NOW)).toEqual({ ok: false, error: 'value' })
  })

  it('previews only a valid duration', () => {
    expect(previewDuration('60')).toBe(60)
    expect(previewDuration('0')).toBeNull()
    expect(previewDuration('')).toBeNull()
  })
})
