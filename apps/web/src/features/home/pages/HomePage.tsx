import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useActiveBaby } from '../../../core/baby/activeBaby'
import { getRepo } from '../../../core/db/repo'
import type { LogEntry, LogPayload, LogType, NewLogEntry } from '../../../core/db/schema'
import { t, type TranslationKey } from '../../../core/i18n'
import { getPermission, show as showNotification } from '../../../core/platform'
import { addDays, endOfDay, formatDuration, formatTime, startOfDay, toDayKey } from '../../../core/time/day'
import { Button } from '../../../ui/Button'
import { Card } from '../../../ui/Card'
import { Screen } from '../../../ui/Screen'
import { LogRow } from '../../logs/components/LogRow'
import { logMeta } from '../../logs/logMeta'
import { describeAge } from '../../profile/logic/age'
import { currentAuthor } from '../../auth/store'
import { TimerStrip } from '../../timer/components/TimerStrip'
import { BackfillSheet } from '../components/BackfillSheet'
import { QuickActionButton, type QuickIconName } from '../components/QuickActionButton'
import { QuickLogSheet, type SheetMode } from '../components/QuickLogSheet'
import { ReminderSettingsCard } from '../components/ReminderSettingsCard'
import { UndoToast } from '../components/UndoToast'
import type { BackfillResult } from '../logic/backfill'
import { buildQuickLog, pickDefaults, shouldAskAmount } from '../logic/quickLog'
import {
  dueReminders,
  lastDiaperAt,
  lastFeedAt,
  loadReminderSettings,
  saveReminderSettings,
  type ReminderSettings,
} from '../logic/reminderSettings'

/** How long the undo toast stays on screen. */
const UNDO_MS = 5000
/** Logs shown under the grid. */
const RECENT_LIMIT = 5
/** History window used to read the "last value" defaults. */
const LOOKBACK_DAYS = 30
/** Auto-dismissal of the inline error line. */
const ERROR_MS = 4000

type QuickActionKey = 'feed' | 'bottle' | 'solid' | 'diaper' | 'sleep' | 'more'

interface QuickAction {
  key: QuickActionKey
  labelKey: TranslationKey
  icon: QuickIconName
  accent: string
  /** Type logged on a single tap; `undefined` means "open the sheet". */
  type?: LogType
}

/**
 * Grid order: Bú mẹ · Bú bình · Tã / Ngủ · Ăn · Khác.
 *
 * Bottle feeding is the most-used tile in practice, so it gets a primary key;
 * temperature moved into "Khác" (it is logged less often and needs a sheet
 * anyway to enter a value).
 */
const QUICK_ACTIONS: readonly QuickAction[] = [
  { key: 'feed', labelKey: 'home.feed', icon: 'feed', accent: 'text-honey', type: 'feed_breast' },
  { key: 'bottle', labelKey: 'home.bottle', icon: 'bottle', accent: 'text-honey', type: 'feed_bottle' },
  { key: 'diaper', labelKey: 'home.diaper', icon: 'diaper', accent: 'text-[#8fb8a8]', type: 'diaper' },
  { key: 'sleep', labelKey: 'home.sleep', icon: 'sleep', accent: 'text-[#9c9cd8]', type: 'sleep' },
  { key: 'solid', labelKey: 'home.solid', icon: 'solid', accent: 'text-honey', type: 'solid' },
  { key: 'more', labelKey: 'home.more', icon: 'more', accent: 'text-mist' },
]

type LoadState = 'loading' | 'ready' | 'error'

interface SheetState {
  mode: SheetMode
  startAt: Date
}

interface ToastState {
  id: string
  labelKey: TranslationKey
  time: string
}

/** Type a held tile opens in the sheet ("Khác" keeps its chooser). */
function sheetModeFor(action: QuickAction): SheetMode {
  if (action.key === 'more') return 'more'
  return action.type ?? 'temp'
}

/**
 * T011 — home quick log: six big tiles, one tap writes with the last-known
 * defaults, a hold opens a two-field sheet, and every save can be undone for
 * five seconds. Timers (T012) are deliberately not part of this page.
 */
