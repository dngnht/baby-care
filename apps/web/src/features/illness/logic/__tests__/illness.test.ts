import { describe, expect, it } from 'vitest'
import type { LogEntry, LogPayload, LogType } from '../../../../core/db/schema'
import { addDays } from '../../../../core/time/day'
import {
  buildIllnessPayload,
  filterIllnessLogs,
  illnessWindow,
  NOTE_MAX_LENGTH,
  parseTempInput,
  summarizeIllness,
} from '../illness'

/** ISO UTC string for a local wall-clock time, so tests are timezone-safe. */
function iso(year: number, month: number, day: number, hour = 0, minute = 0): string {
  return new Date(year, month - 1, day, hour, minute).toISOString()
}

function entry(
  id: string,
  type: LogType,
  startAt: string,
  payload: LogPayload = {},
): LogEntry {
  return { id, babyId: 'baby-1', type, startAt, payload, createdBy: 'parent' }
}

function ids(items: readonly LogEntry[]): string[] {
  return items.map((item) => item.id)
}

/** Local `now` shared by the tests: 10/03/2026 09:00. */
const NOW = new Date(2026, 2, 10, 9, 0)

describe('illnessWindow', () => {
  it('spans the default 14 days ending now, local time preserved', () => {
    const { from, to } = illnessWindow(NOW)
    expect(from.toISOString()).toBe(addDays(NOW, -14).toISOString())
    expect(to.toISOString()).toBe(NOW.toISOString())
    expect(from.getHours()).toBe(NOW.getHours())
  })

  it('honours a custom number of days', () => {
    const { from } = illnessWindow(NOW, 7)
    expect(from.toISOString()).toBe(addDays(NOW, -7).toISOString())
  })

  it('collapses to a zero-width window for 0 days', () => {
    const { from, to } = illnessWindow(NOW, 0)
    expect(from.getTime()).toBe(NOW.getTime())
    expect(to.getTime()).toBe(NOW.getTime())
  })
})

describe('filterIllnessLogs', () => {
  it('keeps temp / symptom / med / note and drops other log types', () => {
    const list = [
      entry('temp', 'temp', iso(2026, 3, 10, 8), { tempC: 37.5 }),
      entry('feed', 'feed_bottle', iso(2026, 3, 10, 7), { amountMl: 120 }),
      entry('symptom', 'symptom', iso(2026, 3, 10, 6), { note: 'ho' }),
      entry('diaper', 'diaper', iso(2026, 3, 10, 5), { diaperKind: 'wet' }),
      entry('med', 'med', iso(2026, 3, 9, 20), { note: 'vitamin' }),
      entry('note', 'note', iso(2026, 3, 9, 18), { note: 'ăn ít' }),
      entry('sleep', 'sleep', iso(2026, 3, 9, 14), {}),
    ]

    expect(ids(filterIllnessLogs(list))).toEqual(['temp', 'symptom', 'med', 'note'])
  })

  it('sorts newest first without mutating the input', () => {
    const list = [
      entry('old', 'temp', iso(2026, 3, 1, 8)),
      entry('new', 'med', iso(2026, 3, 9, 8)),
      entry('middle', 'symptom', iso(2026, 3, 5, 8)),
    ]

    expect(ids(filterIllnessLogs(list))).toEqual(['new', 'middle', 'old'])
    expect(ids(list)).toEqual(['old', 'new', 'middle'])
  })

  it('drops rows older than the 14-day window and keeps both edges inclusive', () => {
    const window = illnessWindow(NOW)
    const list = [
      entry('edge-old', 'temp', window.from.toISOString()),
      entry('too-old', 'temp', addDays(window.from, -1).toISOString()),
      entry('now', 'symptom', NOW.toISOString()),
      entry('future', 'med', iso(2026, 3, 11, 9)),
    ]

    expect(ids(filterIllnessLogs(list, window))).toEqual(['now', 'edge-old'])
  })

  it('returns an empty list for an empty input', () => {
    expect(filterIllnessLogs([])).toEqual([])
  })
})

