/**
 * Date helpers shared by the log features.
 *
 * Every persisted timestamp is an ISO-8601 UTC string (see core/db/schema), so
 * these helpers accept ISO strings for reads and `Date` for range queries.
 * Ranges are always built in the device's local day, because parents think in
 * "today", not UTC days.
 */

export const MS_PER_DAY = 86_400_000
export const MS_PER_MINUTE = 60_000

export function startOfDay(date: Date): Date {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

export function endOfDay(date: Date): Date {
  const next = new Date(date)
  next.setHours(23, 59, 59, 999)
  return next
}

export function addDays(date: Date, amount: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

/** Inclusive 24-hour window ending now. */
export function last24Hours(now: Date): { from: Date; to: Date } {
  return { from: new Date(now.getTime() - MS_PER_DAY), to: new Date(now) }
}

export function minutesBetween(fromIso: string, to: Date | string): number {
  const toMs = typeof to === 'string' ? Date.parse(to) : to.getTime()
  const fromMs = Date.parse(fromIso)
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return 0
  return Math.max(0, Math.round((toMs - fromMs) / MS_PER_MINUTE))
}

/** Whole days between two dates, never negative. */
export function ageInDays(birthDate: Date | string, at: Date = new Date()): number {
  const birth = typeof birthDate === 'string' ? new Date(birthDate) : birthDate
  return Math.max(0, Math.floor((at.getTime() - birth.getTime()) / MS_PER_DAY))
}

/** "HH:mm" in the device timezone, e.g. "07:05". */
export function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '--:--'
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/** "YYYY-MM-DD" in the device timezone, the key used for one-day lists. */
export function toDayKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

export function fromDayKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1)
}

/** Compact duration, e.g. 95 minutes -> "1h35", 20 minutes -> "20p". */
export function formatDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes))
  const hours = Math.floor(safe / 60)
  const rest = safe % 60
  if (hours === 0) return `${rest}p`
  if (rest === 0) return `${hours}h`
  return `${hours}h${pad2(rest)}`
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}
