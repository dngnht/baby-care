import { describe, expect, it } from 'vitest'
import type { Baby, Measurement } from '../../../../core/db/schema'
import { lmsForDay, lmsTable, maxDay, type LmsTable } from '../../../../core/standards/lms'
import { zFromLMS } from '../../../../core/standards/zscore'
import { buildBabyPoints, buildSdSeries, chartDomain } from '../chartSeries'

const WFA_BOYS = lmsTable('wfa', 'M')
const LHFA_GIRLS = lmsTable('lhfa', 'F')

const BIRTH = new Date(2026, 0, 1, 9, 0, 0)

const BABY: Baby = {
  id: 'baby-1',
  name: 'Bơ',
  sex: 'M',
  birthDate: BIRTH.toISOString(),
  gestationalWeeks: 40,
}

function atDay(day: number): string {
  return new Date(2026, 0, 1 + day, 9, 0, 0).toISOString()
}

function measurement(id: string, day: number, fields: Partial<Measurement>): Measurement {
  return { id, babyId: BABY.id, date: atDay(day), ...fields }
}

/** A day table whose rows all have L = 0 (the exponential limit branch). */
const L_ZERO_TABLE: LmsTable = {
  indicator: 'wfa',
  indicator_name: 'test',
  sex: 'boys',
  dimension: 'day',
  unit: 'kg',
  verified: false,
  data: Array.from({ length: 15 }, (_, index) => ({
    day: index * 7,
    L: 0,
    M: 10,
    S: 0.1,
  })),
}

describe('buildSdSeries', () => {
  it('returns the seven WHO SD bands in order', () => {
    const series = buildSdSeries(WFA_BOYS)
    expect(series).toHaveLength(7)
    expect(series.map((entry) => entry.band)).toEqual([-3, -2, -1, 0, 1, 2, 3])
  })

  it('samples every 7 days from 0 to the last table day', () => {
    const points = buildSdSeries(WFA_BOYS)[0]?.points ?? []
    const last = maxDay(WFA_BOYS)

    expect(points[0]?.ageDays).toBe(0)
    expect(points[points.length - 1]?.ageDays).toBe(last)
    for (let index = 1; index < points.length - 1; index += 1) {
      expect(points[index]?.ageDays).toBe((points[index - 1]?.ageDays ?? 0) + 7)
    }
    // Weekly sampling of a 24-month table stays ~100 points: light on the DOM.
    expect(points.length).toBeLessThan(120)
  })

  it('honours a custom step and still includes the final day', () => {
    const points = buildSdSeries(WFA_BOYS, 30)[0]?.points ?? []
    expect(points.slice(0, 3).map((point) => point.ageDays)).toEqual([0, 30, 60])
    expect(points[points.length - 1]?.ageDays).toBe(maxDay(WFA_BOYS))
  })

  it('keeps the 0 SD curve exactly on the median M at every point', () => {
    const median = buildSdSeries(WFA_BOYS).find((entry) => entry.band === 0)
    expect(median).toBeDefined()

    for (const point of median?.points ?? []) {
      const row = lmsForDay(WFA_BOYS, point.ageDays)
      expect(row).toBeDefined()
      expect(point.value).toBeCloseTo(row?.M ?? 0, 10)
    }
  })

  it('places the +2 SD curve where zFromLMS(value) = 2', () => {
    const plusTwo = buildSdSeries(WFA_BOYS).find((entry) => entry.band === 2)
    expect(plusTwo?.points.length).toBeGreaterThan(0)

    for (const point of plusTwo?.points ?? []) {
      const row = lmsForDay(WFA_BOYS, point.ageDays)
      expect(row).toBeDefined()
      if (row !== undefined) expect(zFromLMS(point.value, row)).toBeCloseTo(2, 6)
    }
  })

  it('uses the exponential form when L = 0 instead of producing NaN', () => {
    const series = buildSdSeries(L_ZERO_TABLE)

    for (const entry of series) {
      for (const point of entry.points) {
        expect(Number.isFinite(point.value)).toBe(true)
      }
    }

    const firstValue = (band: number): number =>
      series.find((entry) => entry.band === band)?.points[0]?.value ?? Number.NaN

    expect(firstValue(0)).toBeCloseTo(10, 10)
    expect(firstValue(3)).toBeCloseTo(10 * Math.exp(0.3), 10)
    expect(firstValue(-3)).toBeCloseTo(10 * Math.exp(-0.3), 10)
  })

  it('returns nothing for a non day-based table', () => {
    expect(buildSdSeries(lmsTable('wfl', 'M'))).toEqual([])
  })
})

