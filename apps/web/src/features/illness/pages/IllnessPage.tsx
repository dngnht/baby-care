import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useActiveBaby } from '../../../core/baby/activeBaby'
import { currentAuthor } from '../../auth/store'
import { addLog, deleteLog, listLogs } from '../../../core/db/repo'
import type { LogEntry } from '../../../core/db/schema'
import { t, type TranslationKey } from '../../../core/i18n'
import { Button } from '../../../ui/Button'
import { Card } from '../../../ui/Card'
import { Screen } from '../../../ui/Screen'
import { IllnessRow } from '../components/IllnessRow'
import {
  IllnessSheet,
  type IllnessFormError,
  type IllnessSheetInput,
} from '../components/IllnessSheet'
import { IllnessToast } from '../components/IllnessToast'
import {
  buildIllnessPayload,
  filterIllnessLogs,
  illnessWindow,
  parseTempInput,
  summarizeIllness,
} from '../logic/illness'

type LoadState = 'loading' | 'ready' | 'error'

/** How long a delete confirmation stays on screen. */
const TOAST_MS = 3000

/** Author recorded on every entry created from this page. */

async function loadIllnessLogs(babyId: string): Promise<LogEntry[]> {
  const { from, to } = illnessWindow(new Date())
  const rows = await listLogs(babyId, from, to)
  return filterIllnessLogs(rows, { from, to })
}

/**
 * T044 — a neutral record of the last 14 days of temperature, symptoms and
 * medicine, so the parent can bring it to an appointment.
 *
 * The page only stores what the parent typed: it never interprets a reading,
 * never labels anything as concerning, and never suggests a dose. Every write
 * re-queries the window so the count and the list stay in sync.
 */
export function IllnessPage() {
  const baby = useActiveBaby((state) => state.baby)

  const [entries, setEntries] = useState<LogEntry[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [reloadToken, setReloadToken] = useState(0)

  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<IllnessFormError | null>(null)

  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [writeError, setWriteError] = useState(false)

  const [toast, setToast] = useState<TranslationKey | null>(null)

  useEffect(() => {
    if (baby === null) return
    // Narrowed once: control-flow narrowing does not reach the async callback.
    const babyId = baby.id
    let cancelled = false

    setLoadState('loading')
    loadIllnessLogs(babyId)
      .then((rows) => {
        if (cancelled) return
        setEntries(rows)
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
    setEntries(await loadIllnessLogs(babyId))
  }

  async function handleSave(input: IllnessSheetInput) {
    const activeBaby = baby
    if (activeBaby === null || saving) return

    const payload =
      input.kind === 'temp'
        ? buildIllnessPayload('temp', { tempC: parseTempInput(input.tempText) })
        : buildIllnessPayload(input.kind, { text: input.text })

    if (payload === null) {
      // No dedicated copy for a rejected value; the field is highlighted and
      // the generic error is announced next to it.
      setSaveError(input.kind === 'temp' ? 'temp' : 'text')
      return
    }

    setSaving(true)
    setSaveError(null)

    try {
      await addLog({
        babyId: activeBaby.id,
        type: input.kind,
        startAt: new Date(),
        payload,
        createdBy: currentAuthor(),
      })
      await reload(activeBaby.id)
      setAdding(false)
      showToast('logs.saved')
    } catch {
      // Keep the sheet (and the parent's input) open.
      setSaveError('save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    const activeBaby = baby
    if (activeBaby === null || busyId !== null) return

    setBusyId(id)
    setWriteError(false)

    try {
      await deleteLog(id)
      setConfirmId(null)
      await reload(activeBaby.id)
      showToast('logs.deleted')
    } catch {
      setWriteError(true)
    } finally {
      setBusyId(null)
    }
  }

  if (baby === null) {
    return (
      <Screen>
        <p className="mt-24 text-center text-sm text-mist">{t('common.loading')}</p>
      </Screen>
    )
  }

  const summary = summarizeIllness(entries)

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
          {t('illness.title')}
        </h1>
        <p className="mt-2 text-[13px] text-mist">{t('illness.subtitle')}</p>
      </header>

      <Card className="rise rise-2 mt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10.5px] font-medium tracking-[0.14em] text-mist/80 uppercase">
              {t('illness.range')}
            </p>
            <p className="mt-1.5 font-display text-[1.45rem] leading-none text-cream">
              {t('illness.count', { count: summary.count })}
            </p>
          </div>

          {summary.tempMax !== undefined && (
            <span className="shrink-0 rounded-full border border-ember/40 bg-ember/10 px-3 py-1.5 text-[12px] font-medium text-ember tabular-nums">
              {t('illness.tempMax', { max: summary.tempMax.toFixed(1) })}
            </span>
          )}
        </div>

        <dl className="mt-4 grid grid-cols-3 divide-x divide-moss/60 border-t border-moss/70 pt-3">
          <div className="px-1 text-center">
            <dt className="text-[10px] font-medium tracking-[0.1em] text-mist/80 uppercase">
              {t('logs.type.temp')}
            </dt>
            <dd className="mt-0.5 font-display text-[1.15rem] leading-none text-cream tabular-nums">
              {summary.tempCount}
            </dd>
          </div>
          <div className="px-1 text-center">
            <dt className="text-[10px] font-medium tracking-[0.1em] text-mist/80 uppercase">
              {t('logs.type.symptom')}
            </dt>
            <dd className="mt-0.5 font-display text-[1.15rem] leading-none text-cream tabular-nums">
              {summary.symptomCount}
            </dd>
          </div>
          <div className="px-1 text-center">
            <dt className="text-[10px] font-medium tracking-[0.1em] text-mist/80 uppercase">
              {t('logs.type.med')}
            </dt>
            <dd className="mt-0.5 font-display text-[1.15rem] leading-none text-cream tabular-nums">
              {summary.medCount}
            </dd>
          </div>
        </dl>
      </Card>

      <Button
        fullWidth
        className="rise rise-3 mt-4"
        onClick={() => {
          setSaveError(null)
          setAdding(true)
        }}
      >
        {t('illness.addTitle')}
      </Button>

      {loadState === 'loading' ? (
        <p className="mt-10 text-center text-sm text-mist">{t('common.loading')}</p>
      ) : loadState === 'error' ? (
        <div role="alert" className="mt-10 text-center">
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
        <Card className="rise rise-4 mt-5 text-center">
          <p className="font-display text-[1.1rem] leading-snug text-cream">{t('illness.empty')}</p>
        </Card>
      ) : (
        <div className="rise rise-4 mt-5">
          {writeError && (
            <p role="alert" className="mb-3 text-center text-[12.5px] text-ember">
              {t('common.error')}
            </p>
          )}

          <ol className="space-y-2">
            {entries.map((entry) => (
              <li key={entry.id}>
                <IllnessRow
                  entry={entry}
                  busy={busyId === entry.id}
                  confirming={confirmId === entry.id}
                  onDeleteRequest={() => setConfirmId(entry.id)}
                  onDeleteCancel={() => setConfirmId(null)}
                  onDeleteConfirm={() => {
                    void handleDelete(entry.id)
                  }}
                />
              </li>
            ))}
          </ol>
        </div>
      )}

      <p className="mt-6 text-[11.5px] leading-relaxed text-mist/80">{t('illness.disclaimer')}</p>

      {adding && (
        <IllnessSheet
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

      {toast !== null && <IllnessToast message={t(toast)} />}
    </Screen>
  )
}
