import { t } from '../../../core/i18n'
import { Card } from '../../../ui/Card'
import { UnverifiedBadge } from '../../../ui/UnverifiedBadge'
import type { VelocityAssessment } from '../logic/velocity'

/** One decimal, Vietnamese comma separator; the minus sign stays visible. */
const DELTA = new Intl.NumberFormat('vi-VN', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

function formatDelta(deltaZ: number): string {
  return DELTA.format(deltaZ)
}

export interface VelocityAlertProps {
  assessment: VelocityAssessment
}

/**
 * Growth velocity card (T022).
 *
 * Colour rule (AGENTS rule 3): only a verified drop may use the ember tone.
 * `unverified` renders the same delta in the neutral mist tone, next to the
 * "Đang chờ xác minh" badge — the number informs, it never alarms.
 */
export function VelocityAlert({ assessment }: VelocityAlertProps) {
  const { status, drop } = assessment

  const dropText =
    drop === undefined
      ? null
      : t('growth.velocityDrop', { delta: formatDelta(drop.deltaZ), days: drop.days })

  return (
    <Card role="status" aria-live="polite">
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-display text-base text-cream">{t('growth.velocityTitle')}</h2>
        {status === 'unverified' && <UnverifiedBadge />}
      </div>

      {status === 'insufficient' && (
        <p className="mt-2 text-[13px] text-mist">{t('growth.velocityNeed')}</p>
      )}

      {status === 'unverified' && (
        <>
          <p className="mt-2 text-[13px] text-mist">{t('growth.velocityUnverified')}</p>
          {dropText !== null && <p className="mt-1 text-[13px] text-mist">{dropText}</p>}
        </>
      )}

      {status === 'ok' && <p className="mt-2 text-[13px] text-mist">{t('growth.velocityOk')}</p>}

      {status === 'drop' && (
        <>
          <p className="mt-2 text-[13px] font-medium text-ember">
            {dropText ?? t('growth.velocityOk')}
          </p>
          <p className="mt-1 text-[11px] text-mist">{t('disclaimer')}</p>
        </>
      )}
    </Card>
  )
}
