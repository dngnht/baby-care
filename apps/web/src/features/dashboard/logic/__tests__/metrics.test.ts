import { describe, expect, it } from 'vitest'
import type { LogEntry, LogPayload, LogType } from '../../../../core/db/schema'
import { compareToReference, computeMetrics } from '../metrics'

const NOW = new Date(2026, 2, 6, 12, 0, 0)

/** ISO timestamp `minutesAgo` minutes before NOW (negative = in the future). */
function iso(minutesAgo: number): string {
  return new Date(NOW.getTime() - minutesAgo * 60_000).toISOString()
}

interface EntryOptions {
  endAt?: string
  payload?: LogPayload
  id?: string
}

let sequence = 0

function entry(type: LogType, startAt: string, options: EntryOptions = {}): LogEntry {
  sequence += 1
  const base: LogEntry = {
    id: options.id ?? `log-${sequence}`,
    babyId: 'baby-1',
    type,
    startAt,
    payload: options.payload ?? {},
    createdBy: 'test',
  }
  return options.endAt === undefined ? base : { ...base, endAt: options.endAt }
}

describe('computeMetrics', () => {
  it('returns zeroes for an empty list', () => {
    expect(computeMetrics([], NOW)).toEqual({
      feedCount: 0,
      sleepMinutes: 0,
      wetDiapers: 0,
      solidCount: 0,
      entryCount: 0,
    })
  })

  it('counts breast and bottle feeds, keeping solid meals separate', () => {
    const metrics = computeMetrics(
      [
        entry('feed_breast', iso(60)),
        entry('feed_bottle', iso(180)),
        entry('feed_breast', iso(300)),
        entry('solid', iso(120)),
      ],
      NOW,
    )

    expect(metrics.feedCount).toBe(3)
    expect(metrics.solidCount).toBe(1)
    expect(metrics.entryCount).toBe(4)
  })

  it('adds finished sleeps and the sleep that is still running', () => {
    const metrics = computeMetrics(
      [
        entry('sleep', iso(300), { endAt: iso(210) }), // 90 minutes
        entry('sleep', iso(30)), // running: 30 minutes up to now
      ],
      NOW,
    )

    expect(metrics.sleepMinutes).toBe(120)
  })

  it('never counts a negative or unparseable sleep duration', () => {
    const metrics = computeMetrics(
      [
        entry('sleep', iso(10), { endAt: iso(60) }), // end before start
        entry('sleep', iso(20), { endAt: 'not-a-date' }),
      ],
      NOW,
    )

    expect(metrics.sleepMinutes).toBe(0)
  })

  it('counts wet and mixed diapers, not dirty ones', () => {
    const metrics = computeMetrics(
      [
        entry('diaper', iso(60), { payload: { diaperKind: 'wet' } }),
        entry('diaper', iso(120), { payload: { diaperKind: 'both' } }),
        entry('diaper', iso(180), { payload: { diaperKind: 'dirty' } }),
      ],
      NOW,
    )

    expect(metrics.wetDiapers).toBe(2)
  })

  it('ignores broken diaper payloads instead of guessing a kind', () => {
    const nullPayload = null as unknown as LogPayload
    const metrics = computeMetrics(
      [
        entry('diaper', iso(60), { payload: {} }),
        entry('diaper', iso(90), { payload: { diaperKind: 42 } }),
        entry('diaper', iso(120), { payload: { diaperKind: 'unknown' } }),
        entry('diaper', iso(150), { payload: nullPayload }),
      ],
      NOW,
    )

    expect(metrics.wetDiapers).toBe(0)
  })

  it('drops logs that started outside the 24-hour window', () => {
    const metrics = computeMetrics(
      [
        entry('feed_bottle', iso(60)), // inside
        entry('feed_bottle', iso(24 * 60 + 1)), // 24h + 1min ago -> outside
        entry('feed_bottle', iso(-30)), // in the future -> outside
      ],
      NOW,
    )

    expect(metrics.feedCount).toBe(1)
    expect(metrics.entryCount).toBe(1)
  })

  it('includes an entry exactly on the window edge', () => {
    const metrics = computeMetrics([entry('feed_bottle', iso(24 * 60))], NOW)
    expect(metrics.feedCount).toBe(1)
  })

  it('ignores entries with an unparseable start timestamp', () => {
    const metrics = computeMetrics(
      [entry('feed_bottle', 'not-a-date'), entry('diaper', 'not-a-date', { payload: { diaperKind: 'wet' } })],
      NOW,
    )

    expect(metrics).toEqual({
      feedCount: 0,
      sleepMinutes: 0,
      wetDiapers: 0,
      solidCount: 0,
      entryCount: 0,
    })
  })

  it('keeps sleep time of a running timer that started before the window out of the totals', () => {
    const metrics = computeMetrics([entry('sleep', iso(25 * 60))], NOW)
    expect(metrics.sleepMinutes).toBe(0)
  })

  it('does not mutate the input list', () => {
    const entries = [entry('feed_bottle', iso(60)), entry('feed_breast', iso(90))]
    const snapshot = entries.map((item) => item.id)

    computeMetrics(entries, NOW)

    expect(entries.map((item) => item.id)).toEqual(snapshot)
  })
})

describe('compareToReference', () => {
  it('sorts a value into below / within / above', () => {
    const range = { min: 8, max: 12 }

    expect(compareToReference(7, range)).toBe('below')
    expect(compareToReference(8, range)).toBe('within')
    expect(compareToReference(12, range)).toBe('within')
    expect(compareToReference(13, range)).toBe('above')
  })

  it('handles an open-ended range with only a lower bound', () => {
    const range = { min: 6 }

    expect(compareToReference(5, range)).toBe('below')
    expect(compareToReference(6, range)).toBe('within')
    expect(compareToReference(20, range)).toBe('within')
  })

  it('returns null when there is nothing to compare against', () => {
    expect(compareToReference(9, undefined)).toBeNull()
    expect(compareToReference(Number.NaN, { min: 8, max: 12 })).toBeNull()
  })
})
