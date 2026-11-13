/**
 * 24-hour metrics for the dashboard, computed from the local log list.
 *
 * Pure functions: no IndexedDB, no clock reads — `now` is always passed in so
 * the numbers are reproducible in tests.
 */
import type { LogEntry, LogPayload } from '../../../core/db/schema'
import { last24Hours, minutesBetween } from '../../../core/time/day'
import { readDiaperKind } from '../../logs/describeLog'
import { FEED_TYPES } from '../../logs/logMeta'
import type { ValueRange } from './reference'

/** How a measured value sits relative to a reference range. */
export type Comparison = 'below' | 'within' | 'above'

export interface DailyMetrics {
  /** Breast + bottle feeds (`FEED_TYPES`), solid meals excluded. */
  feedCount: number
  /** Finished sleeps plus the running one, up to `now`. */
  sleepMinutes: number
  /** Diapers whose kind is `wet` or `both`. */
  wetDiapers: number
  /** Solid meals, tracked separately from feeds. */
  solidCount: number
  /** Every log that started inside the window (used for the empty state). */
  entryCount: number
}

/**
 * Narrow a persisted payload to a plain object. Dexie data can be older or
 * written by an older app version, so a non-object payload is possible.
 */
function asPayload(value: unknown): LogPayload | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  return value as LogPayload
}

/**
 * Metrics for the inclusive 24-hour window ending at `now`.
 *
 * An entry belongs to the window when its `startAt` falls inside it; entries
 * with an unparseable timestamp are ignored instead of being counted as
 * "now". A missing/invalid `endAt` on a sleep yields 0 extra minutes rather
 * than a negative duration.
 */
export function computeMetrics(entries: readonly LogEntry[], now: Date): DailyMetrics {
  const { from, to } = last24Hours(now)
  const fromMs = from.getTime()
  const toMs = to.getTime()

  let feedCount = 0
  let sleepMinutes = 0
  let wetDiapers = 0
  let solidCount = 0
  let entryCount = 0

  for (const entry of entries) {
    const startMs = Date.parse(entry.startAt)
    if (Number.isNaN(startMs) || startMs < fromMs || startMs > toMs) continue
    entryCount += 1

    if (FEED_TYPES.includes(entry.type)) feedCount += 1

    if (entry.type === 'solid') solidCount += 1

    if (entry.type === 'sleep') {
      sleepMinutes +=
        entry.endAt === undefined
          ? minutesBetween(entry.startAt, now)
          : minutesBetween(entry.startAt, entry.endAt)
    }

    if (entry.type === 'diaper') {
      const payload = asPayload(entry.payload)
      const kind = payload === undefined ? undefined : readDiaperKind(payload)
      if (kind === 'wet' || kind === 'both') wetDiapers += 1
    }
  }

  return { feedCount, sleepMinutes, wetDiapers, solidCount, entryCount }
}

/**
 * Compare `value` with a reference range.
 *
 * `null` means "not comparable" (no range for this age band, or a non-finite
 * value) — the caller must then stay neutral instead of guessing a status.
 * An open-ended range (`max` absent) only has a lower bound.
 */
export function compareToReference(
  value: number,
  range: ValueRange | undefined,
): Comparison | null {
  if (range === undefined || !Number.isFinite(value)) return null
  if (value < range.min) return 'below'
  if (range.max !== undefined && value > range.max) return 'above'
  return 'within'
}
