import { useEffect, useRef, useState, type FormEvent } from 'react'
import { t, type TranslationKey } from '../../../core/i18n'
import { Button } from '../../../ui/Button'
import type { DiaperKind, FeedSide } from '../../logs/describeLog'
import type { QuickDefaults } from '../logic/quickLog'
import {
  BACKFILL_TYPES,
  parseBackfill,
  suggestBackfillAt,
  toDateTimeLocal,
  type BackfillError,
  type BackfillResult,
  type BackfillType,
} from '../logic/backfill'

const TYPE_KEYS: Readonly<Record<BackfillType, TranslationKey>> = {
  feed_breast: 'logs.type.feed_breast',
  feed_bottle: 'logs.type.feed_bottle',
  diaper: 'logs.type.diaper',
  sleep: 'logs.type.sleep',
}

const ERROR_KEYS: Readonly<Record<BackfillError, TranslationKey>> = {
  time: 'backfill.errorTime',
  value: 'backfill.errorValue',
}

const SIDES: readonly FeedSide[] = ['left', 'right', 'both']
const SIDE_KEYS: Readonly<Record<FeedSide, TranslationKey>> = {
  left: 'logs.sideLeft',
  right: 'logs.sideRight',
  both: 'logs.sideBoth',
}
const DIAPER_KINDS: readonly DiaperKind[] = ['wet', 'dirty', 'both']
const DIAPER_KEYS: Readonly<Record<DiaperKind, TranslationKey>> = {
  wet: 'logs.diaperWet',
  dirty: 'logs.diaperDirty',
  both: 'logs.diaperBoth',
}

const INPUT =
  'w-full min-h-12 rounded-2xl border border-moss bg-night/60 px-4 py-3 text-[15px] text-cream caret-honey transition [color-scheme:dark] placeholder:text-mist/40 focus:border-honey/70'

export interface BackfillSheetProps {
  defaults: QuickDefaults
  busy?: boolean
  onSave: (result: BackfillResult) => void
  onClose: () => void
}

/**
 * "Ghi bù": log an event from earlier today.
 *
 * Everything is pre-filled so the parent only fixes what is wrong: the time
 * defaults to two hours ago (rounded to 5 minutes) and the amount to the last
 * recorded bottle volume. The sleep end is derived from a duration.
 */
export function BackfillSheet({ defaults, busy = false, onSave, onClose }: BackfillSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [type, setType] = useState<BackfillType>('feed_bottle')
  const [at, setAt] = useState(() => toDateTimeLocal(suggestBackfillAt(new Date())))
  const [amount, setAmount] = useState(defaults.amountMl === undefined ? '' : String(defaults.amountMl))
  const [side, setSide] = useState<FeedSide>(defaults.side ?? 'both')
  const [diaperKind, setDiaperKind] = useState<DiaperKind>('wet')
  const [duration, setDuration] = useState('60')
  const [error, setError] = useState<BackfillError | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog === null) return
    if (!dialog.open) {
      try {
        dialog.showModal()
      } catch {
        // Older browsers without showModal: the sheet still renders inline.
      }
    }
  }, [])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = parseBackfill(
      { type, at, amountMl: amount, side, diaperKind, durationMinutes: duration },
      new Date(),
    )
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    setError(null)
    onSave(parsed.value)
  }

  return (
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="backfill-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className="fixed inset-x-0 top-auto bottom-0 mx-auto w-full max-w-[27rem] rounded-t-[1.75rem] border border-moss bg-canopy p-0 text-cream backdrop:bg-night/75"
    >
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[90dvh] flex-col overflow-y-auto px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-moss" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="backfill-title" className="font-display text-[1.25rem] text-cream">
                {t('backfill.title')}
              </h2>
              <p className="mt-1 text-[11.5px] leading-relaxed text-mist">{t('backfill.hint')}</p>
            </div>
            <Button variant="ghost" onClick={onClose} aria-label={t('common.close')}>
              ✕
            </Button>
          </div>

          <fieldset className="mt-4">
            <legend className="text-[11px] font-medium tracking-[0.14em] text-mist uppercase">
              {t('backfill.typeLabel')}
            </legend>
            <div className="mt-2 grid grid-cols-4 gap-1.5">
              {BACKFILL_TYPES.map((item) => {
                const active = item === type
                return (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setType(item)}
                    className={`min-h-10 rounded-xl border px-1 text-[11.5px] font-medium transition ${
                      active
                        ? 'border-honey/60 bg-honey/15 text-honey'
                        : 'border-moss bg-night/50 text-mist hover:text-cream'
                    }`}
                  >
                    {t(TYPE_KEYS[item])}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <label className="mt-4 block">
            <span className="text-[11px] font-medium tracking-[0.14em] text-mist uppercase">
              {t('backfill.when')}
            </span>
            <input
              type="datetime-local"
              value={at}
              max={toDateTimeLocal(new Date())}
              onChange={(event) => setAt(event.target.value)}
              className={`${INPUT} mt-1.5`}
            />
          </label>

          {type === 'feed_bottle' && (
            <label className="mt-3 block">
              <span className="text-[11px] font-medium tracking-[0.14em] text-mist uppercase">
                {t('logs.amountLabel')}
              </span>
              <input
                inputMode="numeric"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className={`${INPUT} mt-1.5 tabular-nums`}
              />
            </label>
          )}

          {type === 'feed_breast' && (
            <div className="mt-3">
              <p className="text-[11px] font-medium tracking-[0.14em] text-mist uppercase">
                {t('logs.sideLabel')}
              </p>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                {SIDES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={side === item}
                    onClick={() => setSide(item)}
                    className={`min-h-11 rounded-xl border text-[12.5px] font-medium transition ${
                      side === item
                        ? 'border-honey/60 bg-honey/15 text-honey'
                        : 'border-moss bg-night/50 text-mist'
                    }`}
                  >
                    {t(SIDE_KEYS[item])}
                  </button>
                ))}
              </div>
            </div>
          )}

          {type === 'diaper' && (
            <div className="mt-3">
              <p className="text-[11px] font-medium tracking-[0.14em] text-mist uppercase">
                {t('logs.diaperLabel')}
              </p>
              <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                {DIAPER_KINDS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={diaperKind === item}
                    onClick={() => setDiaperKind(item)}
                    className={`min-h-11 rounded-xl border text-[12.5px] font-medium transition ${
                      diaperKind === item
                        ? 'border-honey/60 bg-honey/15 text-honey'
                        : 'border-moss bg-night/50 text-mist'
                    }`}
                  >
                    {t(DIAPER_KEYS[item])}
                  </button>
                ))}
              </div>
            </div>
          )}

          {type === 'sleep' && (
            <label className="mt-3 block">
              <span className="text-[11px] font-medium tracking-[0.14em] text-mist uppercase">
                {t('backfill.duration')}
              </span>
              <input
                inputMode="numeric"
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                className={`${INPUT} mt-1.5 tabular-nums`}
              />
            </label>
          )}

          {error !== null && (
            <p role="alert" className="mt-3 text-[12px] text-ember">
              {t(ERROR_KEYS[error])}
            </p>
          )}

          <Button type="submit" size="lg" fullWidth className="mt-4" disabled={busy}>
            {t('backfill.save')}
          </Button>
      </form>
    </dialog>
  )
}
