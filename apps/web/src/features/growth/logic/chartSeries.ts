/**
 * Chart-ready series for the WHO growth chart (T021).
 *
 * Pure functions: no React, no DB access. The LMS table, the measurement list
 * and the baby profile are always passed in, so every number is reproducible
 * in tests.
 *
 * The LMS reference curve for SD `k` is
 *   SD(k) = M * (1 + L*S*k) ** (1 / L)   when L !== 0
 *   SD(k) = M * exp(S * k)               when L === 0 (the mathematical limit)
 * Writing `1 / L` at L = 0 yields `Math.pow(1, Infinity)` = NaN, so the L = 0
 * case is handled explicitly here (same guard as `zFromLMS`).
 */
import type { Baby, Measurement } from '../../../core/db/schema'
import type { GrowthIndicator } from '../../../core/standards/growth'
import {
  indicatorUnit,
  measurementAgeDays,
  measurementValue,
  zForMeasurement,
} from '../../../core/standards/growth'
import { lmsForDay, maxDay, type LmsRow, type LmsTable } from '../../../core/standards/lms'

/** Average days per month used for the age axis (365.25 / 12). */
export const DAYS_PER_MONTH = 30.44

/** Default sampling step: one reference point per week keeps the DOM light. */
const DEFAULT_STEP_DAYS = 7

export const SD_BANDS = [-3, -2, -1, 0, 1, 2, 3] as const

export type SdBand = (typeof SD_BANDS)[number]

export interface SdPoint {
  ageDays: number
  value: number
}

export interface SdSeries {
  band: SdBand
  points: SdPoint[]
}

export interface BabyPoint {
  ageDays: number
  value: number
  z: number
}

export interface ChartDomain {
  /** Age of the last table day, in days (the X axis upper bound). */
  xMax: number
  yMin: number
  yMax: number
}

/** Value of the SD `band` curve at one LMS row. */
function sdValue(row: LmsRow, band: SdBand): number {
  const { L, M, S } = row
  if (L === 0) return M * Math.exp(S * band)
  return M * Math.pow(1 + L * S * band, 1 / L)
}

/** Every sampled day: 0, step, 2*step… plus the final table day. */
function sampleDays(table: LmsTable, stepDays: number): number[] {
  const last = maxDay(table)
  if (last <= 0) return [0]

  const step =
    Number.isFinite(stepDays) && stepDays >= 1 ? Math.round(stepDays) : DEFAULT_STEP_DAYS

  const days: number[] = []
  for (let day = 0; day <= last; day += step) days.push(day)
  if (days[days.length - 1] !== last) days.push(last)
  return days
}

/**
 * The seven WHO reference curves (−3…+3 SD) sampled every `stepDays` days.
 * Returns an empty array for tables that are not day-based (e.g. weight-for-length).
 */
export function buildSdSeries(table: LmsTable, stepDays: number = DEFAULT_STEP_DAYS): SdSeries[] {
  if (table.dimension !== 'day') return []

  const days = sampleDays(table, stepDays)
  const rows: { ageDays: number; row: LmsRow }[] = []
  for (const ageDays of days) {
    const row = lmsForDay(table, ageDays)
    if (row !== undefined) rows.push({ ageDays, row })
  }

  return SD_BANDS.map((band) => {
    const points: SdPoint[] = []
    for (const { ageDays, row } of rows) {
      const value = sdValue(row, band)
      if (Number.isFinite(value)) points.push({ ageDays, value })
    }
    return { band, points }
  })
}

/**
 * The baby's own measurements projected onto the chart, sorted by age.
 *
 * Uses the shared z-score path (corrected age for premature babies, exact-day
 * LMS lookup), so a point is dropped when the value is missing or its age falls
 * outside the 0–24 month table — the chart never invents a reference value.
 */
export function buildBabyPoints(
  measurements: Measurement[],
  baby: Baby,
  indicator: GrowthIndicator,
): BabyPoint[] {
  const points: BabyPoint[] = []

  for (const measurement of measurements) {
    const value = measurementValue(measurement, indicator)
    if (value === null || !Number.isFinite(value) || value <= 0) continue

    const result = zForMeasurement(measurement, baby, indicator)
    if (result === null) continue

    points.push({
      ageDays: measurementAgeDays(baby, new Date(measurement.date)),
      value,
      z: result.z,
    })
  }

  return points.sort((a, b) => a.ageDays - b.ageDays)
}

/** Y-axis padding: round outward to a readable step for the indicator's unit. */
function niceStep(indicator: GrowthIndicator): number {
  return indicatorUnit(indicator) === 'kg' ? 0.5 : 1
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/**
 * Axis bounds that always contain the whole −3…+3 SD band, rounded outward to
 * half a kilo for weight and to whole centimetres for the length/head charts.
 */
export function chartDomain(table: LmsTable, indicator: GrowthIndicator): ChartDomain {
  const xMax = maxDay(table)
  const outer = buildSdSeries(table).filter((series) => series.band === -3 || series.band === 3)

  let low = Number.POSITIVE_INFINITY
  let high = Number.NEGATIVE_INFINITY
  for (const series of outer) {
    for (const point of series.points) {
      if (point.value < low) low = point.value
      if (point.value > high) high = point.value
    }
  }
  if (!Number.isFinite(low) || !Number.isFinite(high)) return { xMax, yMin: 0, yMax: 1 }

  const step = niceStep(indicator)
  const padding = (high - low) * 0.03
  const yMin = Math.max(0, Math.floor((low - padding) / step) * step)
  const yMax = Math.ceil((high + padding) / step) * step

  return { xMax, yMin: roundTo(yMin, 1), yMax: roundTo(yMax, 1) }
}
