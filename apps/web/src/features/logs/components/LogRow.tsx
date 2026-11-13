import type { LogEntry } from '../../../core/db/schema'
import { formatTime } from '../../../core/time/day'
import { t } from '../../../core/i18n'
import { logMeta } from '../logMeta'
import { describeLog } from '../describeLog'

export interface LogRowProps {
  entry: LogEntry
  now?: Date
  onSelect?: (entry: LogEntry) => void
}

/** Compact one-line log row shared by the home recap and the day timeline. */
export function LogRow({ entry, now, onSelect }: LogRowProps) {
  const meta = logMeta(entry.type)
  const detail = describeLog(entry, now)

  const content = (
    <>
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full bg-current ${meta.accent}`} />
      <span className="w-11 shrink-0 text-[12px] tabular-nums text-mist">{formatTime(entry.startAt)}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-cream">{t(meta.labelKey)}</span>
      {detail === '' ? null : (
        <span className="max-w-[52%] shrink-0 truncate text-[12px] text-mist">{detail}</span>
      )}
    </>
  )

  const className =
    'flex w-full items-center gap-2.5 rounded-2xl border border-moss/60 bg-canopy/50 px-3 py-2.5 text-left'

  if (onSelect === undefined) {
    return <div className={className}>{content}</div>
  }

  return (
    <button type="button" onClick={() => onSelect(entry)} className={`${className} transition active:scale-[0.99]`}>
      {content}
    </button>
  )
}
