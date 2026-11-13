import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Baby, Measurement } from '../../../../core/db/schema'

/**
 * Two boundaries of this logic are stubbed:
 * - `isIndicatorVerified`, because the shipped WHO tables are still
 *   `verified: false` and the test must also cover the reviewed state;
 * - `zForMeasurement`, so a delta can be exactly −0.67 SD (the threshold
 *   boundary) without depending on floating-point table arithmetic.
 * Anything without a stub falls through to the real implementation.
 */
const state = vi.hoisted(() => ({
  verified: false,
  zById: new Map<string, number>(),
}))

vi.mock('../../../../core/standards/lms', async (importOriginal) => {
  // `typeof import()` is the only way to type vitest's dynamic original module.
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import('../../../../core/standards/lms')>()
  return { ...actual, isIndicatorVerified: () => state.verified }
})

vi.mock('../../../../core/standards/growth', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import('../../../../core/standards/growth')>()
  const { classify } = await import('../../../../core/standards/zscore')
  return {
    ...actual,
    zForMeasurement: (
      measurement: Parameters<typeof actual.zForMeasurement>[0],
      baby: Parameters<typeof actual.zForMeasurement>[1],
      indicator: Parameters<typeof actual.zForMeasurement>[2],
    ) => {
      const id = (measurement as { id?: string }).id
      const stub = id === undefined ? undefined : state.zById.get(id)
      const real = actual.zForMeasurement(measurement, baby, indicator)
      if (stub === undefined) return real
      if (real !== null) return { ...real, z: stub, band: classify(stub), verified: state.verified }
      // Still keep the real (corrected) age so the test measures the same path.
      return {
        z: stub,
        band: classify(stub),
        verified: state.verified,
        value: 1,
        unit: 'kg' as const,
        ageDays: actual.measurementAgeDays(baby, new Date(measurement.date)),
      }
    },
  }
})

import { VELOCITY_DROP_THRESHOLD_SD, assessVelocity } from '../velocity'

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

function measurement(id: string, day: number, fields: Partial<Measurement> = {}): Measurement {
  return { id, babyId: BABY.id, date: atDay(day), weightG: 3500, ...fields }
}

/** Stub the z-score of the given measurements, keyed by id. */
function stubZ(values: Record<string, number>): void {
  for (const [id, z] of Object.entries(values)) state.zById.set(id, z)
}

beforeEach(() => {
  state.verified = false
  state.zById.clear()
})

describe('VELOCITY_DROP_THRESHOLD_SD', () => {
  it('is the documented 0.67 SD threshold', () => {
    expect(VELOCITY_DROP_THRESHOLD_SD).toBe(0.67)
  })
})

