import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useActiveBaby } from '../../../core/baby/activeBaby'
import { getRepo } from '../../../core/db/repo'
import type { Reminder, ReminderRepeat } from '../../../core/db/schema'
import { t, type TranslationKey } from '../../../core/i18n'
import {
  getPermission,
  requestPermission,
  show as showNotification,
  type NotificationPermissionState,
} from '../../../core/platform'
import { Button } from '../../../ui/Button'
import { Card } from '../../../ui/Card'
import { Screen } from '../../../ui/Screen'
import { ReminderRow } from '../components/ReminderRow'
import { ReminderSheet, type ReminderFormError, type ReminderSheetInput } from '../components/ReminderSheet'
import { RemindersToast } from '../components/RemindersToast'
import { dueSoon, formatWhen, splitReminders } from '../logic/reminders'

type LoadState = 'loading' | 'ready' | 'error'

/** How long a confirmation stays on screen. */
const TOAST_MS = 3000

/** Repeat value -> chip copy. */
const REPEAT_LABEL: Readonly<Record<ReminderRepeat, TranslationKey>> = {
  none: 'reminders.repeat.none',
  daily: 'reminders.repeat.daily',
  weekly: 'reminders.repeat.weekly',
}

/** Permission state -> the matching reminders.* copy. */
function permissionLabel(permission: NotificationPermissionState): TranslationKey | null {
  switch (permission) {
    case 'granted':
      return 'reminders.notifyGranted'
    case 'denied':
      return 'reminders.notifyBlocked'
    case 'unsupported':
      return 'reminders.notifyUnsupported'
    case 'default':
      return null
  }
}

/**
 * T041 — parent-defined reminders, stored locally.
 *
 * Timestamps are persisted as ISO UTC by the repository; the page only ever
 * builds/reads local `Date` values, so "hôm nay" follows the device calendar.
 * Repeating reminders keep their stored `at` until the parent marks them done;
 * `nextOccurrence` documents the recurrence rule for the future scheduler.
 *
 * On mount, when the notification permission is already granted, at most one
 * notification is shown for the closest reminder due in the next 24 hours. The
 * page never asks for permission on its own — only the explicit button does.
 */
