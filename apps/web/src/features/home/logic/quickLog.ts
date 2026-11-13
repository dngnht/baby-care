// Pure logic for the home quick-log grid (T011).
//
// Everything here is side-effect free: `pickDefaults` reads the last known
// values out of history, `buildQuickLog` turns a tapped tile into a
// `NewLogEntry`, and the parsers validate what the bottom sheet collects.
//
// Medical guardrail: this module never invents a measurement. A missing
// amount / temperature stays missing (no `0`, no `37°C`) — only interaction
// defaults that are not clinical data (breast side `both`, diaper `wet`) are
// filled in.
import type { LogEntry, LogPayload, LogType, NewLogEntry } from '../../../core/db/schema'
import { readAmountMl, readSide, type FeedSide } from '../../logs/describeLog'

/** Values reused when a tile is tapped without opening the sheet. */
export interface QuickDefaults {
  side?: FeedSide
  amountMl?: number
}

/** Author recorded on every entry created from the home grid. */
export const DEFAULT_CREATED_BY = 'parent'

/** Fallback breast side when there is no earlier breast feed. */
export const FALLBACK_SIDE: FeedSide = 'both'

/** Fallback diaper kind for a one-tap change. */
export const FALLBACK_DIAPER_KIND = 'wet'

function newestFirst(entries: readonly LogEntry[]): LogEntry[] {
  return [...entries].sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt))
}

/**
 * Latest usable value per type: the breast side of the most recent
 * `feed_breast` and the volume of the most recent `feed_bottle`.
 *
 * Entries with a malformed payload are skipped rather than reported, so one
 * bad row can never poison the defaults.
 */
export function pickDefaults(entries: readonly LogEntry[]): QuickDefaults {
  const sorted = newestFirst(entries)
  const defaults: QuickDefaults = {}

  const lastBreast = sorted.find(
    (entry) => entry.type === 'feed_breast' && readSide(entry.payload) !== undefined,
  )
  const side = lastBreast === undefined ? undefined : readSide(lastBreast.payload)
  if (side !== undefined) defaults.side = side

  const lastBottle = sorted.find(
    (entry) => entry.type === 'feed_bottle' && readAmountMl(entry.payload) !== undefined,
  )
  const amountMl = lastBottle === undefined ? undefined : readAmountMl(lastBottle.payload)
  if (amountMl !== undefined) defaults.amountMl = amountMl

  return defaults
}

/**
 * A one-tap bottle feed needs a volume to be meaningful. With no earlier
 * amount there is nothing honest to reuse, so the UI must ask for it instead
 * of writing an empty record.
 */
export function shouldAskAmount(type: LogType, defaults: QuickDefaults): boolean {
  return type === 'feed_bottle' && defaults.amountMl === undefined
}

/** Minimal payload for a one-tap log of `type`. */
export function defaultPayload(type: LogType, defaults: QuickDefaults): LogPayload {
  switch (type) {
    case 'feed_breast':
      return { side: defaults.side ?? FALLBACK_SIDE }
    case 'diaper':
      return { diaperKind: FALLBACK_DIAPER_KIND }
    case 'feed_bottle':
      return defaults.amountMl === undefined ? {} : { amountMl: defaults.amountMl }
    default:
      return {}
  }
}

/**
 * Build the entry written on a single tap: current time, minimal payload and
 * the signed-in caregiver as `createdBy` (falls back to `parent` when the
 * caller does not pass one). `now` is used by reference so callers can assert
 * the exact instant that was logged.
 */
export function buildQuickLog(
  type: LogType,
  babyId: string,
  defaults: QuickDefaults,
  now: Date,
  author: string = DEFAULT_CREATED_BY,
): NewLogEntry {
  return {
    babyId,
    type,
    startAt: now,
    payload: defaultPayload(type, defaults),
    createdBy: author,
  }
}

const INTEGER_PATTERN = /^\d+$/

/** Whole millilitres from the sheet input; blank or malformed -> `undefined`. */
export function parseAmountMl(raw: string): number | undefined {
  const text = raw.trim()
  if (!INTEGER_PATTERN.test(text)) return undefined

  const value = Number(text)
  if (!Number.isSafeInteger(value) || value <= 0) return undefined
  return value
}

/**
 * Celsius from the sheet input, rounded to one decimal.
 * Blank, zero, negative or non-numeric -> `undefined` (never a made-up value).
 */
export function parseTempC(raw: string): number | undefined {
  const text = raw.trim().replace(',', '.')
  if (text === '') return undefined

  const value = Number(text)
  if (!Number.isFinite(value) || value <= 0) return undefined
  return Math.round(value * 10) / 10
}
