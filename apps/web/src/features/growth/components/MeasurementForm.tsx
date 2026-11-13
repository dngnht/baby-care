import { useEffect, useState, type FormEvent } from 'react'
import { getRepo } from '../../../core/db/repo'
import type { Baby } from '../../../core/db/schema'
import { t, type TranslationKey } from '../../../core/i18n'
import { toDayKey } from '../../../core/time/day'
import { Button } from '../../../ui/Button'
import { Card } from '../../../ui/Card'
import { parseMeasurementInput, type MeasurementError } from '../logic/measurementForm'

/** How long the "đã lưu" confirmation stays on screen. */
const SAVED_MS = 2500

const INPUT_CLASS =
  'w-full min-h-12 rounded-2xl border border-moss bg-night/60 px-4 py-3 text-[15px] text-cream caret-honey tabular-nums transition [color-scheme:dark] placeholder:text-mist/40 focus:border-honey/70'

/**
 * Form error → dictionary key. Range/empty are separate messages because a
 * typo (e.g. 5000 g typed as kg) needs a different hint from "add a value".
 */
const ERROR_KEY: Readonly<Record<MeasurementError, TranslationKey>> = {
  date: 'growth.formErrorDate',
  empty: 'growth.formError',
  range: 'growth.formErrorRange',
}

export interface MeasurementFormProps {
  baby: Baby
  /** Called after the measurement is persisted, so the page can reload. */
  onSaved: () => void
}

/**
 * "Thêm số đo" card (T020): date + the three optional measurements.
 *
 * Every box starts empty on purpose — the form never pre-fills a weight or a
 * length (AGENTS rule 2). Validation is local and synchronous; the z-score is
 * computed by the page from the stored record via `zForMeasurement`.
 */
export function MeasurementForm({ baby, onSaved }: MeasurementFormProps) {
  const [dateKey, setDateKey] = useState(() => toDayKey(new Date()))
  const [weightG, setWeightG] = useState('')
  const [lengthCm, setLengthCm] = useState('')
  const [headCm, setHeadCm] = useState('')

  const [error, setError] = useState<MeasurementError | null>(null)
  const [writeFailed, setWriteFailed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!saved) return
    const timer = window.setTimeout(() => setSaved(false), SAVED_MS)
    return () => window.clearTimeout(timer)
  }, [saved])

  function clearFeedback() {
    setError(null)
    setWriteFailed(false)
    setSaved(false)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return

    const parsed = parseMeasurementInput({
      babyId: baby.id,
      birthDate: new Date(baby.birthDate),
      date: dateKey,
      weightG,
      lengthCm,
      headCm,
    })
    if (!parsed.ok) {
      setSaved(false)
      setError(parsed.error)
      return
    }

    setSaving(true)
    setError(null)
    setWriteFailed(false)
    try {
      await getRepo().addMeasurement(parsed.value)
      // Keep the date (parents often log several boxes for one visit) but
      // clear the numbers so the next tap cannot duplicate a measurement.
      setWeightG('')
      setLengthCm('')
      setHeadCm('')
      setSaved(true)
      onSaved()
    } catch {
      // Keep the typed values so the parent can simply tap "Lưu số đo" again.
      setWriteFailed(true)
      setSaved(false)
    } finally {
      setSaving(false)
    }
  }

  const errorId = error === null ? undefined : 'growth-form-error'

  return (
    <Card className="mt-6">
      <h2 className="font-display text-base text-cream">{t('growth.addTitle')}</h2>

      <form className="mt-4 space-y-3" onSubmit={(event) => void handleSubmit(event)} noValidate>
        <div>
          <label
            htmlFor="growth-date"
            className="mb-1.5 block text-[12.5px] font-medium text-cream/85"
          >
            {t('growth.dateLabel')}
          </label>
          <input
            id="growth-date"
            name="date"
            type="date"
            required
            max={toDayKey(new Date())}
            value={dateKey}
            aria-invalid={error === 'date'}
            aria-describedby={error === 'date' ? errorId : undefined}
            onChange={(event) => {
              setDateKey(event.target.value)
              clearFeedback()
            }}
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label
            htmlFor="growth-weight"
            className="mb-1.5 block text-[12.5px] font-medium text-cream/85"
          >
            {t('growth.weightLabel')}
          </label>
          <input
            id="growth-weight"
            name="weightG"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="done"
            value={weightG}
            aria-invalid={error === 'range'}
            aria-describedby={error === 'range' ? errorId : undefined}
            onChange={(event) => {
              setWeightG(event.target.value)
              clearFeedback()
            }}
            className={INPUT_CLASS}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="min-w-0">
            <label
              htmlFor="growth-length"
              className="mb-1.5 block text-[12.5px] font-medium text-cream/85"
            >
              {t('growth.lengthLabel')}
            </label>
            <input
              id="growth-length"
              name="lengthCm"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="done"
              value={lengthCm}
              aria-invalid={error === 'range'}
              aria-describedby={error === 'range' ? errorId : undefined}
              onChange={(event) => {
                setLengthCm(event.target.value)
                clearFeedback()
              }}
              className={INPUT_CLASS}
            />
          </div>

          <div className="min-w-0">
            <label
              htmlFor="growth-head"
              className="mb-1.5 block text-[12.5px] font-medium text-cream/85"
            >
              {t('growth.headLabel')}
            </label>
            <input
              id="growth-head"
              name="headCm"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="done"
              value={headCm}
              aria-invalid={error === 'range'}
              aria-describedby={error === 'range' ? errorId : undefined}
              onChange={(event) => {
                setHeadCm(event.target.value)
                clearFeedback()
              }}
              className={INPUT_CLASS}
            />
          </div>
        </div>

        <div aria-live="polite" className="min-h-4">
          {error !== null && (
            <p id={errorId} role="alert" className="text-[12.5px] leading-relaxed text-ember">
              {t(ERROR_KEY[error])}
            </p>
          )}
          {error === null && writeFailed && (
            <p role="alert" className="text-[12.5px] leading-relaxed text-ember">
              {t('common.error')}
            </p>
          )}
          {error === null && !writeFailed && saved && (
            <p className="text-[12.5px] leading-relaxed text-honey">{t('growth.saved')}</p>
          )}
        </div>

        <Button type="submit" fullWidth disabled={saving}>
          {saving ? t('common.saving') : t('growth.save')}
        </Button>
      </form>
    </Card>
  )
}
