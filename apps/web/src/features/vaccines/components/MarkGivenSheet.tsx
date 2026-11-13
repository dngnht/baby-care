import { useEffect, useRef, useState, type FormEvent } from 'react'
import { t } from '../../../core/i18n'
import { fromDayKey, toDayKey } from '../../../core/time/day'
import { Button } from '../../../ui/Button'

export interface MarkGivenInput {
  givenDate: Date
  /** Trimmed lot number; empty string when the parent left it blank. */
  lot: string
  /** Trimmed place; empty string when the parent left it blank. */
  place: string
}

export interface MarkGivenSheetProps {
  name: string
  doseNo: number
  /** ISO 8601 UTC of an existing record, when re-editing a given dose. */
  givenDate?: string
  lot?: string
  place?: string
  busy?: boolean
  error?: boolean
  onSave: (input: MarkGivenInput) => void
  onClose: () => void
}

const INPUT_BASE =
  'w-full rounded-2xl border border-moss bg-night/60 px-4 py-3.5 text-[15px] text-cream caret-honey transition [color-scheme:dark] placeholder:text-mist/50 focus:border-honey/70'

/**
 * Bottom sheet for "Đánh dấu đã tiêm": date, lot number and place.
 *
 * Native `<dialog>` + `showModal()` gives the focus trap, `Esc` and the
 * backdrop for free. The component is mounted only while open, so every open
 * starts from the current record (or today's date).
 */
export function MarkGivenSheet({
  name,
  doseNo,
  givenDate,
  lot: initialLot = '',
  place: initialPlace = '',
  busy = false,
  error = false,
  onSave,
  onClose,
}: MarkGivenSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  const [dateKey, setDateKey] = useState(() =>
    givenDate === undefined ? toDayKey(new Date()) : toDayKey(new Date(givenDate)),
  )
  const [lot, setLot] = useState(initialLot)
  const [place, setPlace] = useState(initialPlace)

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

  const canSave = !busy && dateKey !== ''

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSave) return
    onSave({ givenDate: fromDayKey(dateKey), lot: lot.trim(), place: place.trim() })
  }

  return (
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="mark-given-title"
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

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="mark-given-title"
              className="font-display text-[1.35rem] leading-tight text-cream"
            >
              {t('vaccines.markTitle')}
            </h2>
            <p className="mt-1.5 flex min-w-0 items-center gap-2 text-[13px] leading-snug text-mist">
              <span className="min-w-0 break-words">{name}</span>
              <span className="shrink-0 rounded-full border border-moss bg-night/70 px-2 py-0.5 text-[11px] leading-none font-medium tabular-nums">
                {`#${doseNo}`}
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="-mt-1 -mr-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-mist transition hover:text-cream active:scale-95"
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
              htmlFor="vaccine-given-date"
              className="mb-2 block text-[13px] font-medium text-cream/85"
            >
              {t('vaccines.givenDateLabel')}
            </label>
            <input
              id="vaccine-given-date"
              name="givenDate"
              type="date"
              required
              value={dateKey}
              onChange={(event) => setDateKey(event.target.value)}
              className={`${INPUT_BASE} font-medium tabular-nums`}
            />
          </div>

          <div>
            <label
              htmlFor="vaccine-lot"
              className="mb-2 block text-[13px] font-medium text-cream/85"
            >
              {t('vaccines.lotLabel')}
            </label>
            <input
              id="vaccine-lot"
              name="lot"
              type="text"
              autoComplete="off"
              maxLength={40}
              value={lot}
              onChange={(event) => setLot(event.target.value)}
              className={INPUT_BASE}
            />
          </div>

          <div>
            <label
              htmlFor="vaccine-place"
              className="mb-2 block text-[13px] font-medium text-cream/85"
            >
              {t('vaccines.placeLabel')}
            </label>
            <input
              id="vaccine-place"
              name="place"
              type="text"
              autoComplete="off"
              maxLength={80}
              value={place}
              onChange={(event) => setPlace(event.target.value)}
              className={INPUT_BASE}
            />
          </div>

          {error && (
            <p role="alert" className="text-[12.5px] leading-relaxed text-ember">
              {t('common.error')}
            </p>
          )}
        </div>

        <div className="mt-5 flex shrink-0 gap-2">
          <Button variant="secondary" fullWidth onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" fullWidth disabled={!canSave}>
            {busy ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>
    </dialog>
  )
}
