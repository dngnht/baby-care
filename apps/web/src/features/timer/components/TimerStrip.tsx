// Compact timer card for the home screen: shows the running counter with one
// stop button, or the two start buttons when idle.
//
// The card is self-contained (it owns its `useTimer` state) so the parent page
// only passes the baby id and refreshes its log list through `onChange`.
import { useCallback } from 'react'
import { t } from '../../../core/i18n'
import { formatDuration, formatTime } from '../../../core/time/day'
import { Button } from '../../../ui/Button'
import { Card } from '../../../ui/Card'
import { useTimer } from '../hooks/useTimer'
import type { TimerType } from '../logic/timer'

export interface TimerStripProps {
  babyId: string
  /** Called after a successful start or stop so the parent can reload logs. */
  onChange?: () => void
}

export function TimerStrip({ babyId, onChange }: TimerStripProps) {
  const { running, busy, error, start, stop, elapsed } = useTimer(babyId)

  const handleStart = useCallback(
    (type: TimerType): void => {
      void start(type).then((started) => {
        if (started) onChange?.()
      })
    },
    [start, onChange],
  )

  const handleStop = useCallback((): void => {
    void stop().then((stopped) => {
      if (stopped) onChange?.()
    })
  }, [stop, onChange])

  const errorLine =
    error === null ? null : (
      <p role="alert" className="mt-2 text-[12px] text-ember">
        {error}
      </p>
    )

  if (running !== null) {
    const labelKey = running.type === 'sleep' ? 'timer.runningSleep' : 'timer.runningFeed'

    return (
      <Card className="relative overflow-hidden">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 shrink-0 rounded-full bg-honey motion-safe:animate-pulse"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-mist">
              {t(labelKey)}
            </p>
            <p className="mt-1 font-display text-3xl leading-none tabular-nums text-cream">
              {formatDuration(elapsed)}
            </p>
            <p aria-live="polite" className="mt-1 text-[12px] tabular-nums text-mist">
              {t('timer.since', { time: formatTime(running.startAt) })}
            </p>
          </div>
          <Button variant="danger" onClick={handleStop} disabled={busy}>
            {t('timer.stop')}
          </Button>
        </div>
        {errorLine}
      </Card>
    )
  }

  return (
    <Card>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => handleStart('feed_breast')} disabled={busy}>
          {t('timer.startFeed')}
        </Button>
        <Button variant="secondary" onClick={() => handleStart('sleep')} disabled={busy}>
          {t('timer.startSleep')}
        </Button>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-mist">{t('timer.runningHint')}</p>
      {errorLine}
    </Card>
  )
}
