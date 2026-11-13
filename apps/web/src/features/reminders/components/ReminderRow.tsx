import { t } from '../../../core/i18n'
import { Button } from '../../../ui/Button'
import { Card } from '../../../ui/Card'

export interface ReminderRowProps {
  title: string
  /** Already formatted with `formatWhen`, e.g. "05/03/2026 07:05". */
  when: string
  /** Already translated repeat chip label. */
  repeatLabel: string
  note?: string
  /** Marked done: strikes the title through and hides "đánh dấu xong". */
  done: boolean
  /** The row's own write is in flight. */
  busy: boolean
  /** Inline delete confirmation is open for this row. */
  confirming: boolean
  /** Past due: uses the warm ember dot instead of honey. */
  overdue?: boolean
  onMarkDone: () => void
  onDeleteRequest: () => void
  onDeleteCancel: () => void
  onDeleteConfirm: () => void
}

const TITLE_DONE = 'text-mist line-through decoration-mist/50'
const TITLE_OPEN = 'text-cream'

/**
 * One reminder line: title, when, repeat chip and the two actions.
 *
 * Deleting is confirmed inline in the same card (instead of `window.confirm`)
 * so the list never jumps and the choice stays next to the item at hand.
 */
export function ReminderRow({
  title,
  when,
  repeatLabel,
  note,
  done,
  busy,
  confirming,
  overdue = false,
  onMarkDone,
  onDeleteRequest,
  onDeleteCancel,
  onDeleteConfirm,
}: ReminderRowProps) {
  const dotTone = done ? 'bg-moss' : overdue ? 'bg-ember' : 'bg-honey'

  return (
    <Card className={done ? 'opacity-80' : ''}>
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotTone}`} />

        <div className="min-w-0 flex-1">
          <p
            className={`text-[14.5px] leading-snug font-medium break-words ${
              done ? TITLE_DONE : TITLE_OPEN
            }`}
          >
            {title}
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="text-[12px] tabular-nums text-mist">{when}</span>
            <span className="rounded-full border border-moss bg-night/60 px-2 py-0.5 text-[10.5px] leading-none text-mist">
              {repeatLabel}
            </span>
          </div>

          {note !== undefined && note !== '' && (
            <p className="mt-1.5 text-[12px] leading-relaxed break-words text-mist/90">{note}</p>
          )}
        </div>
      </div>

      {confirming ? (
        <div className="mt-3 rounded-2xl border border-ember/40 bg-ember/10 px-3.5 py-3">
          <p className="text-[12.5px] leading-relaxed text-cream">{t('reminders.deleteConfirm')}</p>
          <div className="mt-2.5 flex gap-2">
            <Button variant="secondary" fullWidth disabled={busy} onClick={onDeleteCancel}>
              {t('common.no')}
            </Button>
            <Button variant="danger" fullWidth disabled={busy} onClick={onDeleteConfirm}>
              {busy ? t('common.saving') : t('common.delete')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          {!done && (
            <Button variant="secondary" className="flex-1" disabled={busy} onClick={onMarkDone}>
              {busy ? t('common.saving') : t('reminders.markDone')}
            </Button>
          )}
          <Button
            variant="ghost"
            className={done ? 'flex-1 justify-end' : ''}
            disabled={busy}
            onClick={onDeleteRequest}
          >
            {t('common.delete')}
          </Button>
        </div>
      )}
    </Card>
  )
}
