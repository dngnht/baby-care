// React binding for the persisted timer.
//
// The hook owns the on-screen state only: the source of truth is always the
// `LogEntry` row in IndexedDB, restored through `loadRunningTimer` on mount so a
// reload picks the counter up exactly where it stopped.
import { useCallback, useEffect, useRef, useState } from 'react'
import { getRepo } from '../../../core/db/repo'
import type { LogEntry } from '../../../core/db/schema'
import { t } from '../../../core/i18n'
import { elapsedMinutes, type TimerType } from '../logic/timer'
import { currentAuthor } from '../../auth/store'
import { loadRunningTimer, startTimer, stopTimer } from '../logic/timerService'

/** How often the displayed duration is recomputed. */
export const TICK_INTERVAL_MS = 30_000

export interface UseTimerResult {
  /** The row currently counting, or `null`. */
  running: LogEntry | null
  /** True while a DB read or write is in flight. */
  busy: boolean
  /** Localized failure message, or `null`. */
  error: string | null
  /** Start a timer; resolves `true` when it was persisted. */
  start: (type: TimerType) => Promise<boolean>
  /** Stop the running timer; resolves `true` when it was closed. */
  stop: () => Promise<boolean>
  /** Whole minutes since `running.startAt`; `0` when idle. */
  elapsed: number
}

export function useTimer(babyId: string): UseTimerResult {
  const [running, setRunning] = useState<LogEntry | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  // Restore after a reload (or a baby switch) from the database, never from
  // localStorage.
  useEffect(() => {
    let cancelled = false
    setBusy(true)
    setError(null)

    loadRunningTimer(getRepo(), babyId)
      .then((entry) => {
        if (cancelled) return
        setRunning(entry)
        setElapsed(entry === null ? 0 : elapsedMinutes(entry, new Date()))
      })
      .catch(() => {
        if (!cancelled) setError(t('common.error'))
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })

    return () => {
      cancelled = true
    }
  }, [babyId])

  // Recompute immediately on (re)start, then every 30s while counting.
  useEffect(() => {
    if (running === null) {
      setElapsed(0)
      return
    }

    const tick = (): void => setElapsed(elapsedMinutes(running, new Date()))
    tick()
    const intervalId = window.setInterval(tick, TICK_INTERVAL_MS)
    return () => window.clearInterval(intervalId)
  }, [running])

  const start = useCallback(
    async (type: TimerType): Promise<boolean> => {
      setBusy(true)
      setError(null)
      try {
        const entry = await startTimer(getRepo(), babyId, type, new Date(), currentAuthor())
        if (aliveRef.current) {
          setRunning(entry)
          setElapsed(0)
        }
        return true
      } catch {
        if (aliveRef.current) setError(t('common.error'))
        return false
      } finally {
        if (aliveRef.current) setBusy(false)
      }
    },
    [babyId],
  )

  const stop = useCallback(async (): Promise<boolean> => {
    if (running === null) return false

    setBusy(true)
    setError(null)
    try {
      await stopTimer(getRepo(), running)
      if (aliveRef.current) {
        setRunning(null)
        setElapsed(0)
      }
      return true
    } catch {
      if (aliveRef.current) setError(t('common.error'))
      return false
    } finally {
      if (aliveRef.current) setBusy(false)
    }
  }, [running])

  return { running, busy, error, start, stop, elapsed }
}
