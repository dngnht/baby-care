import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { ReminderRepeat } from '../../../core/db/schema'
import { t, type TranslationKey } from '../../../core/i18n'
import { Button } from '../../../ui/Button'
import { parseDateTimeLocal, toDateTimeLocalValue } from '../logic/reminders'

/** Which form message the page wants shown. */
export type ReminderFormError = 'title' | 'when' | 'save'

export interface ReminderSheetInput {
  /** Untrimmed title; the page trims and validates it. */
  title: string
  /** `null` when the time field is empty or not a real calendar instant. */
  at: Date | null
  repeat: ReminderRepeat
  /** Untrimmed note; empty string when left blank. */
  note: string
}

export interface ReminderSheetProps {
  busy: boolean
  error: ReminderFormError | null
  onSave: (input: ReminderSheetInput) => void
  onClose: () => void
}

const INPUT_BASE =
  'w-full rounded-2xl border border-moss bg-night/60 px-4 py-3.5 text-[15px] text-cream caret-honey transition [color-scheme:dark] placeholder:text-mist/50 focus:border-honey/70'

const REPEAT_OPTIONS: ReadonlyArray<{ value: ReminderRepeat; label: TranslationKey }> = [
  { value: 'none', label: 'reminders.repeat.none' },
  { value: 'daily', label: 'reminders.repeat.daily' },
  { value: 'weekly', label: 'reminders.repeat.weekly' },
]

const ERROR_LABEL: Readonly<Record<ReminderFormError, TranslationKey>> = {
  title: 'reminders.errorTitle',
  when: 'reminders.errorWhen',
  save: 'common.error',
}

/** One hour ahead, on the hour: a sensible default that is never in the past. */
function defaultWhenValue(now: Date): string {
  const next = new Date(now)
  next.setHours(next.getHours() + 1, 0, 0, 0)
  return toDateTimeLocalValue(next)
}

/**
 * Bottom sheet for a new reminder: title, local date-time, repeat and note.
 *
 * Native `<dialog>` + `showModal()` provides the focus trap, `Esc` and the
 * backdrop. The page owns persistence and validation, so an error keeps the
 * sheet open with the parent's input intact.
 */
export function ReminderSheet({ busy, error, onSave, onClose }: ReminderSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  const [title, setTitle] = useState('')
  const [when, setWhen] = useState(() => defaultWhenValue(new Date()))
  const [repeat, setRepeat] = useState<ReminderRepeat>('none')
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    onSave({ title, at: parseDateTimeLocal(when), repeat, note })
  }

  return (
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reminder-sheet-title"
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
          <h2 id="reminder-sheet-title" className="min-w-0 font-display text-[1.35rem] leading-tight text-cream">
            {t('reminders.add')}
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
            <label
              htmlFor="reminder-title"
              className="mb-2 block text-[13px] font-medium text-cream/85"
            >
              {t('reminders.titleLabel')}
            </label>
            <input
              id="reminder-title"
              name="title"
              type="text"
              autoComplete="off"
              maxLength={80}
              required
              value={title}
              placeholder={t('reminders.titlePlaceholder')}
              onChange={(event) => setTitle(event.target.value)}
              className={INPUT_BASE}
            />
          </div>

          <div>
            <label
              htmlFor="reminder-when"
              className="mb-2 block text-[13px] font-medium text-cream/85"
            >
              {t('reminders.whenLabel')}
            </label>
            <input
              id="reminder-when"
              name="when"
              type="datetime-local"
              step={60}
              required
              value={when}
              onChange={(event) => setWhen(event.target.value)}
              className={`${INPUT_BASE} font-medium tabular-nums`}
            />
          </div>

          <div>
            <span id="reminder-repeat-label" className="mb-2 block text-[13px] font-medium text-cream/85">
              {t('reminders.repeatLabel')}
            </span>
            {/* Toggle group: three options, so `aria-pressed` beats a native
                radio group that would need its own focus management. */}
            <div role="group" aria-labelledby="reminder-repeat-label" className="grid grid-cols-3 gap-2">
              {REPEAT_OPTIONS.map((option) => {
                const active = repeat === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setRepeat(option.value)}
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

          <div>
            <label
              htmlFor="reminder-note"
              className="mb-2 block text-[13px] font-medium text-cream/85"
            >
              {t('logs.noteLabel')}
            </label>
            <textarea
              id="reminder-note"
              name="note"
              rows={2}
              maxLength={200}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className={`${INPUT_BASE} resize-none leading-relaxed`}
            />
          </div>

          {error !== null && (
            <p role="alert" className="text-[12.5px] leading-relaxed text-ember">
              {t(ERROR_LABEL[error])}
            </p>
          )}
        </div>

        <div className="mt-5 flex shrink-0 gap-2">
          <Button variant="secondary" fullWidth onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" fullWidth disabled={busy}>
            {busy ? t('common.saving') : t('reminders.save')}
          </Button>
        </div>
      </form>
    </dialog>
  )
}
