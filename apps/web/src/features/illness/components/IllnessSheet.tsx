import { useEffect, useRef, useState, type FormEvent } from 'react'
import { t, type TranslationKey } from '../../../core/i18n'
import { Button } from '../../../ui/Button'
import type { IllnessKind } from '../logic/illness'

/** Which form message the page wants shown. */
export type IllnessFormError = 'temp' | 'text' | 'save'

export interface IllnessSheetInput {
  kind: IllnessKind
  /** Untrimmed temperature field; the page parses and validates it. */
  tempText: string
  /** Untrimmed note field; empty string when left blank. */
  text: string
}

export interface IllnessSheetProps {
  busy: boolean
  error: IllnessFormError | null
  onSave: (input: IllnessSheetInput) => void
  onClose: () => void
}

const INPUT_BASE =
  'w-full rounded-2xl border border-moss bg-night/60 px-4 py-3.5 text-[15px] text-cream caret-honey transition [color-scheme:dark] placeholder:text-mist/50 focus:border-honey/70'

const KIND_OPTIONS: ReadonlyArray<{ value: IllnessKind; label: TranslationKey }> = [
  { value: 'temp', label: 'illness.tempLabel' },
  { value: 'symptom', label: 'illness.symptomLabel' },
  { value: 'med', label: 'illness.medLabel' },
]

/**
 * Bottom sheet for a new illness record (T044).
 *
 * The parent picks one of the three record types and fills a single field. The
 * page owns validation and persistence, so an invalid reading keeps the sheet
 * open with the input intact. Copy is neutral by design: this sheet records an
 * observation and never suggests a diagnosis or a dose.
 */
export function IllnessSheet({ busy, error, onSave, onClose }: IllnessSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  const [kind, setKind] = useState<IllnessKind>('temp')
  const [tempText, setTempText] = useState('')
  const [text, setText] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog === null) return
    if (!dialog.open) {
      try {
        dialog.showModal()
      } catch {
        // Partial dialog implementations (and jsdom) still render inline.
        dialog.setAttribute('open', '')
      }
    }
    return () => {
      if (dialog.open) dialog.close()
    }
  }, [])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    onSave({ kind, tempText, text })
  }

  const tempError = error === 'temp'
  const textError = error === 'text'

  return (
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="illness-sheet-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
      className="fixed inset-x-0 top-auto bottom-0 mx-auto w-full max-w-[27rem] rounded-t-[1.75rem] border border-moss bg-canopy p-0 text-cream backdrop:bg-night/75"
    >
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[88dvh] flex-col overflow-y-auto px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-moss" />

        <div className="flex items-start justify-between gap-3">
          <h2
            id="illness-sheet-title"
            className="min-w-0 font-display text-[1.35rem] leading-tight text-cream"
          >
            {t('illness.addTitle')}
          </h2>

          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={t('common.close')}
            className="-mt-1 -mr-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-mist transition hover:text-cream active:scale-95 disabled:opacity-50"
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
          <div>
            {/* Toggle group: three record types, `aria-pressed` reads better
                than a radio group that would need its own focus handling. */}
            <div
              role="group"
              aria-label={t('illness.addTitle')}
              className="grid grid-cols-3 gap-2"
            >
              {KIND_OPTIONS.map((option) => {
                const active = kind === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setKind(option.value)}
                    className={`min-h-11 rounded-2xl border px-2 text-[12.5px] leading-tight transition active:scale-[0.985] ${
                      active
                        ? 'border-honey/70 bg-honey/15 text-cream'
                        : 'border-moss bg-night/50 text-mist hover:border-honey/40 hover:text-cream'
                    }`}
                  >
                    {t(option.label)}
                  </button>
                )
              })}
            </div>
          </div>

          {kind === 'temp' ? (
            <div>
              <label
                htmlFor="illness-temp"
                className="mb-2 block text-[13px] font-medium text-cream/85"
              >
                {t('logs.tempLabel')}
              </label>
              <input
                id="illness-temp"
                name="tempC"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                maxLength={5}
                value={tempText}
                onChange={(event) => setTempText(event.target.value)}
                aria-invalid={tempError}
                aria-describedby={tempError ? 'illness-temp-error' : undefined}
                className={`${INPUT_BASE} font-medium tabular-nums ${tempError ? 'border-ember/60' : ''}`.trim()}
              />
              {tempError && (
                <p id="illness-temp-error" role="alert" className="mt-1.5 text-[12px] text-ember">
                  {t('common.error')}
                </p>
              )}
            </div>
          ) : (
            <div>
              <label
                htmlFor="illness-note"
                className="mb-2 block text-[13px] font-medium text-cream/85"
              >
                {t('illness.noteLabel')}
              </label>
              <textarea
                id="illness-note"
                name="note"
                rows={3}
                maxLength={200}
                value={text}
                onChange={(event) => setText(event.target.value)}
                aria-invalid={textError}
                aria-describedby={textError ? 'illness-note-error' : undefined}
                className={`${INPUT_BASE} resize-none leading-relaxed ${textError ? 'border-ember/60' : ''}`.trim()}
              />
              {textError && (
                <p id="illness-note-error" role="alert" className="mt-1.5 text-[12px] text-ember">
                  {t('common.error')}
                </p>
              )}
            </div>
          )}

          {error === 'save' && (
            <p role="alert" className="text-[12.5px] leading-relaxed text-ember">
              {t('common.error')}
            </p>
          )}
        </div>

        <div className="mt-5 flex shrink-0 gap-2">
          <Button variant="secondary" fullWidth onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" fullWidth disabled={busy}>
            {busy ? t('common.saving') : t('logs.save')}
          </Button>
        </div>
      </form>
    </dialog>
  )
}
