import { t } from '../../../core/i18n'
import { Card } from '../../../ui/Card'
import type { BabyAge } from '../logic/age'

export interface AgePreviewProps {
  age: BabyAge
  /** Gestational weeks used for the correction (shown in the note). */
  weeks: number
}

/**
 * Live age read-out shown once a birth date and gestational age are entered,
 * so parents see the corrected age before they submit the profile.
 */
export function AgePreview({ age, weeks }: AgePreviewProps) {
  return (
    <Card
      aria-live="polite"
      className="border-honey/25 bg-honey/[0.06] px-4 py-3.5"
    >
      <p className="text-[15px] font-medium text-cream">
        {t('profile.age', { days: age.days })}
      </p>

      {age.isPremature && (
        <>
          <p className="mt-1 text-[13px] font-medium text-honey tabular-nums">
            {t('profile.ageCorrected', { days: age.correctedDays })}
          </p>
          <p className="mt-2 text-[11.5px] leading-relaxed text-mist">
            {t('profile.prematureNote', { weeks })}
          </p>
        </>
      )}
    </Card>
  )
}
