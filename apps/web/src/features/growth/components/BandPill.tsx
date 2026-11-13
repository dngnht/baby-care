import { t } from '../../../core/i18n'
import type { Band } from '../../../core/standards/zscore'
import { bandPresentation, formatZ, type BandTone } from '../logic/measurementForm'

export interface BandPillProps {
  band: Band
  z: number
  /** False while the WHO table still awaits the medical review (T005). */
  verified: boolean
  className?: string
}

/**
 * Tone classes per band. Unverified bands never reach `severe`, because
 * `bandPresentation` collapses their tone to `neutral` (AGENTS rule 3): the
 * number stays readable, the pill never turns red.
 */
const TONE_CLASS: Readonly<Record<BandTone, string>> = {
  neutral: 'border-moss text-mist',
  low: 'border-honey/40 text-honey',
  high: 'border-honey/40 text-honey',
  severe: 'border-ember/50 text-ember',
}

/** Band label + z-score for one indicator, coloured by the approved tone. */
export function BandPill({ band, z, verified, className = '' }: BandPillProps) {
  const { labelKey, tone } = bandPresentation(band, verified)

  return (
    <span
      className={`inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border bg-night/40 px-2.5 py-1 text-[11px] leading-none ${TONE_CLASS[tone]} ${className}`.trim()}
    >
      <span className="min-w-0 truncate font-medium">{t(labelKey)}</span>
      <span className="shrink-0 tabular-nums opacity-80">
        {t('growth.zscore')} {formatZ(z)}
      </span>
    </span>
  )
}
