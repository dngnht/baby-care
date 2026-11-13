/**
 * Measurement entry validation (T020).
 *
 * Pure logic: no React, no DB access, no medical thresholds. The ranges below
 * only keep obviously wrong *input* out of the form (typos, unit mix-ups); they
 * are not growth standards. Every z-score is computed later by
 * `zForMeasurement`, which reads the WHO LMS tables from `knowledge/`.
 *
 * Nothing here fills a default: a blank box stays blank, so the app never
 * invents a weight or a length the parent did not measure (AGENTS rule 2).
 */
import type { NewMeasurement } from '../../../core/db/schema'
import type { Band } from '../../../core/standards/zscore'
import type { TranslationKey } from '../../../core/i18n'
import { startOfDay } from '../../../core/time/day'

/** Input limits — plausibility guards for the UI only, not growth standards. */
export const MIN_WEIGHT_G = 500
export const MAX_WEIGHT_G = 30_000
export const MIN_LENGTH_CM = 25
export const MAX_LENGTH_CM = 120
export const MIN_HEAD_CM = 20
export const MAX_HEAD_CM = 70

/** Raw form values: dates are `YYYY-MM-DD`, numbers stay text while typing. */
export interface MeasurementInput {
  /** Owner of the new measurement. */
  babyId: string
  /** Baby's birth date; a measurement may not predate it. */
  birthDate: Date
  /** `YYYY-MM-DD` in the device timezone. */
  date: string
  /** Blank string means "not measured this time". */
  weightG: string
  lengthCm: string
  headCm: string
}

export type MeasurementError = 'date' | 'empty' | 'range'

export type MeasurementParseResult =
  | { ok: true; value: NewMeasurement }
  | { ok: false; error: MeasurementError }

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/
const INTEGER = /^\d+$/
const ONE_DECIMAL = /^\d+(?:[.,]\d)?$/

function fail(error: MeasurementError): MeasurementParseResult {
  return { ok: false, error }
}

/**
 * `YYYY-MM-DD` → local midnight, or null when the text is not a real calendar
 * day. The component round-trip rejects impossible dates such as 2026-02-30
 * (which `new Date` would silently roll over to March).
 */
function parseLocalDay(key: string): Date | null {
  const match = DATE_KEY.exec(key.trim())
  if (match === null) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return date
}

/** Whole grams, or null when the text is not a positive integer. */
function parseInteger(raw: string): number | null {
  const text = raw.trim()
  if (!INTEGER.test(text)) return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

/** At most one decimal, dot or Vietnamese comma ("60,5"), or null. */
function parseDecimal(raw: string): number | null {
  const text = raw.trim().replace(',', '.')
  if (!ONE_DECIMAL.test(text)) return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

function inRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max
}

/**
 * Validate the measurement form.
 *
 * Error precedence: the date is checked first (`'date'`), then "at least one
 * measurement" (`'empty'`), then each provided number (`'range'`).
 */
export function parseMeasurementInput(
  input: MeasurementInput,
  now: Date = new Date(),
): MeasurementParseResult {
  const day = parseLocalDay(input.date)
  if (day === null) return fail('date')
  if (day.getTime() > startOfDay(now).getTime()) return fail('date')

  const birth = startOfDay(input.birthDate)
  if (!Number.isNaN(birth.getTime()) && day.getTime() < birth.getTime()) return fail('date')

  const rawWeight = input.weightG.trim()
  const rawLength = input.lengthCm.trim()
  const rawHead = input.headCm.trim()
  if (rawWeight === '' && rawLength === '' && rawHead === '') return fail('empty')

  const weightG = rawWeight === '' ? undefined : parseInteger(rawWeight)
  const lengthCm = rawLength === '' ? undefined : parseDecimal(rawLength)
  const headCm = rawHead === '' ? undefined : parseDecimal(rawHead)
  if (weightG === null || lengthCm === null || headCm === null) return fail('range')

  if (weightG !== undefined && !inRange(weightG, MIN_WEIGHT_G, MAX_WEIGHT_G)) return fail('range')
  if (lengthCm !== undefined && !inRange(lengthCm, MIN_LENGTH_CM, MAX_LENGTH_CM)) return fail('range')
  if (headCm !== undefined && !inRange(headCm, MIN_HEAD_CM, MAX_HEAD_CM)) return fail('range')

  const value: NewMeasurement = { babyId: input.babyId, date: day }
  if (weightG !== undefined) value.weightG = weightG
  if (lengthCm !== undefined) value.lengthCm = lengthCm
  if (headCm !== undefined) value.headCm = headCm

  return { ok: true, value }
}

/** Colour family a band is allowed to use once its table is verified. */
export type BandTone = 'neutral' | 'low' | 'high' | 'severe'

export interface BandPresentation {
  labelKey: TranslationKey
  tone: BandTone
}

const BAND_LABEL: Readonly<Record<Band, TranslationKey>> = {
  severe_low: 'band.severe_low',
  low: 'band.low',
  normal: 'band.normal',
  high: 'band.high',
  severe_high: 'band.severe_high',
}

/**
 * Band label plus the only colour tone it may use.
 *
 * While the WHO table is `verified: false` the tone is always `'neutral'`
 * (AGENTS rule 3): the band label still says what the number is, but the UI
 * must never paint it like an alarm — `'severe'` is unreachable there.
 */
export function bandPresentation(band: Band, verified: boolean): BandPresentation {
  const labelKey = BAND_LABEL[band]
  if (!verified) return { labelKey, tone: 'neutral' }
  if (band === 'severe_low' || band === 'severe_high') return { labelKey, tone: 'severe' }
  if (band === 'low') return { labelKey, tone: 'low' }
  if (band === 'high') return { labelKey, tone: 'high' }
  return { labelKey, tone: 'neutral' }
}

/**
 * One decimal with an explicit minus sign for negatives ("-1.8", "2.0").
 * `-0.0` is normalised to `0.0`; a non-finite value renders as an em dash
 * rather than a fabricated number.
 */
export function formatZ(z: number): string {
  if (!Number.isFinite(z)) return '\u2014'
  const rounded = Math.round(z * 10) / 10
  const magnitude = Math.abs(rounded).toFixed(1)
  return rounded < 0 ? `-${magnitude}` : magnitude
}
