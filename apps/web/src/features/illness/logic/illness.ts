// Pure helpers for the illness log (T044).
//
// The illness page is a neutral record of what the parent observed — a
// temperature, a symptom, a medicine given, or a free-form note — so it can be
// taken to an appointment. Nothing here interprets a reading or suggests a
// dose: out-of-range input is rejected, never "corrected" into a clinical value.
import type { LogEntry, LogPayload, LogType } from '../../../core/db/schema'
import { addDays } from '../../../core/time/day'
import { readTempC } from '../../logs/describeLog'

/** Log types the illness page reads back. */
export const ILLNESS_TYPES: readonly LogType[] = ['temp', 'symptom', 'med', 'note']

const ILLNESS_TYPE_SET: ReadonlySet<LogType> = new Set(ILLNESS_TYPES)

/** Log types the add-sheet can create. */
export type IllnessKind = 'temp' | 'symptom' | 'med' | 'note'

/** Default history length, matching the `illness.range` copy ("14 ngày qua"). */
export const ILLNESS_WINDOW_DAYS = 14

/** Inclusive accepted temperature range, in °C. */
export const TEMP_MIN_C = 34
export const TEMP_MAX_C = 42

/** Maximum length of a symptom / medicine note, in characters. */
export const NOTE_MAX_LENGTH = 200

export interface IllnessWindow {
  /** Inclusive lower bound. */
  from: Date
  /** Inclusive upper bound. */
  to: Date
}

/**
 * Rolling window ending at `now`: `[now - days, now]`.
 *
 * Built with `addDays` so the local wall-clock time is preserved and a DST
 * change cannot shift the range by an hour. A negative or non-finite `days`
 * still yields a usable window.
 */
export function illnessWindow(now: Date, days: number = ILLNESS_WINDOW_DAYS): IllnessWindow {
  const span = Number.isFinite(days) ? Math.max(0, Math.floor(days)) : ILLNESS_WINDOW_DAYS
  return { from: addDays(now, -span), to: new Date(now) }
}

function startAtMs(entry: LogEntry): number {
  return Date.parse(entry.startAt)
}

/**
 * Keep only illness log types, newest first.
 *
 * Pass a window to additionally drop rows outside `[from, to]` (both edges
 * inclusive). The repository already range-scans, so the window is a cheap
 * second guard for callers that hold a wider list.
 */
export function filterIllnessLogs(
  entries: readonly LogEntry[],
  window?: IllnessWindow,
): LogEntry[] {
  const fromMs = window === undefined ? undefined : window.from.getTime()
  const toMs = window === undefined ? undefined : window.to.getTime()

  return entries
    .filter((entry) => ILLNESS_TYPE_SET.has(entry.type))
    .filter((entry) => {
      if (fromMs === undefined || toMs === undefined) return true
      const at = startAtMs(entry)
      return !Number.isNaN(at) && at >= fromMs && at <= toMs
    })
    .sort((a, b) => {
      const left = startAtMs(a)
      const right = startAtMs(b)
      // Unparseable timestamps sort last instead of poisoning the ordering.
      if (Number.isNaN(left)) return Number.isNaN(right) ? 0 : 1
      if (Number.isNaN(right)) return -1
      return right - left
    })
}

export interface IllnessSummary {
  /** Every illness entry in the list, including notes. */
  count: number
  /** Highest valid reading; omitted when no `temp` row carries a usable value. */
  tempMax?: number
  tempCount: number
  symptomCount: number
  medCount: number
  /** `startAt` (ISO 8601 UTC) of the newest entry; omitted when empty. */
  lastAt?: string
}

/**
 * Aggregate the list for the header.
 *
 * A temperature row with a malformed payload still counts as a `temp` entry but
 * never contributes to `tempMax`, so one bad row cannot invent a reading.
 */
export function summarizeIllness(entries: readonly LogEntry[]): IllnessSummary {
  const sorted = filterIllnessLogs(entries)

  let tempMax: number | undefined
  let tempCount = 0
  let symptomCount = 0
  let medCount = 0

  for (const entry of sorted) {
    switch (entry.type) {
      case 'temp': {
        tempCount += 1
        const value = readTempC(entry.payload)
        if (value !== undefined && (tempMax === undefined || value > tempMax)) tempMax = value
        break
      }
      case 'symptom':
        symptomCount += 1
        break
      case 'med':
        medCount += 1
        break
      default:
        break
    }
  }

  const summary: IllnessSummary = {
    count: sorted.length,
    tempCount,
    symptomCount,
    medCount,
  }
  if (tempMax !== undefined) summary.tempMax = tempMax

  const newest = sorted[0]
  if (newest !== undefined) summary.lastAt = newest.startAt
  return summary
}

export interface IllnessInput {
  /** Raw numeric reading; rounded to one decimal and range-checked. */
  tempC?: number
  /** Free-form text for symptom / medicine / note. */
  text?: string
}

/**
 * Turn the sheet input into a persisted payload, or `null` when invalid.
 *
 * - `temp` requires a finite reading rounded to one decimal within
 *   `[34, 42]` °C and stores `{ tempC }`.
 * - every other kind stores the trimmed text as `{ note }`, rejecting empty
 *   and longer-than-200-character input.
 *
 * `null` means "do not save"; callers surface the error instead of inventing a
 * fallback value.
 */
export function buildIllnessPayload(
  kind: IllnessKind,
  input: IllnessInput = {},
): LogPayload | null {
  if (kind === 'temp') {
    const raw = input.tempC
    if (raw === undefined || !Number.isFinite(raw)) return null

    const value = Math.round(raw * 10) / 10
    if (value < TEMP_MIN_C || value > TEMP_MAX_C) return null
    return { tempC: value }
  }

  const text = input.text?.trim()
  if (text === undefined || text.length === 0) return null
  if (text.length > NOTE_MAX_LENGTH) return null
  return { note: text }
}

/**
 * Parse the temperature field, accepting a comma decimal separator ("37,5").
 * Blank or non-numeric input returns `undefined`; range and precision are
 * enforced by `buildIllnessPayload`.
 */
export function parseTempInput(raw: string): number | undefined {
  const text = raw.trim().replace(',', '.')
  if (text === '') return undefined

  const value = Number(text)
  return Number.isFinite(value) ? value : undefined
}
