import { describe, expect, it } from 'vitest'
import type { Baby, LogEntry, LogPayload, LogType, Measurement, VaccineDose } from '../../../../core/db/schema'
import {
  UPCOMING_DOSE_LIMIT,
  buildReportData,
  formatReportDate,
  formatReportTime,
} from '../report'

/** UTC timestamp: age arithmetic in these tests never depends on the test TZ. */
const utc = (year: number, month: number, day: number, hour = 8, minute = 0): Date =>
  new Date(Date.UTC(year, month, day, hour, minute))

const iso = (date: Date): string => date.toISOString()

const BIRTH = utc(2025, 0, 15)
const NOW = utc(2025, 3, 20, 12)

const baby: Baby = {
  id: 'baby-1',
  name: 'Bơ',
  sex: 'M',
  birthDate: iso(BIRTH),
  gestationalWeeks: 40,
}

function measurement(overrides: Omit<Partial<Measurement>, 'date'> & { date: Date }): Measurement {
  return { id: 'm-1', babyId: baby.id, ...overrides, date: iso(overrides.date) }
}

function dose(overrides: Omit<Partial<VaccineDose>, 'dueDate'> & { dueDate: Date }): VaccineDose {
  return {
    id: 'd-1',
    babyId: baby.id,
    vaccineCode: 'BCG',
    doseNo: 1,
    ...overrides,
    dueDate: iso(overrides.dueDate),
  }
}

function log(
  id: string,
  type: LogType,
  startAt: Date,
  extra: { endAt?: Date; payload?: LogPayload } = {},
): LogEntry {
  const entry: LogEntry = {
    id,
    babyId: baby.id,
    type,
    startAt: iso(startAt),
    payload: extra.payload ?? {},
    createdBy: 'parent',
  }
  if (extra.endAt !== undefined) entry.endAt = iso(extra.endAt)
  return entry
}

const minutesAfter = (date: Date, minutes: number): Date =>
  new Date(date.getTime() + minutes * 60_000)

describe('buildReportData profile', () => {
  it('reports the stored name, whole-day age and sex', () => {
    const data = buildReportData({ baby, measurements: [], doses: [], logs: [], now: NOW })

    expect(data.profile.name).toBe('Bơ')
    expect(data.profile.sex).toBe('M')
    // 2025-01-15 -> 2025-04-20 is exactly 95 days in UTC.
    expect(data.profile.ageDays).toBe(95)
  })

  it('leaves the corrected age equal to the real age for a term baby', () => {
    const data = buildReportData({ baby, measurements: [], doses: [], logs: [], now: NOW })

    expect(data.profile.correctedDays).toBe(data.profile.ageDays)
  })

  it('applies the premature correction to correctedDays only', () => {
    const premature: Baby = { ...baby, gestationalWeeks: 32 }
    const data = buildReportData({ baby: premature, measurements: [], doses: [], logs: [], now: NOW })

    expect(data.profile.ageDays).toBe(95)
    // 8 weeks early => 56 days of correction.
    expect(data.profile.correctedDays).toBe(39)
  })
})

describe('buildReportData growth', () => {
  const older = measurement({ id: 'old', date: utc(2025, 1, 15), weightG: 4800 })
  const newest = measurement({
    id: 'new',
    date: utc(2025, 3, 15),
    weightG: 6000,
    lengthCm: 60,
    headCm: 40,
  })

  it('is null when no measurement was ever recorded', () => {
    const data = buildReportData({ baby, measurements: [], doses: [], logs: [], now: NOW })

    expect(data.growth).toBeNull()
  })

  it('picks the newest measurement regardless of input order', () => {
    const ascending = buildReportData({
      baby,
      measurements: [older, newest],
      doses: [],
      logs: [],
      now: NOW,
    })
    const descending = buildReportData({
      baby,
      measurements: [newest, older],
      doses: [],
      logs: [],
      now: NOW,
    })

    expect(ascending.growth?.date).toBe(iso(utc(2025, 3, 15)))
    expect(descending.growth?.date).toBe(iso(utc(2025, 3, 15)))
  })

  it('converts grams to kilograms and keeps length and head circumference', () => {
    const data = buildReportData({
      baby,
      measurements: [older, newest],
      doses: [],
      logs: [],
      now: NOW,
    })

    expect(data.growth?.weightKg).toBe(6)
    expect(data.growth?.lengthCm).toBe(60)
    expect(data.growth?.headCm).toBe(40)
  })

  it('computes a z-score for all three indicators when the data allows it', () => {
    const data = buildReportData({
      baby,
      measurements: [newest],
      doses: [],
      logs: [],
      now: NOW,
    })
    const scores = data.growth?.scores ?? []

    expect(scores.map((score) => score.indicator)).toEqual(['wfa', 'lhfa', 'hcfa'])
    for (const score of scores) {
      expect(Number.isFinite(score.z)).toBe(true)
      expect(['severe_low', 'low', 'normal', 'high', 'severe_high']).toContain(score.band)
      expect(typeof score.verified).toBe('boolean')
    }
  })

  it('skips the indicators that cannot be computed', () => {
    const weightOnly = measurement({ id: 'w', date: utc(2025, 3, 15), weightG: 6000 })
    const data = buildReportData({
      baby,
      measurements: [weightOnly],
      doses: [],
      logs: [],
      now: NOW,
    })

    expect(data.growth?.scores.map((score) => score.indicator)).toEqual(['wfa'])
    expect(data.growth?.lengthCm).toBeUndefined()
  })

  it('keeps an empty score list when the measurement carries no value', () => {
    const empty = measurement({ id: 'empty', date: utc(2025, 3, 15) })
    const data = buildReportData({
      baby,
      measurements: [empty],
      doses: [],
      logs: [],
      now: NOW,
    })

    expect(data.growth).not.toBeNull()
    expect(data.growth?.scores).toEqual([])
  })
})

