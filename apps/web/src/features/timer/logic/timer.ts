// Pure timer rules for the breast-feed / sleep stopwatch (T012).
//
// A running timer is a persisted `LogEntry` with no `endAt` and the
// `{ timer: 'running' }` marker in its payload. Persisting it in IndexedDB
// (instead of localStorage) is what makes the counter survive a reload and
// keeps the entry atomic once it is stopped.
//
// Everything here is side-effect free so the rules can be tested without React
// or IndexedDB.
import type { LogEntry, LogPayload, LogType } from '../../../core/db/schema'
import { minutesBetween } from '../../../core/time/day'
import { TIMER_PAYLOAD_KEY, TIMER_RUNNING, isTimerRunning } from '../../logs/describeLog'

/** Only these log types can be timed. */
export type TimerType = Extract<LogType, 'feed_breast' | 'sleep'>

export const TIMER_TYPES: readonly TimerType[] = ['feed_breast', 'sleep']

export function isTimerType(type: LogType): type is TimerType {
  return (TIMER_TYPES as readonly LogType[]).includes(type)
}

/**
 * Newest still-running timer, or `null` when there is none.
 *
 * An entry counts as running only when it is a timer type, has no `endAt` and
 * carries the payload marker. The incoming order does not matter: the newest
 * `startAt` wins.
 */
export function findRunningTimer(entries: readonly LogEntry[]): LogEntry | null {
  let latest: LogEntry | null = null
  let latestMs = Number.NEGATIVE_INFINITY

  for (const entry of entries) {
    if (entry.endAt !== undefined) continue
    if (!isTimerType(entry.type)) continue
    if (!isTimerRunning(entry)) continue

    const startedMs = Date.parse(entry.startAt)
    if (!Number.isFinite(startedMs) || startedMs <= latestMs) continue

    latest = entry
    latestMs = startedMs
  }

  return latest
}

/** Whole minutes since the timer started, never negative. */
export function elapsedMinutes(entry: LogEntry, now: Date): number {
  return minutesBetween(entry.startAt, now)
}

/** Payload for a freshly started timer: the marker on top of any base data. */
export function startPayload(base: LogPayload = {}): LogPayload {
  return { ...base, [TIMER_PAYLOAD_KEY]: TIMER_RUNNING }
}

/** Payload for a stopped timer: the marker removed, everything else kept. */
export function stopPayload(payload: LogPayload): LogPayload {
  const next: LogPayload = { ...payload }
  delete next[TIMER_PAYLOAD_KEY]
  return next
}
