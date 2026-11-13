import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { LogEntry, LogPatch } from '../../../core/db/schema'
import { t } from '../../../core/i18n'
import { formatTime } from '../../../core/time/day'
import { Button } from '../../../ui/Button'
import { readString } from '../../logs/describeLog'
import { logMeta } from '../../logs/logMeta'
import { applyTimeChange, withTimeOfDay } from '../logic/dayWindow'

export interface EditLogSheetProps {
  entry: LogEntry
  /** A save/delete round-trip is in flight. */
  busy?: boolean
  /** The last write failed; the sheet stays open so nothing is lost. */
  error?: boolean
  onSave: (patch: LogPatch) => void
  onDelete: () => void
  onClose: () => void
}

const INPUT_BASE =
  'w-full rounded-2xl border border-moss bg-night/60 px-4 py-3.5 text-[15px] text-cream caret-honey transition [color-scheme:dark] placeholder:text-mist/50 focus:border-honey/70'

/**
 * Edit / delete sheet for one log (T013).
 *
 * Editable fields are deliberately small: start time, note, and — for a
 * finished sleep — end time. Everything else in the payload is preserved
 * verbatim, so editing a note never drops the bottle amount.
 *
 * Native `<dialog>` + `showModal()` supplies the focus trap, `Esc` and the
 * backdrop. Deleting uses an inline confirmation step instead of
 * `window.confirm`, which blocks the sheet and cannot be styled.
 */
export function EditLogSheet({
  entry,
  busy = false,
  error = false,
  onSave,
  onDelete,
  onClose,
}: EditLogSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  const [startTime, setStartTime] = useState(() => formatTime(entry.startAt))
  const [endTime, setEndTime] = useState(() => (entry.endAt === undefined ? '' : formatTime(entry.endAt)))
  const [note, setNote] = useState(() => readString(entry.payload, 'note') ?? '')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

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

  const endIso = entry.endAt
  const endEditable = entry.type === 'sleep' && endIso !== undefined

  // Validate on every keystroke so the save button reflects reality.
  const startInvalid = applyTimeChange(entry, startTime).startAt === undefined
  const endInvalid = endEditable && endIso !== undefined && endTime !== '' && withTimeOfDay(endIso, endTime) === undefined
  const saveDisabled = busy || startInvalid || endInvalid

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // While the delete confirmation is showing, Enter in a field must not
    // silently save instead of the action the parent is asking about.
    if (saveDisabled || confirmingDelete) return

    const timePatch = applyTimeChange(entry, startTime)
    const startAt = timePatch.startAt
    if (startAt === undefined) return

    let endAt = timePatch.endAt
    if (endIso !== undefined) {
      const candidate = withTimeOfDay(endIso, endTime)
      if (candidate !== undefined) {
        // Never persist an end before its start: it would render a negative
        // duration in the timeline row.
        endAt = candidate.getTime() >= startAt.getTime() ? candidate : startAt
      }
    }

    const payload = { ...entry.payload }
    const trimmedNote = note.trim()
    if (trimmedNote === '') delete payload.note
    else payload.note = trimmedNote

    const patch: LogPatch = { startAt, payload }
    if (endAt !== undefined) patch.endAt = endAt
    onSave(patch)
  }

  return (
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-log-sheet-title"
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
            <p className="text-[10.5px] font-medium tracking-[0.14em] text-mist/80 uppercase">
              {t('logs.editTitle')}
            </p>
            <h2
              id="edit-log-sheet-title"
              className="mt-1 font-display text-[1.35rem] leading-tight text-cream"
            >
              {t(logMeta(entry.type).labelKey)}
            </h2>
          </div>
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

        <div className={`mt-4 grid gap-4 ${endEditable ? 'grid-cols-2' : ''}`.trim()}>
          <Field id="edit-start" label={t('logs.startLabel')}>
            <input
              id="edit-start"
              name="startAt"
              type="time"
              required
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              aria-invalid={startInvalid}
              className={`${INPUT_BASE} font-medium tabular-nums ${startInvalid ? 'border-ember/60' : ''}`.trim()}
            />
          </Field>

          {endEditable && (
            <Field id="edit-end" label={t('logs.endLabel')}>
              <input
                id="edit-end"
                name="endAt"
                type="time"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                aria-invalid={endInvalid}
                className={`${INPUT_BASE} font-medium tabular-nums ${endInvalid ? 'border-ember/60' : ''}`.trim()}
              />
            </Field>
          )}
        </div>

        <div className="mt-4">
          <Field id="edit-note" label={t('logs.noteLabel')}>
            <textarea
              id="edit-note"
              name="note"
              rows={3}
              maxLength={200}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className={`${INPUT_BASE} resize-none leading-relaxed`}
            />
          </Field>
        </div>

        {error && (
          <p role="alert" className="mt-3 text-[12.5px] text-ember">
            {t('common.error')}
          </p>
        )}

        <div className="mt-5 shrink-0">
          {confirmingDelete ? (
            <div className="rounded-2xl border border-ember/40 bg-ember/5 p-3">
              <p className="text-[13.5px] leading-snug text-cream">{t('logs.deleteConfirm')}</p>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="secondary"
                  fullWidth
                  disabled={busy}
                  onClick={() => setConfirmingDelete(false)}
                >
                  {t('common.cancel')}
                </Button>
                <Button variant="danger" fullWidth disabled={busy} onClick={onDelete}>
                  {t('logs.delete')}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Button type="submit" size="lg" fullWidth disabled={saveDisabled}>
                {busy ? t('common.saving') : t('common.save')}
              </Button>
              <div className="mt-2 flex gap-2">
                <Button variant="secondary" fullWidth disabled={busy} onClick={onClose}>
                  {t('common.cancel')}
                </Button>
                <Button variant="danger" fullWidth disabled={busy} onClick={() => setConfirmingDelete(true)}>
                  {t('logs.delete')}
                </Button>
              </div>
            </>
          )}
        </div>
      </form>
    </dialog>
  )
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-2 block text-[13px] font-medium text-cream/85">
        {label}
      </label>
      {children}
    </div>
  )
}