describe('buildReportData vaccines', () => {
  const doses: VaccineDose[] = [
    dose({ id: 'd-bcg', vaccineCode: 'BCG', doseNo: 1, dueDate: utc(2025, 0, 15), givenDate: iso(utc(2025, 0, 16)) }),
    dose({
      id: 'd-vgb',
      vaccineCode: 'VGB_SS',
      doseNo: 1,
      dueDate: utc(2025, 0, 15),
      givenDate: iso(utc(2025, 0, 16)),
    }),
    dose({ id: 'd-opv1', vaccineCode: 'OPV', doseNo: 1, dueDate: utc(2025, 2, 15) }),
    dose({ id: 'd-dpt1', vaccineCode: 'DPT_VGB_HIB', doseNo: 1, dueDate: utc(2025, 2, 15) }),
    dose({ id: 'd-opv2', vaccineCode: 'OPV', doseNo: 2, dueDate: utc(2025, 3, 15) }),
    dose({ id: 'd-dpt2', vaccineCode: 'DPT_VGB_HIB', doseNo: 2, dueDate: utc(2025, 3, 15) }),
  ]

  it('separates given doses from pending ones and counts both', () => {
    const data = buildReportData({ baby, measurements: [], doses, logs: [], now: NOW })

    expect(data.vaccines.givenCount).toBe(2)
    expect(data.vaccines.totalCount).toBe(6)
    expect(data.vaccines.given).toHaveLength(2)
  })

  it('names a given dose from the bundled schedule', () => {
    const data = buildReportData({ baby, measurements: [], doses, logs: [], now: NOW })

    expect(data.vaccines.given[0]?.name).toBe('Lao (BCG)')
    expect(data.vaccines.given[0]?.doseNo).toBe(1)
    expect(data.vaccines.given[0]?.givenDate).toBe(iso(utc(2025, 0, 16)))
  })

  it('lists the three nearest un-given doses by due date', () => {
    const data = buildReportData({ baby, measurements: [], doses, logs: [], now: NOW })

    expect(data.vaccines.next).toHaveLength(UPCOMING_DOSE_LIMIT)
    expect(data.vaccines.next.map((nextDose) => nextDose.dueDate)).toEqual([
      iso(utc(2025, 2, 15)),
      iso(utc(2025, 2, 15)),
      iso(utc(2025, 3, 15)),
    ])
    expect(data.vaccines.next[0]?.name).toBe('Bại liệt uống (bOPV)')
  })

  it('falls back to the vaccine code when the schedule has no name', () => {
    const unknown = dose({ id: 'd-x', vaccineCode: 'UNKNOWN', doseNo: 9, dueDate: utc(2025, 5, 1) })
    const data = buildReportData({ baby, measurements: [], doses: [unknown], logs: [], now: NOW })

    expect(data.vaccines.next[0]?.name).toBe('UNKNOWN')
  })

  it('is empty when no dose is stored', () => {
    const data = buildReportData({ baby, measurements: [], doses: [], logs: [], now: NOW })

    expect(data.vaccines).toEqual({ given: [], next: [], givenCount: 0, totalCount: 0 })
  })
})