describe('summarizeIllness', () => {
  it('counts by type and reports the highest valid temperature', () => {
    const summary = summarizeIllness([
      entry('t1', 'temp', iso(2026, 3, 10, 8), { tempC: 37.5 }),
      entry('t2', 'temp', iso(2026, 3, 9, 20), { tempC: 38.4 }),
      entry('t3', 'temp', iso(2026, 3, 9, 8), { tempC: 36.9 }),
      entry('s1', 'symptom', iso(2026, 3, 10, 7), { note: 'ho' }),
      entry('m1', 'med', iso(2026, 3, 9, 21), { note: 'men tiêu hoá' }),
      entry('n1', 'note', iso(2026, 3, 9, 18), { note: 'bú ít' }),
      entry('feed', 'feed_bottle', iso(2026, 3, 10, 9), { amountMl: 120 }),
    ])

    expect(summary).toEqual({
      count: 6,
      tempCount: 3,
      symptomCount: 1,
      medCount: 1,
      tempMax: 38.4,
      lastAt: iso(2026, 3, 10, 8),
    })
  })

  it('ignores a malformed temperature payload when computing tempMax', () => {
    const summary = summarizeIllness([
      entry('bad', 'temp', iso(2026, 3, 10, 8), { tempC: 'nóng' }),
      entry('good', 'temp', iso(2026, 3, 10, 7), { tempC: 37.2 }),
    ])

    expect(summary.tempCount).toBe(2)
    expect(summary.tempMax).toBe(37.2)
  })

  it('omits tempMax and lastAt for an empty list', () => {
    const summary = summarizeIllness([])
    expect(summary).toEqual({ count: 0, tempCount: 0, symptomCount: 0, medCount: 0 })
    expect(summary.tempMax).toBeUndefined()
    expect(summary.lastAt).toBeUndefined()
  })

  it('reports the newest startAt as lastAt', () => {
    const summary = summarizeIllness([
      entry('old', 'med', iso(2026, 3, 1, 8)),
      entry('new', 'symptom', iso(2026, 3, 8, 22)),
    ])
    expect(summary.lastAt).toBe(iso(2026, 3, 8, 22))
  })
})

describe('buildIllnessPayload', () => {
  it('stores a valid temperature with one decimal', () => {
    expect(buildIllnessPayload('temp', { tempC: 37.5 })).toEqual({ tempC: 37.5 })
  })

  it('rounds a reading to one decimal', () => {
    expect(buildIllnessPayload('temp', { tempC: 37.55 })).toEqual({ tempC: 37.6 })
  })

  it('accepts the inclusive range edges', () => {
    expect(buildIllnessPayload('temp', { tempC: 34 })).toEqual({ tempC: 34 })
    expect(buildIllnessPayload('temp', { tempC: 42 })).toEqual({ tempC: 42 })
  })

  it('rejects temperatures outside 34–42 °C', () => {
    expect(buildIllnessPayload('temp', { tempC: 33.9 })).toBeNull()
    expect(buildIllnessPayload('temp', { tempC: 42.1 })).toBeNull()
  })

  it('rejects a missing or non-finite temperature', () => {
    expect(buildIllnessPayload('temp', {})).toBeNull()
    expect(buildIllnessPayload('temp', { tempC: Number.NaN })).toBeNull()
    expect(buildIllnessPayload('temp', { tempC: Number.POSITIVE_INFINITY })).toBeNull()
  })

  it('trims symptom text into a note payload', () => {
    expect(buildIllnessPayload('symptom', { text: '  ho khan  ' })).toEqual({ note: 'ho khan' })
  })

  it('stores medicine text as a note', () => {
    expect(buildIllnessPayload('med', { text: 'men tiêu hoá' })).toEqual({ note: 'men tiêu hoá' })
  })

  it('rejects empty and whitespace-only text', () => {
    expect(buildIllnessPayload('symptom', { text: '' })).toBeNull()
    expect(buildIllnessPayload('symptom', { text: '   ' })).toBeNull()
    expect(buildIllnessPayload('symptom', {})).toBeNull()
  })

  it('accepts exactly 200 characters and rejects 201', () => {
    const atLimit = 'a'.repeat(NOTE_MAX_LENGTH)
    expect(buildIllnessPayload('symptom', { text: atLimit })).toEqual({ note: atLimit })
    expect(buildIllnessPayload('symptom', { text: 'a'.repeat(NOTE_MAX_LENGTH + 1) })).toBeNull()
  })

  it('ignores a stray temperature when building a text payload', () => {
    expect(buildIllnessPayload('med', { tempC: 39, text: 'paracetamol' })).toEqual({
      note: 'paracetamol',
    })
  })
})

describe('parseTempInput', () => {
  it('parses a dot decimal', () => {
    expect(parseTempInput('37.5')).toBe(37.5)
  })

  it('accepts a comma decimal separator', () => {
    expect(parseTempInput('37,5')).toBe(37.5)
  })

  it('returns undefined for blank or non-numeric input', () => {
    expect(parseTempInput('')).toBeUndefined()
    expect(parseTempInput('   ')).toBeUndefined()
    expect(parseTempInput('nóng')).toBeUndefined()
  })
})