export function RemindersPage() {
  const baby = useActiveBaby((state) => state.baby)

  const [reminders, setReminders] = useState<Reminder[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [reloadToken, setReloadToken] = useState(0)

  const [permission, setPermission] = useState<NotificationPermissionState>(() => getPermission())
  const [asking, setAsking] = useState(false)

  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [writeError, setWriteError] = useState(false)

  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<ReminderFormError | null>(null)

  const [toast, setToast] = useState<TranslationKey | null>(null)

  /** The mount-time notification fires at most once, even after a re-render. */
  const notifiedRef = useRef(false)

  useEffect(() => {
    if (baby === null) return
    // Narrowed once: control-flow narrowing does not reach the async callback.
    const babyId = baby.id
    let cancelled = false

    setLoadState('loading')
    getRepo()
      .listReminders(babyId)
      .then((rows) => {
        if (cancelled) return
        setReminders(rows)
        setLoadState('ready')
      })
      .catch(() => {
        if (!cancelled) setLoadState('error')
      })

    return () => {
      cancelled = true
    }
  }, [baby, reloadToken])

  useEffect(() => {
    if (loadState !== 'ready' || notifiedRef.current) return
    if (getPermission() !== 'granted') return

    const next = dueSoon(reminders, new Date())[0]
    if (next === undefined) return

    notifiedRef.current = true
    // TODO(i18n): `reminders.notifyBody` is missing; the title is used as the
    // body so no copy is invented or borrowed from another feature.
    void showNotification({
      title: t('reminders.title'),
      body: next.title,
      tag: 'reminder-due-soon',
    })
  }, [loadState, reminders])

  useEffect(() => {
    if (toast === null) return
    const timer = window.setTimeout(() => setToast(null), TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [toast])

  function showToast(label: TranslationKey) {
    // A fresh message restarts the countdown, even for the same label.
    setToast(null)
    setToast(label)
  }

  async function reload(babyId: string) {
    setReminders(await getRepo().listReminders(babyId))
  }

  async function handleEnableNotifications() {
    if (asking) return
    setAsking(true)
    try {
      const next = await requestPermission()
      setPermission(next)
      showToast(next === 'granted' ? 'common.done' : 'common.error')
    } catch {
      showToast('common.error')
    } finally {
      setAsking(false)
    }
  }

  async function handleMarkDone(id: string) {
    const activeBaby = baby
    if (activeBaby === null || busyId !== null) return
    setBusyId(id)
    setWriteError(false)

    try {
      await getRepo().updateReminder(id, { doneAt: new Date() })
      await reload(activeBaby.id)
    } catch {
      setWriteError(true)
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(id: string) {
    const activeBaby = baby
    if (activeBaby === null || busyId !== null) return
    setBusyId(id)
    setWriteError(false)

    try {
      await getRepo().deleteReminder(id)
      setConfirmId(null)
      await reload(activeBaby.id)
    } catch {
      setWriteError(true)
    } finally {
      setBusyId(null)
    }
  }

  async function handleSave(input: ReminderSheetInput) {
    const activeBaby = baby
    if (activeBaby === null || saving) return

    const title = input.title.trim()
    if (title === '') {
      setSaveError('title')
      return
    }
    if (input.at === null) {
      setSaveError('when')
      return
    }

    const note = input.note.trim()
    setSaving(true)
    setSaveError(null)

    try {
      const repo = getRepo()
      await repo.addReminder({
        babyId: activeBaby.id,
        title,
        at: input.at,
        repeat: input.repeat,
        note: note === '' ? undefined : note,
      })
      await reload(activeBaby.id)
      setAdding(false)
      showToast('reminders.saved')
    } catch {
      // Keep the sheet (and the parent's edits) open.
      setSaveError('save')
    } finally {
      setSaving(false)
    }
  }

  if (baby === null) {
    return (
      <Screen>
        <p className="mt-24 text-center text-sm text-mist">{t('common.loading')}</p>
      </Screen>
    )
  }

  const now = new Date()
  const groups = splitReminders(reminders, now)
  const hasEarlier = groups.overdue.length > 0 || groups.today.length > 0
  const status = permissionLabel(permission)

  function renderRow(reminder: Reminder, overdue: boolean) {
    const done = reminder.doneAt !== undefined
    return (
      <li key={reminder.id}>
        <ReminderRow
          title={reminder.title}
          when={formatWhen(reminder.at)}
          repeatLabel={t(REPEAT_LABEL[reminder.repeat])}
          note={reminder.note}
          done={done}
          overdue={overdue}
          busy={busyId === reminder.id}
          confirming={confirmId === reminder.id}
          onMarkDone={() => {
            void handleMarkDone(reminder.id)
          }}
          onDeleteRequest={() => setConfirmId(reminder.id)}
          onDeleteCancel={() => setConfirmId(null)}
          onDeleteConfirm={() => {
            void handleDelete(reminder.id)
          }}
        />
      </li>
    )
  }

  function renderGroup(label: TranslationKey, items: Reminder[], tone: 'honey' | 'ember' | 'mist') {
    if (items.length === 0) return null

    const headingTone =
      tone === 'ember' ? 'text-ember' : tone === 'mist' ? 'text-mist' : 'text-honey/80'

    return (
      <section className="mt-6">
        <div className="flex items-center gap-3">
          <h2 className={`text-[11px] font-medium tracking-[0.16em] uppercase ${headingTone}`}>
            {t(label)}
          </h2>
          <span aria-hidden="true" className="h-px flex-1 bg-moss/70" />
          <span className="shrink-0 text-[11px] tabular-nums text-mist">{items.length}</span>
        </div>
        <ol className="mt-3 space-y-2">
          {items.map((reminder) => renderRow(reminder, tone === 'ember'))}
        </ol>
      </section>
    )
  }

  return (
    <Screen>
      <header className="rise rise-1">
        <Link
          to="/more"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-mist transition hover:text-cream"
        >
          <span aria-hidden="true" className="text-base leading-none">
            ‹
          </span>
          {t('common.back')}
        </Link>

        <p className="mt-5 text-[10.5px] font-medium tracking-[0.16em] text-honey/80 uppercase">
          {t('app.name')}
        </p>
        <h1 className="mt-2 font-display text-[2rem] leading-[1.05] tracking-[-0.02em] text-cream">
          {t('reminders.title')}
        </h1>
        <p className="mt-2 text-[13px] text-mist">{t('reminders.subtitle')}</p>

        <p className="mt-2.5 text-[11.5px] text-mist">{t('common.localOnly')}</p>
      </header>

      <Card className="rise rise-2 mt-5 flex items-center gap-3">
        <span aria-hidden="true" className="relative flex h-9 w-9 shrink-0 items-center justify-center">
          <span className="absolute inset-0 rounded-full bg-honey/12" />
          <span className="relative h-[7px] w-[7px] rounded-full bg-honey" />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] leading-snug font-medium text-cream">
            {t('reminders.enableNotifications')}
          </p>

          {status !== null && (
            <p
              role="status"
              className={`mt-0.5 text-[11.5px] ${
                permission === 'granted' ? 'text-honey' : 'text-ember'
              }`}
            >
              {t(status)}
            </p>
          )}
        </div>

        {permission === 'default' && (
          <Button
            variant="secondary"
            className="shrink-0"
            disabled={asking}
            onClick={() => {
              void handleEnableNotifications()
            }}
          >
            {asking ? t('common.saving') : t('reminders.enableNotifications')}
          </Button>
        )}
      </Card>

      <Button
        fullWidth
        className="rise rise-3 mt-4"
        onClick={() => {
          setSaveError(null)
          setAdding(true)
        }}
      >
        {t('reminders.add')}
      </Button>

      {loadState === 'loading' ? (
        <p className="mt-16 text-center text-sm text-mist">{t('common.loading')}</p>
      ) : loadState === 'error' ? (
        <div role="alert" className="mt-16 text-center">
          <p className="text-sm text-ember">{t('common.error')}</p>
          <Button
            variant="secondary"
            className="mt-3"
            onClick={() => setReloadToken((token) => token + 1)}
          >
            {t('common.retry')}
          </Button>
        </div>
      ) : reminders.length === 0 ? (
        <Card className="rise rise-4 mt-6 text-center">
          <p className="font-display text-[1.1rem] leading-snug text-cream">
            {t('reminders.empty')}
          </p>
        </Card>
      ) : (
        <div className="rise rise-4">
          {writeError && (
            <p role="alert" className="mt-4 text-center text-[12.5px] text-ember">
              {t('common.error')}
            </p>
          )}

          {renderGroup('reminders.overdue', groups.overdue, 'ember')}
          {renderGroup('reminders.dueToday', groups.today, 'honey')}

          {groups.upcoming.length > 0 && (
            <section className="mt-6">
              {/* TODO(i18n): `reminders.upcoming` ("Sắp tới") is missing from
                  `vi.json`, so the group is separated by a rule instead of a
                  borrowed `vaccines.upcoming` heading. */}
              {hasEarlier && <div aria-hidden="true" className="h-px bg-moss/70" />}
              <ol className={`space-y-2 ${hasEarlier ? 'mt-3' : ''}`}>
                {groups.upcoming.map((reminder) => renderRow(reminder, false))}
              </ol>
            </section>
          )}

          {renderGroup('reminders.done', groups.done, 'mist')}
        </div>
      )}

      {adding && (
        <ReminderSheet
          busy={saving}
          error={saveError}
          onSave={(input) => {
            void handleSave(input)
          }}
          onClose={() => {
            if (saving) return
            setSaveError(null)
            setAdding(false)
          }}
        />
      )}

      {toast !== null && <RemindersToast message={t(toast)} />}
    </Screen>
  )
}
