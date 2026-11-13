import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useActiveBaby } from '../../../core/baby/activeBaby'
import {
  BackupValidationError,
  downloadBackup,
  exportBackup,
  importBackup,
  type ImportMode,
} from '../../../core/db/backup'
import { getRepo } from '../../../core/db/repo'
import { t, type TranslationKey } from '../../../core/i18n'
import { isPersisted, isPersistSupported, persist } from '../../../core/platform'
import { Button } from '../../../ui/Button'
import { Card } from '../../../ui/Card'
import { Screen } from '../../../ui/Screen'
import { PrivacyToast } from '../components/PrivacyToast'
import { canImport, hasConsent, isDeleteConfirmed, setConsent } from '../logic/consent'

/** How long a confirmation stays on screen. */
const TOAST_MS = 3000

/**
 * Delay before reloading after a successful import. The store keeps the old
 * profile in memory, so a reload is the simplest way to re-read IndexedDB;
 * the short delay lets the toast be seen before the page restarts.
 */
const RELOAD_DELAY_MS = 1200

const INPUT_BASE =
  'w-full rounded-2xl border border-moss bg-canopy/70 px-4 py-3.5 text-[15px] text-cream caret-honey transition [color-scheme:dark] placeholder:text-mist/50 focus:border-honey/70'

const MODE_OPTIONS: readonly { value: ImportMode; labelKey: TranslationKey }[] = [
  { value: 'merge', labelKey: 'privacy.merge' },
  { value: 'replace', labelKey: 'privacy.replace' },
]

/**
 * T045 — data ownership screen: consent, plaintext backup export/import,
 * persistent-storage request and the "delete everything" control.
 *
 * No backup contents (or rows from it) are ever rendered or logged; the page
 * only reports counts, support status and success/failure.
 */
