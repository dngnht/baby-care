// Persistence side of the timer: the only place that touches the repository.
//
// The service takes a `Repo` explicitly (instead of importing `getRepo`) so the
// rules stay testable against an isolated `fake-indexeddb` database.
import type { Repo } from '../../../core/db/repo'
import type { LogEntry } from '../../../core/db/schema'
import { MS_PER_DAY } from '../../../core/time/day'
import { findRunningTimer, startPayload, stopPayload, type TimerType } from './timer'

/** How far back a running timer is looked up after a reload. */
export const TIMER_LOOKBACK_DAYS = 2

/** Author recorded on entries created by the timer strip. */
export const TIMER_CREATED_BY = 'parent'

/** Inclusive window scanned when restoring a timer. */
export function timerWindow(now: Date): { from: Date; to: Date } {
  return { from: new Date(now.getTime() - TIMER_LOOKBACK_DAYS * MS_PER_DAY), to: new Date(now) }
}

/**
 * Restore the running timer from the database.
 *
 * Only the last 48 hours are scanned: a timer older than that is considered
 * abandoned and is left untouched in the log.
 */
export async function loadRunningTimer(
  repo: Repo,
  babyId: string,
  now: Date = new Date(),
): Promise<LogEntry | null> {
  const { from, to } = timerWindow(now)
  const entries = await repo.listLogs(babyId, from, to)
  return findRunningTimer(entries)
}

/**
 * Persist a new running timer and return the stored entry.
 *
 * Throws when a timer is already running: two concurrent counters would make
 * the log ambiguous, so the caller must stop the current one first.
 */
export async function startTimer(
  repo: Repo,
  babyId: string,
  type: TimerType,
  now: Date = new Date(),
  createdBy: string = TIMER_CREATED_BY,
): Promise<LogEntry> {
  const existing = await loadRunningTimer(repo, babyId, now)
  if (existing !== null) {
    throw new Error(`A ${existing.type} timer is already running for baby ${babyId}`)
  }

  return repo.addLog({
    babyId,
    type,
    startAt: now,
    payload: startPayload(),
    createdBy,
  })
}

/**
 * Close a running timer: stamp `endAt` and drop the running marker so the log
 * becomes a normal, finished entry.
 */
export async function stopTimer(
  repo: Repo,
  entry: LogEntry,
  now: Date = new Date(),
): Promise<LogEntry> {
  return repo.updateLog(entry.id, {
    endAt: now,
    payload: stopPayload(entry.payload),
  })
}
