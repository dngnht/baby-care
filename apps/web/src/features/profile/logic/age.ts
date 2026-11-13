import type { Baby } from '../../../core/db/schema'
import { correctedAgeDays } from '../../../core/standards/zscore'
import { MS_PER_DAY } from '../../../core/time/day'

/**
 * Pure age helpers for the baby profile.
 *
 * The prematurity rule itself lives in `core/standards/zscore`
 * (`correctedAgeDays`); nothing here re-implements or re-hardcodes it.
 */

/**
 * Bounds of the "tuần thai khi sinh" input. These are form bounds, not a
 * clinical cut-off: the viability / prematurity boundary is owned by
 * `correctedAgeDays`.
 */
export const GESTATIONAL_WEEKS_MIN = 22
export const GESTATIONAL_WEEKS_MAX = 42

/** Pre-filled value of the gestational-weeks field (a full-term pregnancy). */
export const DEFAULT_GESTATIONAL_WEEKS = 40

/** `<input type="date">` value: exactly `YYYY-MM-DD`. */
const DATE_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/** Integer-only, 1–2 digits (rejects `40.5`, `-1`, `1e1`, `100`). */
const WEEKS_PATTERN = /^\d{1,2}$/

/**
 * Turn a `<input type="date">` value into a local-midnight `Date`.
 * Returns `null` for an empty, malformed, non-existent (e.g. `2026-02-30`) or
 * future date — a birth date is never in the future, same-day is fine.
 */
export function parseBirthDate(value: string, now: Date = new Date()): Date | null {
  const match = DATE_INPUT_PATTERN.exec(value.trim())
  if (match === null) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  const date = new Date(year, month - 1, day)
  // `new Date(2026, 1, 30)` rolls over into March, so verify the round trip.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }

  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  if (date.getTime() > today.getTime()) return null

  return date
}

/** Validate the raw gestational-weeks input; `null` when outside 22–42. */
export function validateGestationalWeeks(raw: string): number | null {
  const text = raw.trim()
  if (!WEEKS_PATTERN.test(text)) return null

  const weeks = Number(text)
  if (!Number.isInteger(weeks)) return null
  if (weeks < GESTATIONAL_WEEKS_MIN || weeks > GESTATIONAL_WEEKS_MAX) return null

  return weeks
}

export interface BabyAge {
  /** Whole days since birth, never negative. */
  days: number
  /** Days after the premature-birth correction, never negative. */
  correctedDays: number
  /** Whether the premature correction applies to this baby at all. */
  isPremature: boolean
}

/**
 * Probe distance used to read the correction rule out of `correctedAgeDays`.
 * Ten years is far past any correction window, so the clamp to zero can never
 * mask it.
 */
const CORRECTION_PROBE_DAYS = 3650

/** Whether `correctedAgeDays` applies a correction for this gestational age. */
function hasPostnatalCorrection(birth: Date, gestWeeks: number): boolean {
  const probe = new Date(birth.getTime() + CORRECTION_PROBE_DAYS * MS_PER_DAY)
  return correctedAgeDays(birth, probe, gestWeeks) < CORRECTION_PROBE_DAYS
}

/**
 * Age of a stored baby profile at `now` (default: today).
 * `birthDate` is the ISO 8601 UTC string persisted by the repository.
 */
export function describeAge(
  baby: Pick<Baby, 'birthDate' | 'gestationalWeeks'>,
  now: Date = new Date(),
): BabyAge {
  const birth = new Date(baby.birthDate)
  if (Number.isNaN(birth.getTime())) {
    return { days: 0, correctedDays: 0, isPremature: false }
  }

  const days = Math.max(0, Math.floor((now.getTime() - birth.getTime()) / MS_PER_DAY))
  const correctedDays = correctedAgeDays(birth, now, baby.gestationalWeeks)
  const isPremature = hasPostnatalCorrection(birth, baby.gestationalWeeks)

  return { days, correctedDays, isPremature }
}
