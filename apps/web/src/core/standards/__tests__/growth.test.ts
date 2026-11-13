import { describe, expect, it } from 'vitest'
import { isIndicatorVerified, lmsForDay, lmsForLengthCm, lmsTable, maxDay } from '../lms'
import { measurementAgeDays, measurementValue, zForMeasurement, zForWeightForLength } from '../growth'

const BORN = new Date(2026, 0, 1, 9, 0, 0)

describe('LMS tables', () => {
  it('loads the WHO table for the requested sex', () => {
    expect(lmsTable('wfa', 'M').sex).toBe('boys')
    expect(lmsTable('wfa', 'F').sex).toBe('girls')
    expect(lmsTable('wfa', 'M').unit).toBe('kg')
  })

  it('looks a row up by exact day', () => {
    const table = lmsTable('wfa', 'M')
    const day0 = lmsForDay(table, 0)
    expect(day0?.M).toBeCloseTo(3.3464, 4)
    expect(day0?.L).toBeCloseTo(0.3487, 4)
    expect(lmsForDay(table, 365)?.M).toBeCloseTo(9.646, 3)
    expect(maxDay(table)).toBe(731)
  })

  it('returns undefined outside the table', () => {
    const table = lmsTable('wfa', 'M')
    expect(lmsForDay(table, -1)).toBeUndefined()
    expect(lmsForDay(table, 9000)).toBeUndefined()
  })

  it('finds the nearest weight-for-length row', () => {
    const table = lmsTable('wfl', 'M')
    expect(lmsForLengthCm(table, 45)?.lengthCm).toBeCloseTo(45, 5)
    expect(lmsForLengthCm(table, 65.04)?.lengthCm).toBeCloseTo(65, 5)
    expect(lmsForLengthCm(table, 200)).toBeUndefined()
  })

  it('reports the verification flag from the data files', () => {
    // T005 (medical review) has not run yet.
    expect(isIndicatorVerified('wfa')).toBe(false)
  })
})

describe('growth z-scores', () => {
  const baby = { sex: 'M' as const, birthDate: BORN.toISOString(), gestationalWeeks: 40 }

  it('gives z = 0 at the median for a newborn', () => {
    const result = zForMeasurement({ date: BORN.toISOString(), weightG: 3346.4 }, baby, 'wfa')
    expect(result).not.toBeNull()
    expect(result?.z).toBeCloseTo(0, 2)
    expect(result?.band).toBe('normal')
    expect(result?.value).toBeCloseTo(3.3464, 3)
    expect(result?.verified).toBe(false)
  })

  it('uses corrected age for premature babies', () => {
    const premature = { ...baby, gestationalWeeks: 32 }
    const at = new Date(2026, 3, 11, 9, 0, 0) // exactly 100 days after birth -> 44 corrected
    expect(measurementAgeDays(premature, at)).toBe(44)
    expect(measurementAgeDays(baby, at)).toBe(100)

    const rawResult = zForMeasurement({ date: at.toISOString(), weightG: 6000 }, baby, 'wfa')
    const correctedResult = zForMeasurement({ date: at.toISOString(), weightG: 6000 }, premature, 'wfa')
    expect(rawResult?.ageDays).toBe(100)
    expect(correctedResult?.ageDays).toBe(44)
    expect(rawResult?.z).not.toBeCloseTo(correctedResult?.z ?? 0, 3)
  })

  it('returns null when the value is missing or the age is off-table', () => {
    expect(zForMeasurement({ date: BORN.toISOString(), weightG: undefined }, baby, 'wfa')).toBeNull()
    expect(zForMeasurement({ date: BORN.toISOString(), weightG: 0 }, baby, 'wfa')).toBeNull()
    const threeYears = new Date(2029, 0, 1)
    expect(zForMeasurement({ date: threeYears.toISOString(), weightG: 14000 }, baby, 'wfa')).toBeNull()
  })

  it('computes weight-for-length from weight and length', () => {
    const result = zForWeightForLength({ weightG: 7000, lengthCm: 65 }, baby)
    expect(result).not.toBeNull()
    expect(result?.unit).toBe('kg')
    if (result !== null) expect(Number.isFinite(result.z)).toBe(true)
  })

  it('maps measurement fields to the indicator unit', () => {
    expect(measurementValue({ weightG: 5200 }, 'wfa')).toBeCloseTo(5.2, 5)
    expect(measurementValue({ lengthCm: 58.4 }, 'lhfa')).toBeCloseTo(58.4, 5)
    expect(measurementValue({ headCm: 40.1 }, 'hcfa')).toBeCloseTo(40.1, 5)
    expect(measurementValue({ weightG: undefined }, 'wfa')).toBeNull()
  })
})