describe('buildReportData recent', () => {
  const logs: LogEntry[] = [
    log('feed-1', 'feed_breast', minutesAfter(NOW, -120), { payload: { side: 'left' } }),
    log('feed-2', 'feed_bottle', minutesAfter(NOW, -180), { payload: { amountMl: 120 } }),
    log('solid-1', 'solid', minutesAfter(NOW, -200)),
    log('sleep-1', 'sleep', minutesAfter(NOW, -360), { endAt: minutesAfter(NOW, -240) }),
    log('diaper-wet', 'diaper', minutesAfter(NOW, -300), { payload: { diaperKind: 'wet' } }),
    log('diaper-both', 'diaper', minutesAfter(NOW, -1800), { payload: { diaperKind: 'both' } }),
    log('diaper-dirty', 'diaper', minutesAfter(NOW, -1860), { payload: { diaperKind: 'dirty' } }),
    log('temp-1', 'temp', minutesAfter(NOW, -2400), { payload: { tempC: 38.2 } }),
    // Outside the 48-hour window.
    log('feed-old', 'feed_breast', minutesAfter(NOW, -49 * 60)),
    // Not yet in the past.
    log('feed-future', 'feed_breast', minutesAfter(NOW, 60)),
  ]

  it('keeps only the logs that started inside the 48-hour window', () => {
    const data = buildReportData({ baby, measurements: [], doses: [], logs, now: NOW })

    expect(data.recent.logs).toHaveLength(8)
    expect(data.recent.logs.map((entry) => entry.id)).not.toContain('feed-old')
    expect(data.recent.logs.map((entry) => entry.id)).not.toContain('feed-future')
  })

  it('orders the kept logs newest first', () => {
    const data = buildReportData({ baby, measurements: [], doses: [], logs, now: NOW })

    expect(data.recent.logs[0]?.id).toBe('feed-1')
  })

  it('counts breast and bottle feeds but not solid meals', () => {
    const data = buildReportData({ baby, measurements: [], doses: [], logs, now: NOW })

    expect(data.recent.feedCount).toBe(2)
  })

  it('adds up the finished sleep only', () => {
    const data = buildReportData({ baby, measurements: [], doses: [], logs, now: NOW })

    expect(data.recent.sleepMinutes).toBe(120)
  })

  it('counts a wet and a mixed diaper as wet', () => {
    const data = buildReportData({ baby, measurements: [], doses: [], logs, now: NOW })

    expect(data.recent.diaperWet).toBe(2)
  })

  it('reports the highest temperature when one was logged', () => {
    const data = buildReportData({ baby, measurements: [], doses: [], logs, now: NOW })

    expect(data.recent.tempMax).toBe(38.2)
  })

  it('omits tempMax when no temperature was logged', () => {
    const withoutTemp = logs.filter((entry) => entry.type !== 'temp')
    const data = buildReportData({ baby, measurements: [], doses: [], logs: withoutTemp, now: NOW })

    expect(data.recent.tempMax).toBeUndefined()
    expect('tempMax' in data.recent).toBe(false)
  })

  it('counts a still-running sleep up to now', () => {
    const running = log('sleep-running', 'sleep', minutesAfter(NOW, -45))
    const data = buildReportData({ baby, measurements: [], doses: [], logs: [running], now: NOW })

    expect(data.recent.sleepMinutes).toBe(45)
  })
})

describe('buildReportData metadata', () => {
  it('stamps the generation time as the injected clock', () => {
    const data = buildReportData({ baby, measurements: [], doses: [], logs: [], now: NOW })

    expect(data.generatedAt).toBe(iso(NOW))
  })
})

describe('formatReportDate', () => {
  it('renders dd/MM/yyyy', () => {
    expect(formatReportDate(new Date(2025, 2, 5, 7, 5).toISOString())).toBe('05/03/2025')
  })

  it('pads a single-digit day and month', () => {
    expect(formatReportDate(new Date(2024, 11, 31, 23, 59).toISOString())).toBe('31/12/2024')
  })

  it('returns an empty string for an unparseable timestamp', () => {
    expect(formatReportDate('not-a-date')).toBe('')
  })
})

describe('formatReportTime', () => {
  it('renders HH:mm', () => {
    expect(formatReportTime(new Date(2025, 2, 5, 7, 5).toISOString())).toBe('07:05')
  })

  it('keeps midnight as 00:00', () => {
    expect(formatReportTime(new Date(2025, 2, 5, 0, 0).toISOString())).toBe('00:00')
  })
})