describe('buildBabyPoints', () => {
  it('keeps valid points, sorted by age', () => {
    const points = buildBabyPoints(
      [
        measurement('m-30', 30, { weightG: 4800 }),
        measurement('m-0', 0, { weightG: 3346.4 }),
        measurement('m-14', 14, { weightG: 3900 }),
      ],
      BABY,
      'wfa',
    )

    expect(points.map((point) => point.ageDays)).toEqual([0, 14, 30])
    expect(points.map((point) => point.value)).toEqual([3.3464, 3.9, 4.8])
    expect(points[0]?.z).toBeCloseTo(0, 2)
  })

  it('drops points with a missing value or an age outside the table', () => {
    const points = buildBabyPoints(
      [
        measurement('no-weight', 10, { lengthCm: 55 }),
        measurement('too-old', 900, { weightG: 12000 }),
        measurement('zero', 5, { weightG: 0 }),
        measurement('kept', 20, { weightG: 4200 }),
      ],
      BABY,
      'wfa',
    )

    expect(points).toHaveLength(1)
    expect(points[0]?.ageDays).toBe(20)
  })

  it('matches the measurement field to the selected indicator', () => {
    const baby: Baby = { ...BABY, sex: 'F' }
    const points = buildBabyPoints(
      [
        measurement('weight', 60, { weightG: 6000 }),
        measurement('length', 60, { lengthCm: 60.5 }),
        measurement('head', 60, { headCm: 40 }),
      ],
      baby,
      'lhfa',
    )

    expect(points).toHaveLength(1)
    expect(points[0]?.value).toBeCloseTo(60.5, 5)
  })

  it('uses corrected age for premature babies', () => {
    const premature: Baby = { ...BABY, gestationalWeeks: 32 }
    const points = buildBabyPoints(
      [measurement('m-100', 100, { weightG: 6000 })],
      premature,
      'wfa',
    )

    // 8 weeks early -> 56 days of correction.
    expect(points[0]?.ageDays).toBe(44)
  })

  it('returns an empty list when nothing is measurable', () => {
    expect(buildBabyPoints([], BABY, 'wfa')).toEqual([])
  })
})

describe('chartDomain', () => {
  it('spans the full ±3 SD band and the table age range', () => {
    const domain = chartDomain(WFA_BOYS, 'wfa')
    const series = buildSdSeries(WFA_BOYS)
    const outerValues = series
      .filter((entry) => entry.band === -3 || entry.band === 3)
      .flatMap((entry) => entry.points.map((point) => point.value))

    expect(domain.xMax).toBe(maxDay(WFA_BOYS))
    expect(domain.yMin).toBeLessThan(Math.min(...outerValues))
    expect(domain.yMax).toBeGreaterThan(Math.max(...outerValues))
    expect(domain.yMin).toBeGreaterThanOrEqual(0)
  })

  it('rounds the weight axis to half a kilo', () => {
    const domain = chartDomain(WFA_BOYS, 'wfa')
    expect(domain.yMin * 2).toBeCloseTo(Math.round(domain.yMin * 2), 10)
    expect(domain.yMax * 2).toBeCloseTo(Math.round(domain.yMax * 2), 10)
  })

  it('rounds the centimetre axis to whole centimetres', () => {
    const domain = chartDomain(LHFA_GIRLS, 'lhfa')
    expect(Number.isInteger(domain.yMin)).toBe(true)
    expect(Number.isInteger(domain.yMax)).toBe(true)
  })
})
