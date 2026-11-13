/**
 * Per-day totals for the 7-day comparison on the dashboard.
 *
 * Everything is computed locally from the log list — no reference thresholds
 * are involved, so the numbers can be shown even while the care tables are
 * still unverified. The only medical-looking number is bottle volume, which is
 * simply what the parent recorded.
 *
 * Sleep is the one value that can span midnight, so it is *split* across local
 * days: 22:00 → 02:00 adds 120 min to each day. Attributing the whole night to
 * the start day would make any two days look incomparable.
 */
import type { LogEntry, LogPayload } from '../../../core/db/schema'
import { addDays, startOfDay, toDayKey } from '../../../core/time/day'
import { readAmountMl, readDiaperKind } from '../../logs/describeLog'

export interface DayTotals {
  /** Local calendar day, `YYYY-MM-DD`. */
  dayKey: string
  /** Local midnight of that day. */
  date: Date
  /** Bottle volume recorded that day (ml). Breast feeds have no volume. */
  milkMl: number
  /** Every feed (breast + bottle). */
  feedCount: number
  breastCount: number
  bottleCount: number
  /** Sleep minutes that actually happened during this local day. */
  sleepMinutes: number
  diaperCount: number
  wetDiapers: number
  dirtyDiapers: number
  solidCount: number
}

export type DayMetric = 'milkMl' | 'sleepMinutes' | 'diaperCount'

function asPayload(value: unknown): LogPayload | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  return value as LogPayload
}

function emptyDay(date: Date): DayTotals {
  return {
    dayKey: toDayKey(date),
    date,
    milkMl: 0,
    feedCount: 0,
    breastCount: 0,
    bottleCount: 0,
    sleepMinutes: 0,
    diaperCount: 0,
    wetDiapers: 0,
    dirtyDiapers: 0,
    solidCount: 0,
  }
}

/**
 * Totals for the last `days` local days, oldest first; today is the last row
 * and is partial (up to `now`). Days without any log are present with zeros so
 * a bar chart never skips a date.
 */
export function buildDailyTotals(
  entries: readonly LogEntry[],
  days: number,
  now: Date,
): DayTotals[] {
  const safeDays = Math.max(1, Math.round(days))
  const today = startOfDay(now)

  const rows: DayTotals[] = []
  const byKey = new Map<string, DayTotals>()
  for (let offset = safeDays - 1; offset >= 0; offset -= 1) {
    const row = emptyDay(addDays(today, -offset))
    rows.push(row)
    byKey.set(row.dayKey, row)
  }

  const windowStartMs = (rows[0]?.date ?? today).getTime()
  const windowEndMs = now.getTime()

  for (const entry of entries) {
    const startMs = Date.parse(entry.startAt)
    if (Number.isNaN(startMs) || startMs > windowEndMs) continue

    if (entry.type === 'sleep') {
      addSleep(entry, byKey, Math.max(startMs, windowStartMs), windowEndMs)
      continue
    }

    if (startMs < windowStartMs) continue
    const row = byKey.get(toDayKey(new Date(startMs)))
    if (row === undefined) continue

    const payload = asPayload(entry.payload)

    switch (entry.type) {
      case 'feed_breast':
        row.feedCount += 1
        row.breastCount += 1
        break
      case 'feed_bottle': {
        row.feedCount += 1
        row.bottleCount += 1
        const amount = payload === undefined ? undefined : readAmountMl(payload)
        if (amount !== undefined && amount > 0) row.milkMl += amount
        break
      }
      case 'diaper': {
        row.diaperCount += 1
        const kind = payload === undefined ? undefined : readDiaperKind(payload)
        if (kind === 'wet' || kind === 'both') row.wetDiapers += 1
        if (kind === 'dirty' || kind === 'both') row.dirtyDiapers += 1
        break
      }
      case 'solid':
        row.solidCount += 1
        break
      default:
        break
    }
  }

  for (const row of rows) row.sleepMinutes = Math.round(row.sleepMinutes)
  return rows
}

/** Split a sleep across local midnights, clamped to the comparison window. */
function addSleep(
  entry: LogEntry,
  byKey: ReadonlyMap<string, DayTotals>,
  fromMs: number,
  nowMs: number,
): void {
  const endRaw = entry.endAt === undefined ? nowMs : Date.parse(entry.endAt)
  const endMs = Math.min(Number.isNaN(endRaw) ? nowMs : endRaw, nowMs)
  if (endMs <= fromMs) return

  let cursor = fromMs
  // A night is at most a few days; cap the loop defensively against bad data.
  for (let guard = 0; guard < 10 && cursor < endMs; guard += 1) {
    const dayStart = startOfDay(new Date(cursor))
    const nextDayMs = addDays(dayStart, 1).getTime()
    const sliceEnd = Math.min(endMs, nextDayMs)
    const row = byKey.get(toDayKey(dayStart))
    if (row !== undefined) row.sleepMinutes += (sliceEnd - cursor) / 60_000
    cursor = sliceEnd
  }
}

/** Mean of one metric over `rows`; `null` when there is nothing to average. */
export function averageOf(rows: readonly DayTotals[], metric: DayMetric): number | null {
  if (rows.length === 0) return null
  const total = rows.reduce((sum, row) => sum + row[metric], 0)
  return total / rows.length
}

/**
 * Percentage-free delta between two values, in the metric's own unit.
 * `null` when the previous value is missing (division-free: callers format it).
 */
export function deltaOf(current: number, previous: number | null): number | null {
  if (previous === null) return null
  return current - previous
}

export function todayTotals(rows: readonly DayTotals[]): DayTotals | undefined {
  return rows[rows.length - 1]
}

export function yesterdayTotals(rows: readonly DayTotals[]): DayTotals | undefined {
  return rows[rows.length - 2]
}

/** True when at least one log landed anywhere in the window. */
export function hasAnyData(rows: readonly DayTotals[]): boolean {
  return rows.some(
    (row) =>
      row.feedCount > 0 || row.sleepMinutes > 0 || row.diaperCount > 0 || row.solidCount > 0,
  )
}

/** `'today'`, `'yesterday'` or `dd/MM` — the UI maps the first two to t(). */
export type DayLabel = 'today' | 'yesterday' | string

export function dayLabel(row: DayTotals, rows: readonly DayTotals[]): DayLabel {
  const index = rows.findIndex((candidate) => candidate.dayKey === row.dayKey)
  if (index === rows.length - 1) return 'today'
  if (index === rows.length - 2) return 'yesterday'
  return `${String(row.date.getDate()).padStart(2, '0')}/${String(row.date.getMonth() + 1).padStart(2, '0')}`
}
