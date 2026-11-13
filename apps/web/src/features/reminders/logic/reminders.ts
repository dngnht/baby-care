// Pure reminder helpers: grouping, recurrence, windowing and date formatting.
//
// Everything is stored as an ISO 8601 UTC string (core/db/schema). Reads happen
// in the device's local calendar because "hôm nay" means the parent's today, not
// a UTC day; writes go through the repository, which converts back to UTC.
import type { Reminder } from '../../../core/db/schema'
import { MS_PER_DAY, addDays, endOfDay, startOfDay } from '../../../core/time/day'

export interface ReminderGroups {
  /** Not done and already past due (any day). */
  overdue: Reminder[]
  /** Not done and due later today. */
  today: Reminder[]
  /** Not done and due on a later day. */
  upcoming: Reminder[]
  /** Marked done, whatever the due date. */
  done: Reminder[]
}

/** Default look-ahead for the "sắp tới" notification. */
export const DUE_SOON_WINDOW_HOURS = 24

const MS_PER_HOUR = 3_600_000

/** Shown when a timestamp cannot be parsed; symbol-only so it needs no copy. */
const FALLBACK_WHEN = '--/--/---- --:--'

/** Upper bound on correction steps, so a corrupted anchor can never spin. */
const MAX_CORRECTION_STEPS = 4

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** ISO-8601 ordering; stored values are always valid, invalid ones sort first. */
function byAt(a: Reminder, b: Reminder): number {
  return Date.parse(a.at) - Date.parse(b.at)
}

function compareAt(a: Reminder, b: Reminder): number {
  const left = Date.parse(a.at)
  const right = Date.parse(b.at)
  if (Number.isNaN(left) || Number.isNaN(right)) return 0
  return left - right
}

/**
 * Split the list into the four sections of the page.
 *
 * Precedence is `done` > `overdue` > `today` > `upcoming`: a reminder marked
 * done leaves the actionable buckets, and something due earlier today is
 * overdue until the parent ticks it off. Buckets keep `at` ascending.
 */
export function splitReminders(list: readonly Reminder[], now: Date): ReminderGroups {
  const nowMs = now.getTime()
  const dayStart = startOfDay(now).getTime()
  const dayEnd = endOfDay(now).getTime()

  const groups: ReminderGroups = { overdue: [], today: [], upcoming: [], done: [] }

  for (const reminder of list) {
    if (reminder.doneAt !== undefined) {
      groups.done.push(reminder)
      continue
    }

    const at = Date.parse(reminder.at)
    if (Number.isNaN(at)) continue

    if (at < nowMs) groups.overdue.push(reminder)
    else if (at >= dayStart && at <= dayEnd) groups.today.push(reminder)
    else groups.upcoming.push(reminder)
  }

  groups.overdue.sort(byAt)
  groups.today.sort(byAt)
  groups.upcoming.sort(byAt)
  groups.done.sort(byAt)
  return groups
}

/**
 * Next occurrence of a reminder at or after `now`.
 *
 * `none` keeps the stored date untouched. `daily` / `weekly` walk forward in
 * whole local days from the stored anchor, so the local hour and minute survive
 * DST and month boundaries. The jump is computed in calendar days (rounded day
 * starts are exact across 23/24/25-hour days), then corrected by at most a
 * couple of steps, which keeps the loop bounded.
 */
export function nextOccurrence(reminder: Reminder, now: Date): Date {
  const anchor = new Date(reminder.at)
  if (Number.isNaN(anchor.getTime()) || reminder.repeat === 'none') return anchor
  if (anchor.getTime() >= now.getTime()) return anchor

  const stepDays = reminder.repeat === 'weekly' ? 7 : 1
  const calendarDays = Math.round(
    (startOfDay(now).getTime() - startOfDay(anchor).getTime()) / MS_PER_DAY,
  )
  const periods = Math.max(0, Math.ceil(calendarDays / stepDays))
  let next = addDays(anchor, periods * stepDays)

  for (let step = 0; next.getTime() < now.getTime() && step < MAX_CORRECTION_STEPS; step += 1) {
    next = addDays(next, stepDays)
  }
  return next
}

/**
 * Reminders that are not done and due within `[now, now + windowHours]`.
 *
 * Both edges are inclusive, so an item due right now is announced. The result
 * is sorted by due time, which lets the caller announce only the closest one.
 */
export function dueSoon(
  list: readonly Reminder[],
  now: Date,
  windowHours: number = DUE_SOON_WINDOW_HOURS,
): Reminder[] {
  const from = now.getTime()
  const to = from + windowHours * MS_PER_HOUR

  return list
    .filter((reminder) => reminder.doneAt === undefined)
    .filter((reminder) => {
      const at = Date.parse(reminder.at)
      return !Number.isNaN(at) && at >= from && at <= to
    })
    .sort(compareAt)
}

/** "dd/MM/yyyy HH:mm" in the device timezone, e.g. "05/03/2026 07:05". */
export function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return FALLBACK_WHEN
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()} ${pad2(
    date.getHours(),
  )}:${pad2(date.getMinutes())}`
}

/**
 * A `Date` as the local `value` of `<input type="datetime-local">`, i.e.
 * "YYYY-MM-DDTHH:mm" with no timezone suffix.
 */
export function toDateTimeLocalValue(date: Date): string {
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(
    date.getHours(),
  )}:${pad2(date.getMinutes())}`
}

/**
 * Parse a `datetime-local` value as a local instant.
 *
 * Returns `null` for an empty/malformed value and for dates the calendar rolled
 * over (e.g. 31/02), so the form can show its own error instead of silently
 * saving a different day.
 */
export function parseDateTimeLocal(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value)
  if (match === null) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  if ([year, month, day, hour, minute].some((part) => Number.isNaN(part))) return null

  const date = new Date(year, month - 1, day, hour, minute, 0, 0)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null
  }
  return date
}
