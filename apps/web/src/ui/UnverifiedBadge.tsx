import { t } from '../core/i18n'

export interface UnverifiedBadgeProps {
  className?: string
}

/**
 * Shown next to any value derived from data whose `verified` flag is still
 * false (AGENTS rule 3): the number may be displayed, but it must never drive a
 * red/alarming warning until a clinician has reviewed the source.
 */
export function UnverifiedBadge({ className = '' }: UnverifiedBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-honey/40 bg-honey/10 px-2.5 py-1 text-[11px] leading-none font-medium text-honey/90 ${className}`.trim()}
    >
      {t('common.unverified')}
    </span>
  )
}
