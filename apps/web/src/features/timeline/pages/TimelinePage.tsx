import { useEffect, useState } from 'react'
import { useActiveBaby } from '../../../core/baby/activeBaby'
import { getRepo } from '../../../core/db/repo'
import type { LogEntry, LogPatch } from '../../../core/db/schema'
import { t, type TranslationKey } from '../../../core/i18n'
import { addDays, toDayKey } from '../../../core/time/day'
import { Button } from '../../../ui/Button'
import { Card } from '../../../ui/Card'
import { Screen } from '../../../ui/Screen'
import { LogRow } from '../../logs/components/LogRow'
import { EditLogSheet } from '../components/EditLogSheet'
import { TimelineToast } from '../components/TimelineToast'
import { dayRange, sortNewestFirst } from '../logic/dayWindow'

/** How long a save/delete confirmation stays on screen. */
const TOAST_MS = 3000

type LoadState = 'loading' | 'ready' | 'error'

interface ToastState {
  label: TranslationKey
}

/** "dd/MM/yyyy" in the device timezone; digits only, no locale dependency. */
function formatDayLabel(day: Date): string {
  const dd = String(day.getDate()).padStart(2, '0')
  const mm = String(day.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${day.getFullYear()}`
}

/**
 * T013 — one local day at a time.
 *
 * The list is the source of truth for the count and the empty state; tapping a
 * row opens a sheet that edits the start time (and the note, plus the end time
 * of a finished sleep), or deletes the entry after an inline confirmation.
 * Every write re-queries the day so a log moved to another date leaves the
 * list immediately.
 */
export function TimelinePage() {
  const baby = useActiveBaby((state) => state.baby)

  const [day, setDay] = useState<Date>(() => new Date())
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [reloadToken, setReloadToken] = useState(0)
  const [editing, setEditing] = useState<LogEntry | null>(null)
  const [busy, setBusy] = useState(false)
  const [writeError, setWriteError] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)

  useEffect(() => {
    if (baby === null) return
    let cancelled = false
    setLoadState('loading')

    const { from, to } = dayRange(day)
    getRepo()
      .listLogs(baby.id, from, to)
      .then((list) => {
        if (cancelled) return
        setEntries(sortNewestFirst(list))
        setLoadState('ready')
      })
      .catch(() => {
        if (!cancelled) setLoadState('error')
      })

    return () => {
      cancelled = true
    }
  }, [baby, day, reloadToken])

  useEffect(() => {
    if (toast === null) return
    const timer = window.setTimeout(() => setToast(null), TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [toast])

  const isToday = toDayKey(day) === toDayKey(new Date())

  function showToast(label: TranslationKey) {
    // A fresh object each time restarts the countdown, even for the same label.
    setToast({ label })
  }

  async function handleSave(patch: LogPatch) {
    if (editing === null || busy) return
    const target = editing
    setBusy(true)
    setWriteError(false)

    try {
      await getRepo().updateLog(target.id, patch)
      setEditing(null)
      showToast('logs.saved')
      setReloadToken((token) => token + 1)
    } catch {
      // Keep the sheet (and the user's edits) open.
      setWriteError(true)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (editing === null || busy) return
    const target = editing
    setBusy(true)
    setWriteError(false)

    try {
      await getRepo().deleteLog(target.id)
      setEditing(null)
      showToast('logs.deleted')
      setReloadToken((token) => token + 1)
    } catch {
      setWriteError(true)
    } finally {
      setBusy(false)
    }
  }

  if (baby === null) {
    return (
      <Screen>
        <p className="mt-24 text-center text-sm text-mist">{t('common.loading')}</p>
      </Screen>
    )
  }

  const dayLabel = isToday ? t('common.today') : formatDayLabel(day)

  return (
    <Screen>
      <header className="rise rise-1">
        <p className="text-[10.5px] font-medium tracking-[0.16em] text-honey/80 uppercase">
          {t('app.name')}
        </p>
        <h1 className="mt-2 font-display text-[2rem] leading-[1.05] tracking-[-0.02em] text-cream">
          {t('timeline.title')}
        </h1>
      </header>

      <nav aria-label={t('timeline.title')} className="rise rise-2 mt-5">
        <div className="flex items-center gap-1 rounded-2xl border border-moss/80 bg-canopy/50 p-1">
          <button
            type="button"
            onClick={() => setDay((current) => addDays(current, -1))}
            aria-label={t('timeline.dayPrev')}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-mist transition hover:bg-canopy hover:text-cream active:scale-95"
          >
            <Chevron direction="left" />
          </button>

          <p className="min-w-0 flex-1 text-center">
            <span className="block font-display text-[1.3rem] leading-tight tracking-[-0.01em] text-cream tabular-nums">
              {dayLabel}
            </span>
          </p>

          <button
            type="button"
            onClick={() => setDay((current) => addDays(current, 1))}
            disabled={isToday}
            aria-label={t('timeline.dayNext')}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-mist transition hover:bg-canopy hover:text-cream active:scale-95 disabled:pointer-events-none disabled:opacity-30"
          >
            <Chevron direction="right" />
          </button>
        </div>

        {!isToday && (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => setDay(new Date())}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-honey/30 bg-honey/10 px-3.5 text-[12.5px] font-medium text-honey transition hover:bg-honey/15 active:scale-95"
            >
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-honey" />
              {t('common.today')}
            </button>
          </div>
        )}
      </nav>

      <div className="rise rise-3 mt-6 flex items-center gap-3">
        <span aria-hidden="true" className="h-px flex-1 bg-moss/70" />
        {loadState === 'ready' && (
          <h2 className="text-[12px] font-medium text-mist">
            {t('timeline.count', { count: entries.length })}
          </h2>
        )}
      </div>

      {loadState === 'loading' ? (
        <p className="mt-8 text-center text-sm text-mist">{t('common.loading')}</p>
      ) : loadState === 'error' ? (
        <div role="alert" className="mt-8 text-center">
          <p className="text-sm text-ember">{t('common.error')}</p>
          <Button
            variant="secondary"
            className="mt-3"
            onClick={() => setReloadToken((token) => token + 1)}
          >
            {t('common.retry')}
          </Button>
        </div>
      ) : entries.length === 0 ? (
        <Card className="rise rise-4 mt-3 text-center">
          <p className="font-display text-[1.1rem] leading-snug text-cream">{t('timeline.empty')}</p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-mist">{t('timeline.emptyHint')}</p>
        </Card>
      ) : (
        <ol className="mt-3 space-y-2">
          {entries.map((entry, index) => (
            <li key={entry.id} className={`rise ${index < 6 ? `rise-${index + 1}` : ''}`.trim()}>
              <LogRow entry={entry} onSelect={(selected) => setEditing(selected)} />
            </li>
          ))}
        </ol>
      )}

      {editing !== null && (
        <EditLogSheet
          key={editing.id}
          entry={editing}
          busy={busy}
          error={writeError}
          onSave={(patch) => {
            void handleSave(patch)
          }}
          onDelete={() => {
            void handleDelete()
          }}
          onClose={() => {
            if (busy) return
            setWriteError(false)
            setEditing(null)
          }}
        />
      )}

      {toast !== null && <TimelineToast message={t(toast.label)} />}
    </Screen>
  )
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`h-5 w-5 ${direction === 'left' ? '' : 'rotate-180'}`.trim()}
    >
      <path d="M14.5 5 8 12l6.5 7" />
    </svg>
  )
}
