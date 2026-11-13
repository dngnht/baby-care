/**
 * Growth velocity check (T022): flag a large drop between two consecutive
 * measurements.
 *
 * Threshold source: BACKLOG T022 / `docs/01_PRODUCT_PLAN.md` F3.
 * TODO: move `VELOCITY_DROP_THRESHOLD_SD` into `knowledge/` once T005
 * normalises the medical thresholds (AGENTS rule 2).
 *
 * Pure logic: no React, no DB access. The z-score comes from the shared
 * `zForMeasurement` path, so corrected age and the WHO LMS lookup behave
 * exactly like the chart.
 *
 * Safety (AGENTS rule 3): while the WHO table is not medically verified the
 * assessment is always `'unverified'`. The measured drop is still returned so
 * the UI can show it neutrally, but it must never drive a red warning.
 */
import type { Baby, Measurement } from '../../../core/db/schema'
import { zForMeasurement, type GrowthIndicator } from '../../../core/standards/growth'
import { isIndicatorVerified } from '../../../core/standards/lms'
import { MS_PER_DAY } from '../../../core/time/day'

/**
 * A drop of at least this many SD between two consecutive measurements counts
 * as faltering growth. Source: BACKLOG T022 / `docs/01_PRODUCT_PLAN.md` F3.
 */
export const VELOCITY_DROP_THRESHOLD_SD = 0.67

export type VelocityStatus = 'insufficient' | 'ok' | 'drop' | 'unverified'

export interface VelocityPoint {
  /** Original ISO 8601 date of the measurement. */
  date: string
  /** Corrected age at that date, in whole days. */
  ageDays: number
  z: number
}

export interface VelocityDrop {
  /** Always negative (z after − z before). */
  deltaZ: number
  /** Whole days between the two measurements. */
  days: number
  fromDate: string
  toDate: string
}

export interface VelocityAssessment {
  status: VelocityStatus
  /** Valid points, sorted by date ascending. */
  points: VelocityPoint[]
  /** Steepest consecutive drop that crossed the threshold, when there is one. */
  drop?: VelocityDrop
}

type VelocityBaby = Pick<Baby, 'sex' | 'birthDate' | 'gestationalWeeks'>

/** Milliseconds between two ISO dates, as whole days (never negative). */
function daysBetween(fromIso: string, toIso: string): number {
  return Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / MS_PER_DAY))
}

/**
 * Usable points: measurements at or before `now`, sorted by date ascending.
 * A measurement without the value needed by `indicator` (or whose age falls
 * outside the 0–24 month table) yields no z-score and is skipped.
 */
function collectPoints(
  measurements: readonly Measurement[],
  baby: VelocityBaby,
  indicator: GrowthIndicator,
  now: Date,
): VelocityPoint[] {
  const cutoff = now.getTime()
  const points: VelocityPoint[] = []

  for (const measurement of measurements) {
    const at = Date.parse(measurement.date)
    // Future-dated entries cannot describe a past drop; ignore them.
    if (Number.isNaN(at) || at > cutoff) continue

    const result = zForMeasurement(measurement, baby, indicator)
    if (result === null) continue

    points.push({ date: measurement.date, ageDays: result.ageDays, z: result.z })
  }

  return points.sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
}

/**
 * The steepest drop among *consecutive* pairs only (not all pairs): comparing
 * every pair would report a slow decline spread over many visits as one sharp
 * drop. Returns undefined when no pair reaches the threshold.
 */
function steepestDrop(points: readonly VelocityPoint[]): VelocityDrop | undefined {
  let worst: VelocityDrop | undefined

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    if (previous === undefined || current === undefined) continue

    const deltaZ = current.z - previous.z
    if (deltaZ > -VELOCITY_DROP_THRESHOLD_SD) continue
    if (worst !== undefined && deltaZ >= worst.deltaZ) continue

    worst = {
      deltaZ,
      days: daysBetween(previous.date, current.date),
      fromDate: previous.date,
      toDate: current.date,
    }
  }

  return worst
}

/**
 * Assess growth velocity for one indicator.
 *
 * - `< 2` usable points → `'insufficient'` (nothing to compare yet).
 * - WHO table not verified → `'unverified'`, whatever the numbers say.
 * - Otherwise `'drop'` when the steepest consecutive drop reaches
 *   −0.67 SD, else `'ok'`.
 *
 * `now` defaults to the current time and only exists to discard future-dated
 * measurements.
 */
export function assessVelocity(
  measurements: readonly Measurement[],
  baby: VelocityBaby,
  indicator: GrowthIndicator,
  now: Date = new Date(),
): VelocityAssessment {
  const points = collectPoints(measurements, baby, indicator, now)
  const drop = steepestDrop(points)

  if (points.length < 2) return { status: 'insufficient', points }

  // Never alarm on a table that still awaits the medical review (T005).
  if (!isIndicatorVerified(indicator)) {
    return drop === undefined ? { status: 'unverified', points } : { status: 'unverified', points, drop }
  }

  return drop === undefined ? { status: 'ok', points } : { status: 'drop', points, drop }
}
