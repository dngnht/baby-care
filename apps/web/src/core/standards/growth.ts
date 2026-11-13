import type { Baby, Measurement } from '../db/schema'
import { isIndicatorVerified, lmsForDay, lmsForLengthCm, lmsTable, type Indicator } from './lms'
import { classify, correctedAgeDays, zFromLMS, type Band } from './zscore'

export type GrowthIndicator = 'wfa' | 'lhfa' | 'hcfa'

export interface ZScoreResult {
  z: number
  band: Band
  /** False while the WHO table still awaits the medical review (T005). */
  verified: boolean
  value: number
  unit: 'kg' | 'cm'
  ageDays: number
}

/**
 * Age used for growth charts: corrected age for premature babies, measured in
 * whole days from birth to the measurement date (never negative).
 */
export function measurementAgeDays(baby: Pick<Baby, 'birthDate' | 'gestationalWeeks'>, at: Date): number {
  return correctedAgeDays(new Date(baby.birthDate), at, baby.gestationalWeeks)
}

/** The measurement value in the unit the WHO table expects, or null if absent. */
export function measurementValue(
  measurement: Pick<Measurement, 'weightG' | 'lengthCm' | 'headCm'>,
  indicator: GrowthIndicator,
): number | null {
  if (indicator === 'wfa') {
    return measurement.weightG === undefined ? null : measurement.weightG / 1000
  }
  if (indicator === 'lhfa') {
    return measurement.lengthCm ?? null
  }
  return measurement.headCm ?? null
}

export function indicatorUnit(indicator: GrowthIndicator): 'kg' | 'cm' {
  return indicator === 'wfa' ? 'kg' : 'cm'
}

/**
 * z-score for one measurement against the WHO LMS table for the baby's sex and
 * corrected age. Returns null when the value is missing or the age is outside
 * the 0–24 month table.
 */
export function zForMeasurement(
  measurement: Pick<Measurement, 'date' | 'weightG' | 'lengthCm' | 'headCm'>,
  baby: Pick<Baby, 'sex' | 'birthDate' | 'gestationalWeeks'>,
  indicator: GrowthIndicator,
): ZScoreResult | null {
  const value = measurementValue(measurement, indicator)
  if (value === null || !Number.isFinite(value) || value <= 0) return null

  const at = new Date(measurement.date)
  const ageDays = measurementAgeDays(baby, at)
  const table = lmsTable(indicator, baby.sex)
  const row = lmsForDay(table, ageDays)
  if (row === undefined) return null

  const z = zFromLMS(value, row)
  return {
    z,
    band: classify(z),
    verified: isIndicatorVerified(indicator),
    value,
    unit: indicatorUnit(indicator),
    ageDays,
  }
}

/** Weight-for-length z-score (used by the velocity check on length + weight). */
export function zForWeightForLength(
  measurement: Pick<Measurement, 'weightG' | 'lengthCm'>,
  baby: Pick<Baby, 'sex'>,
): ZScoreResult | null {
  const weightKg = measurement.weightG === undefined ? null : measurement.weightG / 1000
  const lengthCm = measurement.lengthCm ?? null
  if (weightKg === null || lengthCm === null || weightKg <= 0 || lengthCm <= 0) return null

  const table = lmsTable('wfl' satisfies Indicator, baby.sex)
  const row = lmsForLengthCm(table, lengthCm)
  if (row === undefined) return null

  const z = zFromLMS(weightKg, row)
  return {
    z,
    band: classify(z),
    verified: isIndicatorVerified('wfl'),
    value: weightKg,
    unit: 'kg',
    ageDays: 0,
  }
}