export function PrivacyPage() {
  const navigate = useNavigate()

  const [consent, setConsentState] = useState<boolean>(() => hasConsent())

  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [reloadingAfterImport, setReloadingAfterImport] = useState(false)
  const [importMode, setImportMode] = useState<ImportMode>('merge')
  const [importError, setImportError] = useState<TranslationKey | null>(null)

  const [persistSupported] = useState<boolean>(() => isPersistSupported())
  const [persisted, setPersisted] = useState(false)
  const [persistBusy, setPersistBusy] = useState(false)

  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<TranslationKey | null>(null)

  const [toast, setToast] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    void isPersisted().then((value) => {
      if (!cancelled) setPersisted(value)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (toast === null) return
    const timer = window.setTimeout(() => setToast(null), TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [toast])

  function showToast(message: string) {
    // A fresh message restarts the countdown, even for the same text.
    setToast(null)
    setToast(message)
  }

  function handleConsentChange(next: boolean) {
    setConsent(next)
    setConsentState(next)
    if (next) setImportError(null)
  }

  async function handleExport() {
    if (!consent || exporting) return
    setExporting(true)
    try {
      await downloadBackup(await exportBackup())
      showToast(t('privacy.exported'))
    } catch {
      showToast(t('common.error'))
    } finally {
      setExporting(false)
    }
  }

  function handlePickImport() {
    if (importing || reloadingAfterImport) return
    setImportError(null)
    fileInputRef.current?.click()
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0] ?? null
    // Allow re-selecting the same file after a failed attempt.
    input.value = ''
    if (file === null) return

    const gate = canImport(consent, true)
    if (!gate.ok) {
      setImportError('privacy.importNeedsConsent')
      return
    }

    setImporting(true)
    setImportError(null)
    try {
      const text = await file.text()
      const summary = await importBackup(text, { mode: importMode })
      const count = Object.values(summary.imported).reduce((total, rows) => total + rows, 0)

      setReloadingAfterImport(true)
      showToast(t('privacy.importDone', { count }))
      window.setTimeout(() => window.location.reload(), RELOAD_DELAY_MS)
    } catch (error) {
      setImportError(
        error instanceof BackupValidationError ? 'privacy.importError' : 'common.error',
      )
    } finally {
      setImporting(false)
    }
  }

  async function handlePersist() {
    if (!persistSupported || persisted || persistBusy) return
    setPersistBusy(true)
    try {
      const granted = await persist()
      setPersisted(granted)
      showToast(t(granted ? 'privacy.persistOn' : 'privacy.persistUnsupported'))
    } catch {
      showToast(t('privacy.persistUnsupported'))
    } finally {
      setPersistBusy(false)
    }
  }

  async function handleDelete() {
    if (!isDeleteConfirmed(confirmText) || deleting) return
    setDeleting(true)
    setDeleteError(null)

    try {
      const { db } = getRepo()
      // One transaction over every table: a failure leaves the data untouched.
      await db.transaction(
        'rw',
        [
          db.babies,
          db.logs,
          db.measurements,
          db.vaccineDoses,
          db.milestoneChecks,
          db.reminders,
        ],
        async () => {
          await db.babies.clear()
          await db.logs.clear()
          await db.measurements.clear()
          await db.vaccineDoses.clear()
          await db.milestoneChecks.clear()
          await db.reminders.clear()
        },
      )

      useActiveBaby.getState().clear()
      setConsent(false)
      showToast(t('privacy.deleted'))
      navigate('/onboarding', { replace: true })
    } catch {
      setDeleteError('common.error')
      setDeleting(false)
    }
  }

  const deleteReady = isDeleteConfirmed(confirmText)
  const confirmMismatch = confirmText.trim() !== '' && !deleteReady
  const importLocked = importing || reloadingAfterImport

  const persistStatus = !persistSupported
    ? t('privacy.persistUnsupported')
    : persisted
      ? t('privacy.persistOn')
      : t('privacy.persistHint')

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
          {t('privacy.title')}
        </h1>
        <p className="mt-2 text-[13px] text-mist">{t('privacy.subtitle')}</p>

        <p className="mt-2.5 text-[11.5px] text-mist">{t('common.localOnly')}</p>
      </header>

      <Card className="rise rise-2 mt-5">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => handleConsentChange(event.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-honey"
          />
          <span className="min-w-0 flex-1 text-[13.5px] leading-snug text-cream">
            {t('privacy.consentLabel')}
          </span>
        </label>

        {!consent && (
          <p role="status" className="mt-2.5 text-[12px] leading-relaxed text-ember">
            {t('privacy.consentNeeded')}
          </p>
        )}
      </Card>

      <Card className="rise rise-3 mt-3">
        <Button
          fullWidth
          disabled={!consent || exporting}
          onClick={() => {
            void handleExport()
          }}
        >
          {exporting ? t('common.saving') : t('privacy.export')}
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label={t('privacy.importPick')}
          onChange={(event) => {
            void handleFileChange(event)
          }}
        />

        <fieldset className="mt-3 border-0 p-0" disabled={!consent || importLocked}>
          <legend className="text-[11px] font-medium tracking-[0.14em] text-mist uppercase">
            {t('privacy.mode')}
          </legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {MODE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-center gap-2 rounded-2xl border px-3 py-2.5 text-[12.5px] transition ${
                  importMode === option.value
                    ? 'border-honey/60 bg-honey/10 text-cream'
                    : 'border-moss bg-canopy/60 text-mist hover:border-honey/30'
                }`}
              >
                <input
                  type="radio"
                  name="privacy-import-mode"
                  value={option.value}
                  checked={importMode === option.value}
                  onChange={() => setImportMode(option.value)}
                  className="h-4 w-4 shrink-0 accent-honey"
                />
                <span className="min-w-0">{t(option.labelKey)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <Button
          fullWidth
          variant="secondary"
          className="mt-3"
          disabled={!consent || importLocked}
          onClick={handlePickImport}
        >
          {importing ? t('common.saving') : t('privacy.import')}
        </Button>

        {!consent && (
          <p role="status" className="mt-3 text-[12px] leading-relaxed text-ember">
            {t('privacy.importNeedsConsent')}
          </p>
        )}

        {importError !== null && (
          <p role="alert" className="mt-3 text-[12px] leading-relaxed text-ember">
            {t(importError)}
          </p>
        )}

        <p className="mt-3 border-t border-moss/60 pt-3 text-[11.5px] leading-relaxed text-mist">
          {t('privacy.encryptionTodo')}
        </p>
      </Card>

      <Card className="rise rise-4 mt-3">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p
              className={`text-[12.5px] leading-snug ${
                persisted && persistSupported ? 'text-honey' : 'text-mist'
              }`}
            >
              {persistStatus}
            </p>
          </div>
          <Button
            variant="secondary"
            className="shrink-0"
            disabled={!persistSupported || persisted || persistBusy}
            onClick={() => {
              void handlePersist()
            }}
          >
            {persistBusy ? t('common.saving') : t('privacy.persist')}
          </Button>
        </div>
      </Card>

      <Card className="rise rise-5 mt-3 border-ember/40 bg-ember/5">
        <p className="text-[13px] leading-relaxed text-cream">{t('privacy.deleteWarning')}</p>

        <input
          type="text"
          value={confirmText}
          autoComplete="off"
          spellCheck={false}
          placeholder={t('privacy.deleteConfirmLabel')}
          aria-label={t('privacy.deleteConfirmLabel')}
          onChange={(event) => {
            setConfirmText(event.target.value)
            setDeleteError(null)
          }}
          className={`${INPUT_BASE} mt-3`}
        />

        {confirmMismatch && (
          <p role="status" className="mt-2 text-[12px] leading-relaxed text-ember">
            {t('privacy.deleteMismatch')}
          </p>
        )}

        {deleteError !== null && (
          <p role="alert" className="mt-2 text-[12px] leading-relaxed text-ember">
            {t(deleteError)}
          </p>
        )}

        <Button
          variant="danger"
          fullWidth
          className="mt-3"
          disabled={!deleteReady || deleting}
          onClick={() => {
            void handleDelete()
          }}
        >
          {deleting ? t('common.saving') : t('privacy.deleteConfirm')}
        </Button>
      </Card>

      {toast !== null && <PrivacyToast message={toast} />}
    </Screen>
  )
}