describe('assessVelocity', () => {
  it('returns insufficient for no point or a single point', () => {
    const empty = assessVelocity([], BABY, 'wfa')
    expect(empty.status).toBe('insufficient')
    expect(empty.points).toEqual([])
    expect(empty.drop).toBeUndefined()

    const single = assessVelocity([measurement('m0', 0)], BABY, 'wfa')
    expect(single.status).toBe('insufficient')
    expect(single.points).toHaveLength(1)
    expect(single.drop).toBeUndefined()
  })

  it('reports the drop but stays unverified while the WHO table awaits review', () => {
    stubZ({ 'm0': 0.3, 'm30': -0.5 })

    const result = assessVelocity([measurement('m0', 0), measurement('m30', 30)], BABY, 'wfa')

    expect(result.status).toBe('unverified')
    expect(result.points).toHaveLength(2)
    expect(result.drop?.deltaZ).toBeCloseTo(-0.8, 10)
    expect(result.drop?.days).toBe(30)
    expect(result.drop?.fromDate).toBe(atDay(0))
    expect(result.drop?.toDate).toBe(atDay(30))
  })

  it('stays unverified for a rise too, without inventing a drop', () => {
    stubZ({ 'm0': 0.4, 'm30': 1.2 })

    const result = assessVelocity([measurement('m0', 0), measurement('m30', 30)], BABY, 'wfa')

    expect(result.status).toBe('unverified')
    expect(result.drop).toBeUndefined()
  })

  it('returns ok for a rise once the indicator is verified', () => {
    state.verified = true
    stubZ({ 'm0': 0.4, 'm30': 1.2 })

    const result = assessVelocity([measurement('m0', 0), measurement('m30', 30)], BABY, 'wfa')

    expect(result.status).toBe('ok')
    expect(result.drop).toBeUndefined()
  })

  it('returns a real drop once the indicator is verified', () => {
    state.verified = true
    stubZ({ 'm0': 0.3, 'm30': -0.5 })

    const result = assessVelocity([measurement('m0', 0), measurement('m30', 30)], BABY, 'wfa')

    expect(result.status).toBe('drop')
    expect(result.drop?.deltaZ).toBeCloseTo(-0.8, 10)
    expect(result.drop?.days).toBe(30)
  })

  it('treats exactly −0.67 SD as a drop and −0.66 SD as ok', () => {
    state.verified = true

    stubZ({ 'm0': 0, 'at-threshold': -VELOCITY_DROP_THRESHOLD_SD })
    const atThreshold = assessVelocity(
      [measurement('m0', 0), measurement('at-threshold', 30)],
      BABY,
      'wfa',
    )
    expect(atThreshold.status).toBe('drop')
    expect(atThreshold.drop?.deltaZ).toBe(-VELOCITY_DROP_THRESHOLD_SD)

    stubZ({ 'below-threshold': -0.66 })
    const belowThreshold = assessVelocity(
      [measurement('m0', 0), measurement('below-threshold', 30)],
      BABY,
      'wfa',
    )
    expect(belowThreshold.status).toBe('ok')
    expect(belowThreshold.drop).toBeUndefined()
  })

  it('skips measurements that cannot produce a z-score', () => {
    state.verified = true
    stubZ({ 'm0': 0.3, 'm30': -0.5 })

    const result = assessVelocity(
      [
        measurement('m0', 0),
        // No weight -> no weight-for-age z-score.
        measurement('no-weight', 15, { weightG: undefined, lengthCm: 55 }),
        measurement('m30', 30),
      ],
      BABY,
      'wfa',
    )

    expect(result.points.map((point) => point.date)).toEqual([atDay(0), atDay(30)])
    expect(result.drop?.days).toBe(30)
  })

  it('compares consecutive pairs only and keeps the steepest drop', () => {
    state.verified = true
    // All-pairs would flag day 0 -> day 30 (+2.0 to +0.9); consecutive pairs
    // give −0.4, +0.1 and −0.8, so the last pair is the one to report.
    stubZ({ 'd0': 2.0, 'd10': 1.6, 'd20': 1.7, 'd30': 0.9 })

    const result = assessVelocity(
      [
        measurement('d0', 0),
        measurement('d10', 10),
        measurement('d20', 20),
        measurement('d30', 30),
      ],
      BABY,
      'wfa',
    )

    expect(result.status).toBe('drop')
    expect(result.drop?.deltaZ).toBeCloseTo(-0.8, 10)
    expect(result.drop?.fromDate).toBe(atDay(20))
    expect(result.drop?.toDate).toBe(atDay(30))
    expect(result.drop?.days).toBe(10)
  })

  it('sorts out-of-order input by date', () => {
    stubZ({ 'late': 0.3, 'early': -0.5 })

    const result = assessVelocity([measurement('late', 30), measurement('early', 0)], BABY, 'wfa')

    expect(result.points.map((point) => point.ageDays)).toEqual([0, 30])
    expect(result.points.map((point) => point.z)).toEqual([-0.5, 0.3])
    expect(result.drop).toBeUndefined()
  })

  it('ignores future-dated measurements relative to now', () => {
    const now = new Date(2026, 0, 21, 9, 0, 0)
    stubZ({ 'future': -2 })

    const result = assessVelocity(
      [measurement('m0', 0), measurement('future', 60)],
      BABY,
      'wfa',
      now,
    )

    expect(result.points).toHaveLength(1)
    expect(result.status).toBe('insufficient')
  })

  it('uses corrected age for premature babies', () => {
    const premature: Baby = { ...BABY, gestationalWeeks: 32 }
    stubZ({ 'm0': 0.2, 'm100': -0.6 })

    const result = assessVelocity(
      [measurement('m0', 0), measurement('m100', 100)],
      premature,
      'wfa',
    )

    // 8 weeks early -> 56 days of correction.
    expect(result.points.map((point) => point.ageDays)).toEqual([0, 44])
    expect(result.drop?.days).toBe(100)
  })
})
