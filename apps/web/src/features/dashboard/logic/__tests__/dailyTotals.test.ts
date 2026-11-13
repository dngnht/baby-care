import { describe, expect, it } from 'vitest'
import type { LogEntry, LogType } from '../../../../core/db/schema'
import type { DayTotals } from '../dailyTotals'
import {
  averageOf,
  buildDailyTotals,
  dayLabel,
  deltaOf,
  hasAnyData,
  todayTotals,
  yesterdayTotals,
} from '../dailyTotals'

const NOW = new Date(2026, 4, 20, 23, 0, 0)

let counter = 0
function log(
  type: LogType,
  start: Date,
  payload: Record<string, unknown> = {},
  end?: Date,
): LogEntry {
  counter += 1
  return {
    id: `log-${counter}`,
    babyId: 'baby-1',
    type,
    startAt: start.toISOString(),
    payload,
    createdBy: 'parent',
    ...(end === undefined ? {} : { endAt: end.toISOString() }),
  }
}

describe('buildDailyTotals', () => {
  it('returns one row per day, oldest first, including empty days', () => {
    const rows = buildDailyTotals([], 7, NOW)
    expect(rows).toHaveLength(7)
    expect(rows[6]?.dayKey).toBe('2026-05-20')
    expect(rows[0]?.dayKey).toBe('2026-05-14')
    expect(rows.every((row) => row.feedCount === 0 && row.sleepMinutes === 0)).toBe(true)
  })

  it('sums bottle volume and counts feeds without inventing breast volume', () => {
    const rows = buildDailyTotals(
      [
        log('feed_bottle', new Date(2026, 4, 20, 7, 0), { amountMl: 120 }),
        log('feed_bottle', new Date(2026, 4, 20, 11, 0), { amountMl: 90 }),
        log('feed_bottle', new Date(2026, 4, 20, 15, 0), { amountMl: 'lots' }),
        log('feed_breast', new Date(2026, 4, 20, 9, 0), { side: 'left' }),
        log('solid', new Date(2026, 4, 20, 17, 0)),
      ],
      7,
      NOW,
    )
    const today = rows[6]
    expect(today?.milkMl).toBe(210)
    expect(today?.feedCount).toBe(4)
    expect(today?.breastCount).toBe(1)
    expect(today?.bottleCount).toBe(3)
    expect(today?.solidCount).toBe(1)
  })

  it('counts every diaper and splits wet/dirty kinds', () => {
    const rows = buildDailyTotals(
      [
        log('diaper', new Date(2026, 4, 20, 6, 0), { diaperKind: 'wet' }),
        log('diaper', new Date(2026, 4, 20, 10, 0), { diaperKind: 'dirty' }),
        log('diaper', new Date(2026, 4, 20, 14, 0), { diaperKind: 'both' }),
        log('diaper', new Date(2026, 4, 19, 6, 0)),
      ],
      7,
      NOW,
    )
    const today = rows[6]
    expect(today?.diaperCount).toBe(3)
    expect(today?.wetDiapers).toBe(2)
    expect(today?.dirtyDiapers).toBe(2)
    expect(rows[5]?.diaperCount).toBe(1)
  })

  it('splits a sleep across midnight so both days get their share', () => {
    const rows = buildDailyTotals(
      [log('sleep', new Date(2026, 4, 19, 22, 0), {}, new Date(2026, 4, 20, 2, 0))],
      7,
      NOW,
    )
    expect(rows[5]?.sleepMinutes).toBe(120)
    expect(rows[6]?.sleepMinutes).toBe(120)
  })

  it('counts a running sleep up to now', () => {
    const rows = buildDailyTotals([log('sleep', new Date(2026, 4, 20, 21, 0))], 7, NOW)
    expect(rows[6]?.sleepMinutes).toBe(120)
  })

  it('ignores logs outside the window and future entries', () => {
    const rows = buildDailyTotals(
      [
        log('feed_bottle', new Date(2026, 3, 1, 8, 0), { amountMl: 500 }),
        log('feed_bottle', new Date(2026, 4, 21, 8, 0), { amountMl: 500 }),
      ],
      7,
      NOW,
    )
    expect(rows.every((row) => row.milkMl === 0)).toBe(true)
  })

  it('keeps days independent so they can be compared', () => {
    const rows = buildDailyTotals(
      [
        log('feed_bottle', new Date(2026, 4, 18, 8, 0), { amountMl: 400 }),
        log('feed_bottle', new Date(2026, 4, 19, 8, 0), { amountMl: 600 }),
        log('diaper', new Date(2026, 4, 19, 9, 0), { diaperKind: 'wet' }),
      ],
      7,
      NOW,
    )
    expect(rows[4]?.milkMl).toBe(400)
    expect(rows[5]?.milkMl).toBe(600)
    expect(todayTotals(rows)?.dayKey).toBe('2026-05-20')
    expect(yesterdayTotals(rows)?.milkMl).toBe(600)
  })
})

describe('aggregates', () => {
  const rows = buildDailyTotals(
    [
      log('feed_bottle', new Date(2026, 4, 18, 8, 0), { amountMl: 400 }),
      log('feed_bottle', new Date(2026, 4, 19, 8, 0), { amountMl: 600 }),
      log('diaper', new Date(2026, 4, 19, 9, 0), { diaperKind: 'wet' }),
    ],
    7,
    NOW,
  )

  it('averages a metric and returns null for no rows', () => {
    expect(averageOf(rows.slice(4, 6), 'milkMl')).toBe(500)
    expect(averageOf([], 'milkMl')).toBeNull()
  })

  it('computes a delta in the metric unit and handles a missing previous value', () => {
    expect(deltaOf(600, 400)).toBe(200)
    expect(deltaOf(600, null)).toBeNull()
  })

  it('detects whether any data exists in the window', () => {
    expect(hasAnyData(rows)).toBe(true)
    expect(hasAnyData(buildDailyTotals([], 7, NOW))).toBe(false)
  })

  it('labels today, yesterday and older days', () => {
    expect(dayLabel(rows[6] as DayTotals, rows)).toBe('today')
    expect(dayLabel(rows[5] as DayTotals, rows)).toBe('yesterday')
    expect(dayLabel(rows[0] as DayTotals, rows)).toBe('14/05')
  })
})
