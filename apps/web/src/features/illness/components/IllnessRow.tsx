import type { LogEntry } from '../../../core/db/schema'
import { t } from '../../../core/i18n'
import { formatTime } from '../../../core/time/day'
import { Button } from '../../../ui/Button'
import { describeLog } from '../../logs/describeLog'
import { logMeta } from '../../logs/logMeta'

export interface IllnessRowProps {
  entry: LogEntry
  /** A delete round-trip is in flight for this row. */
  busy: boolean
  /** The inline confirmation step is showing. */
  confirming: boolean
  onDeleteRequest: () => void
  onDeleteCancel: () => void
  onDeleteConfirm: () => void
}

/**
 * One illness record: time, type and the same neutral detail the timeline
 * shows. Deleting uses an inline confirmation instead of `window.confirm`, so
 * the sheet-less page stays fully styleable and keyboard friendly.
 */
export function IllnessRow({
  entry,
  busy,
  confirming,
  onDeleteRequest,
  onDeleteCancel,
  onDeleteConfirm,
}: IllnessRowProps) {
  const meta = logMeta(entry.type)
  const detail = describeLog(entry)

  return (
    <div
      className={`rounded-2xl border px-3 py-2.5 ${
        confirming ? 'border-ember/40 bg-ember/5' : 'border-moss/60 bg-canopy/50'
      }`}
    >
      {confirming ? (
        <>
          <p className="text-[13px] leading-snug text-cream">{t('logs.deleteConfirm')}</p>
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" fullWidth disabled={busy} onClick={onDeleteCancel}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" fullWidth disabled={busy} onClick={onDeleteConfirm}>
              {busy ? t('common.saving') : t('logs.delete')}
            </Button>
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className={`h-2 w-2 shrink-0 rounded-full bg-current ${meta.accent}`}
          />
          <span className="w-11 shrink-0 text-[12px] tabular-nums text-mist">
            {formatTime(entry.startAt)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-cream">{t(meta.labelKey)}</p>
            {detail === '' ? null : (
              <p className="truncate text-[12px] text-mist">{detail}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onDeleteRequest}
            aria-label={t('common.delete')}
            className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-mist transition hover:text-ember active:scale-95"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.7}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="h-5 w-5"
            >
              <path d="M4 7h16M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7m2 0-.6 11.1a1.5 1.5 0 0 1-1.5 1.4H9.1a1.5 1.5 0 0 1-1.5-1.4L7 7" />
              <path d="M10 11v5M14 11v5" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
