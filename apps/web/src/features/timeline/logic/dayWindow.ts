/**
 * Pure helpers behind the day timeline (T013).
 *
 * All persisted timestamps are ISO-8601 UTC strings, but parents reason in
 * *local* days: a log at 00:30 belongs to the day the phone shows, not to the
 * UTC day. Everything here therefore goes through local `Date` setters and
 * never touches the raw ISO string, so the local calendar day survives a
 * timezone offset.
 */
import type { LogEntry, LogPatch } from '../../../core/db/schema'
import { endOfDay, startOfDay } from '../../../core/time/day'

export interface DayRange {
  /** First millisecond of the local day. */
  from: Date
  /** Last millisecond of the local day. */
  to: Date
}

/** Inclusive local-day window, ready for `repo.listLogs`. */
export function dayRange(day: Date): DayRange {
  return { from: startOfDay(day), to: endOfDay(day) }
}

const HHMM = /^(\d{1,2}):(\d{2})$/

interface ParsedTime {
  hours: number
  minutes: number
}

/** Strict "H:mm" / "HH:mm" parser; anything out of range is rejected. */
function parseHhmm(value: string): ParsedTime | undefined {
  const match = HHMM.exec(value.trim())
  if (match === null) return undefined

  const hours = Number(match[1] ?? '')
  const minutes = Number(match[2] ?? '')
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return undefined
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return undefined

  return { hours, minutes }
}

/**
 * Replace the local time of day of an ISO instant, keeping its local calendar
 * day. Returns `undefined` for an invalid time or unparseable timestamp.
 */
export function withTimeOfDay(iso: string, hhmm: string): Date | undefined {
  const time = parseHhmm(hhmm)
  if (time === undefined) return undefined

  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return undefined

  date.setHours(time.hours, time.minutes, 0, 0)
  return date
}

/**
 * Patch that moves `startAt` to `hhmm` on the same local day.
 *
 * - invalid input -> empty patch (caller keeps the entry untouched)
 * - `endAt` is kept when it is still >= the new start, otherwise pulled up to
 *   the start (an end before its start would render a negative duration)
 */
export function applyTimeChange(entry: LogEntry, hhmm: string): LogPatch {
  const startAt = withTimeOfDay(entry.startAt, hhmm)
  if (startAt === undefined) return {}

  const patch: LogPatch = { startAt }
  if (entry.endAt !== undefined) {
    const endAt = new Date(entry.endAt)
    const invalidEnd = Number.isNaN(endAt.getTime())
    patch.endAt = invalidEnd || endAt.getTime() < startAt.getTime() ? startAt : endAt
  }

  return patch
}

/** Newest first, without mutating the caller's array. */
export function sortNewestFirst(entries: readonly LogEntry[]): LogEntry[] {
  return [...entries].sort((a, b) => parseMs(b) - parseMs(a))
}

function parseMs(entry: LogEntry): number {
  const ms = Date.parse(entry.startAt)
  return Number.isNaN(ms) ? 0 : ms
}
