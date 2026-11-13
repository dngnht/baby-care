import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { LogPayload, LogType } from '../../../core/db/schema'
import { t, type TranslationKey } from '../../../core/i18n'
import { formatTime } from '../../../core/time/day'
import { Button } from '../../../ui/Button'
import type { DiaperKind, FeedSide } from '../../logs/describeLog'
import { logMeta } from '../../logs/logMeta'
import { parseAmountMl, parseTempC, type QuickDefaults } from '../logic/quickLog'

/** `more` is the "Khác" tile: it starts on temperature and lets the parent switch. */
export type SheetMode = LogType | 'more'

export interface QuickLogSheetProps {
  mode: SheetMode
  defaults: QuickDefaults
  /** Instant captured when the tile was held; saved as `startAt`. */
  startAt: Date
  busy?: boolean
  onSave: (type: LogType, payload: LogPayload) => void
  onClose: () => void
}

const MORE_TYPES: readonly LogType[] = ['temp', 'med', 'symptom', 'note']
const SIDES: readonly FeedSide[] = ['left', 'right', 'both']
const DIAPER_KINDS: readonly DiaperKind[] = ['wet', 'dirty', 'both']

const SIDE_KEYS: Readonly<Record<FeedSide, TranslationKey>> = {
  left: 'logs.sideLeft',
  right: 'logs.sideRight',
  both: 'logs.sideBoth',
}

const DIAPER_KEYS: Readonly<Record<DiaperKind, TranslationKey>> = {
  wet: 'logs.diaperWet',
  dirty: 'logs.diaperDirty',
  both: 'logs.diaperBoth',
}

const INPUT_BASE =
  'w-full rounded-2xl border border-moss bg-night/60 px-4 py-3.5 text-[15px] text-cream caret-honey transition [color-scheme:dark] placeholder:text-mist/50 focus:border-honey/70'

/**
 * Bottom sheet for the "hold to adjust" path (max two fields per type).
 *
 * Native `<dialog>` + `showModal()` gives the focus trap, `Esc` and the
 * backdrop for free; the component is mounted only while open, so every open
 * starts from fresh field values.
 */
export function QuickLogSheet({
  mode,
  defaults,
  startAt,
  busy = false,
  onSave,
  onClose,
}: QuickLogSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  const [type, setType] = useState<LogType>(mode === 'more' ? 'temp' : mode)
  const [side, setSide] = useState<FeedSide>(defaults.side ?? 'both')
  const [amount, setAmount] = useState(defaults.amountMl === undefined ? '' : String(defaults.amountMl))
  const [diaperKind, setDiaperKind] = useState<DiaperKind>('wet')
  const [temp, setTemp] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog === null) return
    if (!dialog.open) {
      try {
        dialog.showModal()
      } catch {
        // Very old / partial dialog implementations (and jsdom): show inline.
        dialog.setAttribute('open', '')
      }
    }
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  const tempValue = parseTempC(temp)
  const saveDisabled = busy || (type === 'temp' && tempValue === undefined)

  function payloadFor(current: LogType): LogPayload {
    if (current === 'feed_breast') return { side }
    if (current === 'feed_bottle') {
      const amountMl = parseAmountMl(amount)
      return amountMl === undefined ? {} : { amountMl }
    }
    if (current === 'diaper') return { diaperKind }
    if (current === 'temp') return tempValue === undefined ? {} : { tempC: tempValue }
    if (current === 'med' || current === 'symptom' || current === 'note') {
      const text = note.trim()
      return text === '' ? {} : { note: text }
    }
    return {}
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saveDisabled) return
    onSave(type, payloadFor(type))
  }

  return (
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-log-sheet-title"
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
        className="flex max-h-[85dvh] flex-col overflow-y-auto px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-moss" />

        <div className="flex items-center justify-between gap-3">
          <h2 id="quick-log-sheet-title" className="font-display text-[1.35rem] leading-tight text-cream">
            {t(logMeta(type).labelKey)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="-mr-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-mist transition hover:text-cream active:scale-95"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.7}
              strokeLinecap="round"
              aria-hidden="true"
              className="h-5 w-5"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {mode === 'more' && (
            <fieldset>
              <legend className="mb-2 text-[13px] font-medium text-cream/85">{t('home.more')}</legend>
              <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-moss bg-night/40 p-1.5">
                {MORE_TYPES.map((option) => (
                  <Choice
                    key={option}
                    label={t(logMeta(option).labelKey)}
                    selected={type === option}
                    onSelect={() => setType(option)}
                  />
                ))}
              </div>
            </fieldset>
          )}

          {type === 'feed_breast' && (
            <fieldset>
              <legend className="mb-2 text-[13px] font-medium text-cream/85">{t('logs.sideLabel')}</legend>
              <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-moss bg-night/40 p-1.5">
                {SIDES.map((option) => (
                  <Choice
                    key={option}
                    label={t(SIDE_KEYS[option])}
                    selected={side === option}
                    onSelect={() => setSide(option)}
                  />
                ))}
              </div>
            </fieldset>
          )}

          {type === 'feed_bottle' && (
            <Field id="quick-amount" label={t('logs.amountLabel')}>
              <input
                id="quick-amount"
                name="amountMl"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className={`${INPUT_BASE} font-medium tabular-nums`}
              />
            </Field>
          )}

          {type === 'diaper' && (
            <fieldset>
              <legend className="mb-2 text-[13px] font-medium text-cream/85">{t('logs.diaperLabel')}</legend>
              <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-moss bg-night/40 p-1.5">
                {DIAPER_KINDS.map((option) => (
                  <Choice
                    key={option}
                    label={t(DIAPER_KEYS[option])}
                    selected={diaperKind === option}
                    onSelect={() => setDiaperKind(option)}
                  />
                ))}
              </div>
            </fieldset>
          )}

          {type === 'temp' && (
            <Field id="quick-temp" label={t('logs.tempLabel')}>
              <input
                id="quick-temp"
                name="tempC"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={temp}
                onChange={(event) => setTemp(event.target.value)}
                aria-invalid={temp !== '' && tempValue === undefined}
                className={`${INPUT_BASE} font-medium tabular-nums ${
                  temp !== '' && tempValue === undefined ? 'border-ember/60' : ''
                }`.trim()}
              />
            </Field>
          )}

          {(type === 'med' || type === 'symptom' || type === 'note') && (
            <Field id="quick-note" label={t('logs.noteLabel')}>
              <textarea
                id="quick-note"
                name="note"
                rows={3}
                maxLength={200}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className={`${INPUT_BASE} resize-none leading-relaxed`}
              />
            </Field>
          )}

          {type === 'sleep' || type === 'solid' ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-moss bg-night/40 px-4 py-3.5">
              <span className="text-[13px] text-mist">{t('logs.startLabel')}</span>
              <span className="text-[15px] font-medium tabular-nums text-cream">
                {formatTime(startAt.toISOString())}
              </span>
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex shrink-0 gap-2">
          <Button variant="secondary" fullWidth onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" fullWidth disabled={saveDisabled}>
            {t('logs.save')}
          </Button>
        </div>
      </form>
    </dialog>
  )
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[13px] font-medium text-cream/85">
        {label}
      </label>
      {children}
    </div>
  )
}

function Choice({
  label,
  selected,
  onSelect,
}: {
  label: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`min-h-11 rounded-xl text-[13.5px] font-medium transition active:scale-[0.99] ${
        selected
          ? 'bg-honey text-night shadow-[0_6px_18px_-8px_rgba(240,181,99,0.85)]'
          : 'text-cream/70 hover:text-cream'
      }`.trim()}
    >
      {label}
    </button>
  )
}
