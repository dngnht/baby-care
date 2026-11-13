import { describe, expect, it } from 'vitest'
import { MS_PER_DAY } from '../../../../core/time/day'
import {
  DEFAULT_GESTATIONAL_WEEKS,
  describeAge,
  parseBirthDate,
  validateGestationalWeeks,
} from '../age'

/** Local midnight, the shape the date input produces. */
const at = (year: number, month: number, day: number): Date => new Date(year, month - 1, day)

/** ISO 8601 form of a local-midnight date, as stored by the repository. */
const iso = (date: Date): string => date.toISOString()

const daysAfter = (date: Date, days: number): Date =>
  new Date(date.getTime() + days * MS_PER_DAY)

describe('parseBirthDate', () => {
  it('parses a date-input value into local midnight', () => {
    const parsed = parseBirthDate('2026-01-15')
    expect(parsed).not.toBeNull()
    expect(parsed?.getFullYear()).toBe(2026)
    expect(parsed?.getMonth()).toBe(0)
    expect(parsed?.getDate()).toBe(15)
    expect(parsed?.getHours()).toBe(0)
    expect(parsed?.getMinutes()).toBe(0)
    expect(parsed?.getSeconds()).toBe(0)
    expect(parsed?.getMilliseconds()).toBe(0)
  })

  it('tolerates surrounding whitespace', () => {
    expect(parseBirthDate('  2026-03-02  ')?.getDate()).toBe(2)
  })

  it('returns null for empty or malformed values', () => {
    expect(parseBirthDate('')).toBeNull()
    expect(parseBirthDate('   ')).toBeNull()
    expect(parseBirthDate('15/01/2026')).toBeNull()
    expect(parseBirthDate('2026-1-5')).toBeNull()
    expect(parseBirthDate('not-a-date')).toBeNull()
  })

  it('returns null for dates that do not exist', () => {
    expect(parseBirthDate('2026-02-30')).toBeNull()
    expect(parseBirthDate('2026-13-01')).toBeNull()
  })

  it('returns null for a future date but accepts today', () => {
    const now = at(2026, 11, 8)
    expect(parseBirthDate('2026-11-09', now)).toBeNull()
    expect(parseBirthDate('2027-01-01', now)).toBeNull()
    expect(parseBirthDate('2026-11-08', now)).not.toBeNull()
    expect(parseBirthDate('2026-11-07', now)).not.toBeNull()
  })
})

describe('validateGestationalWeeks', () => {
  it('accepts the inclusive bounds', () => {
    expect(validateGestationalWeeks('22')).toBe(22)
    expect(validateGestationalWeeks('42')).toBe(42)
  })

  it('accepts an in-range value with whitespace', () => {
    expect(validateGestationalWeeks(' 40 ')).toBe(40)
    expect(validateGestationalWeeks('37')).toBe(37)
  })

  it('rejects values below 22 or above 42', () => {
    expect(validateGestationalWeeks('21')).toBeNull()
    expect(validateGestationalWeeks('43')).toBeNull()
    expect(validateGestationalWeeks('0')).toBeNull()
    expect(validateGestationalWeeks('100')).toBeNull()
  })

  it('rejects empty, non-numeric and non-integer values', () => {
    expect(validateGestationalWeeks('')).toBeNull()
    expect(validateGestationalWeeks('abc')).toBeNull()
    expect(validateGestationalWeeks('40.5')).toBeNull()
    expect(validateGestationalWeeks('-40')).toBeNull()
  })

  it('defaults to a full-term pregnancy', () => {
    expect(DEFAULT_GESTATIONAL_WEEKS).toBe(40)
    expect(validateGestationalWeeks(String(DEFAULT_GESTATIONAL_WEEKS))).toBe(40)
  })
})

describe('describeAge', () => {
  const birth = at(2026, 1, 1)
  const now = daysAfter(birth, 100)

  it('corrects the age of a baby born at 32 weeks (100 days -> 44 days)', () => {
    expect(describeAge({ birthDate: iso(birth), gestationalWeeks: 32 }, now)).toEqual({
      days: 100,
      correctedDays: 44,
      isPremature: true,
    })
  })

  it('does not correct a baby born at 38 weeks', () => {
    expect(describeAge({ birthDate: iso(birth), gestationalWeeks: 38 }, now)).toEqual({
      days: 100,
      correctedDays: 100,
      isPremature: false,
    })
  })

  it('does not correct at 37 weeks or above, but does below', () => {
    expect(describeAge({ birthDate: iso(birth), gestationalWeeks: 37 }, now).isPremature).toBe(false)
    expect(describeAge({ birthDate: iso(birth), gestationalWeeks: 36 }, now).isPremature).toBe(true)
  })

  it('keeps full-term babies unadjusted', () => {
    const age = describeAge({ birthDate: iso(birth), gestationalWeeks: 40 }, now)
    expect(age.correctedDays).toBe(age.days)
    expect(age.isPremature).toBe(false)
  })

  it('never returns a negative age (born today)', () => {
    const today = at(2026, 1, 1)
    expect(describeAge({ birthDate: iso(birth), gestationalWeeks: 32 }, today)).toEqual({
      days: 0,
      correctedDays: 0,
      isPremature: true,
    })
  })

  it('reports prematurity even when the correction is clamped to zero', () => {
    const age = describeAge({ birthDate: iso(birth), gestationalWeeks: 28 }, birth)
    expect(age.correctedDays).toBe(0)
    expect(age.isPremature).toBe(true)
  })

  it('handles a stored UTC timestamp without timezone surprises', () => {
    const age = describeAge({ birthDate: '2026-01-01T00:00:00.000Z', gestationalWeeks: 32 }, now)
    expect(age.days).toBe(100)
    expect(age.correctedDays).toBe(44)
  })

  it('falls back to zeros for an invalid stored date', () => {
    expect(describeAge({ birthDate: 'nope', gestationalWeeks: 32 }, now)).toEqual({
      days: 0,
      correctedDays: 0,
      isPremature: false,
    })
  })
})