export function HomePage() {
  const baby = useActiveBaby((state) => state.baby)

  const [entries, setEntries] = useState<LogEntry[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [sheet, setSheet] = useState<SheetState | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [busy, setBusy] = useState(false)
  const [errorKey, setErrorKey] = useState<TranslationKey | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [backfillOpen, setBackfillOpen] = useState(false)
  const [reminderSettings, setReminderSettings] = useState<ReminderSettings>(() => loadReminderSettings())
  const [clock, setClock] = useState(() => Date.now())
  /** Notification tags already shown for the current due cycle. */
  const notifiedRef = useRef<Set<string>>(new Set())

  // One range query covers today's recap and the "last value" defaults.
  useEffect(() => {
    if (baby === null) return
    let cancelled = false
    setLoadState('loading')

    const now = new Date()
    getRepo()
      .listLogs(baby.id, addDays(startOfDay(now), -LOOKBACK_DAYS), endOfDay(now))
      .then((list) => {
        if (cancelled) return
        setEntries(list)
        setLoadState('ready')
      })
      .catch(() => {
        if (!cancelled) setLoadState('error')
      })

    return () => {
      cancelled = true
    }
  }, [baby, reloadToken])

  // The reminder banner must appear on its own while the page stays open.
  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const due = useMemo(
    () =>
      dueReminders(
        reminderSettings,
        lastFeedAt(entries),
        lastDiaperAt(entries),
        new Date(clock),
      ),
    [reminderSettings, entries, clock],
  )

  // Best-effort local notification, at most once per due cycle and only when
  // the parent already granted permission (never prompts from here).
  useEffect(() => {
    if (due.length === 0 || getPermission() !== 'granted') return
    for (const item of due) {
      const tag = `reminder-${item.kind}-${item.lastAt}`
      if (notifiedRef.current.has(tag)) continue
      notifiedRef.current.add(tag)
      void showNotification({
        title: t('reminderCard.dueTitle'),
        body: t(item.kind === 'feed' ? 'reminderCard.sinceFeed' : 'reminderCard.sinceDiaper', {
          duration: formatDuration(item.sinceMinutes),
        }),
        tag,
      })
    }
  }, [due])

  // The toast owns its own countdown; a new toast replaces the old timer.
  useEffect(() => {
    if (toast === null) return
    const timer = window.setTimeout(() => setToast(null), UNDO_MS)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (errorKey === null) return
    const timer = window.setTimeout(() => setErrorKey(null), ERROR_MS)
    return () => window.clearTimeout(timer)
  }, [errorKey])

  const todayKey = toDayKey(new Date())

  const todayEntries = useMemo(
    () =>
      entries
        .filter((entry) => toDayKey(new Date(entry.startAt)) === todayKey)
        .sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt)),
    [entries, todayKey],
  )

  const defaults = useMemo(() => pickDefaults(entries), [entries])

  const openSheet = useCallback((mode: SheetMode) => {
    setSheet({ mode, startAt: new Date() })
  }, [])

  async function saveEntry(entry: NewLogEntry) {
    if (busy) return
    setBusy(true)

    try {
      const saved = await getRepo().addLog(entry)
      setEntries((previous) => [saved, ...previous])
      setErrorKey(null)
      setToast({
        id: saved.id,
        labelKey: logMeta(saved.type).labelKey,
        time: formatTime(saved.startAt),
      })
    } catch {
      setErrorKey('common.error')
    } finally {
      setBusy(false)
    }
  }

  function handleQuickTap(type: LogType) {
    if (baby === null) return
    // Without a previous bottle volume there is nothing honest to record, so
    // the tap asks for it instead of writing an empty amount.
    if (shouldAskAmount(type, defaults)) {
      openSheet('feed_bottle')
      return
    }
    void saveEntry(buildQuickLog(type, baby.id, defaults, new Date(), currentAuthor()))
  }

  function handleSheetSave(type: LogType, payload: LogPayload) {
    if (baby === null || sheet === null) return
    const base = buildQuickLog(type, baby.id, defaults, sheet.startAt, currentAuthor())
    setSheet(null)
    void saveEntry({ ...base, payload: { ...base.payload, ...payload } })
  }

  function handleReminderSettings(next: ReminderSettings) {
    setReminderSettings(next)
    saveReminderSettings(next)
  }

  function handleBackfillSave(result: BackfillResult) {
    if (baby === null) return
    const entry: NewLogEntry = {
      babyId: baby.id,
      type: result.type,
      startAt: result.startAt,
      payload: result.payload,
      createdBy: currentAuthor(),
    }
    if (result.endAt !== undefined) entry.endAt = result.endAt
    setBackfillOpen(false)
    void saveEntry(entry)
  }

  function logNow(kind: 'feed' | 'diaper') {
    handleQuickTap(kind === 'feed' ? 'feed_breast' : 'diaper')
  }

  async function handleUndo() {
    if (toast === null) return
    const { id } = toast
    setToast(null)

    try {
      await getRepo().deleteLog(id)
      setEntries((previous) => previous.filter((entry) => entry.id !== id))
    } catch {
      setErrorKey('common.error')
    }
  }

  if (baby === null) {
    return (
      <Screen>
        <p className="mt-24 text-center text-sm text-mist">{t('common.loading')}</p>
      </Screen>
    )
  }

  const age = describeAge(baby)
  const name = baby.name.trim()
  const greeting = name === '' ? t('home.helloAnon') : t('home.hello', { name })

  return (
    <Screen>
      <header className="rise rise-1">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10.5px] font-medium tracking-[0.16em] text-honey/80 uppercase">
            {t('app.name')}
          </p>
          <Link
            to="/more"
            className="rounded-full border border-moss/80 px-3 py-1 text-[11px] leading-none font-medium text-mist transition hover:border-honey/50 hover:text-cream"
          >
            {t('more.title')}
          </Link>
        </div>
        <h1 className="mt-2 font-display text-[2rem] leading-[1.05] tracking-[-0.02em] text-cream text-balance">
          {greeting}
        </h1>
        <div className="mt-2 space-y-0.5">
          <p className="text-[13px] text-mist">{t('profile.age', { days: age.days })}</p>
          {age.isPremature && (
            <p className="text-[12px] text-mist/80">
              {t('profile.ageCorrected', { days: age.correctedDays })}
            </p>
          )}
        </div>
      </header>

      <div className="rise rise-2 mt-4">
        <TimerStrip babyId={baby.id} onChange={() => setReloadToken((value) => value + 1)} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="min-w-0 text-[11.5px] leading-relaxed text-mist/70">{t('home.quickHint')}</p>
        <Button
          variant="secondary"
          className="shrink-0 !min-h-9 !px-3 text-[12px]"
          onClick={() => setBackfillOpen(true)}
        >
          {t('home.backfill')}
        </Button>
      </div>

      {due.length > 0 && (
        <Card className="rise rise-2 mt-3 border-honey/40 bg-honey/[0.07]">
          <p className="text-[10.5px] font-medium tracking-[0.16em] text-honey/80 uppercase">
            {t('reminderCard.dueTitle')}
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {due.map((item) => (
              <li key={item.kind} className="flex items-center gap-2">
                <p className="min-w-0 flex-1 text-[13px] leading-snug text-cream">
                  {t(item.kind === 'feed' ? 'reminderCard.sinceFeed' : 'reminderCard.sinceDiaper', {
                    duration: formatDuration(item.sinceMinutes),
                  })}
                </p>
                <Button
                  variant="secondary"
                  className="!min-h-9 shrink-0 !px-3 text-[12px]"
                  onClick={() => logNow(item.kind)}
                >
                  {t('reminderCard.logNow')}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        {QUICK_ACTIONS.map((action, index) => (
          <QuickActionButton
            key={action.key}
            label={t(action.labelKey)}
            icon={action.icon}
            accent={action.accent}
            delayClass={`rise rise-${index + 1}`}
            disabled={busy}
            onTap={() => {
              if (action.type === undefined) openSheet(sheetModeFor(action))
              else handleQuickTap(action.type)
            }}
            onLongPress={() => openSheet(sheetModeFor(action))}
          />
        ))}
      </div>

      <div className="rise rise-6 mt-4">
        <ReminderSettingsCard settings={reminderSettings} onChange={handleReminderSettings} />
      </div>

      {errorKey !== null && (
        <p role="alert" className="mt-3 text-[12.5px] text-ember">
          {t(errorKey)}
        </p>
      )}

      <section className="rise rise-6 mt-6">
        <Card>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[13px] font-medium text-cream">
              {t('home.todayCount', { count: todayEntries.length })}
            </h2>
            <Link
              to="/timeline"
              className="shrink-0 text-[12px] font-medium text-honey transition hover:text-honey/80"
            >
              {t('home.seeTimeline')}
            </Link>
          </div>

          <div className="mt-3 space-y-1.5">
            {loadState === 'loading' ? (
              <p className="text-[13px] text-mist">{t('common.loading')}</p>
            ) : loadState === 'error' ? (
              <p className="text-[13px] text-ember">{t('common.error')}</p>
            ) : todayEntries.length === 0 ? (
              <p className="text-[13px] text-mist">{t('home.empty')}</p>
            ) : (
              todayEntries
                .slice(0, RECENT_LIMIT)
                .map((entry) => <LogRow key={entry.id} entry={entry} />)
            )}
          </div>
        </Card>
      </section>

      {backfillOpen && (
        <BackfillSheet
          defaults={defaults}
          busy={busy}
          onSave={handleBackfillSave}
          onClose={() => setBackfillOpen(false)}
        />
      )}

      {sheet !== null && (
        <QuickLogSheet
          mode={sheet.mode}
          defaults={defaults}
          startAt={sheet.startAt}
          busy={busy}
          onSave={handleSheetSave}
          onClose={() => setSheet(null)}
        />
      )}

      {toast !== null && (
        <UndoToast
          message={t('home.logged', { label: t(toast.labelKey), time: toast.time })}
          onUndo={() => {
            void handleUndo()
          }}
        />
      )}
    </Screen>
  )
}
