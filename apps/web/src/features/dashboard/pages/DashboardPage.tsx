import { useEffect, useState } from 'react'
import { useActiveBaby } from '../../../core/baby/activeBaby'
import { getRepo } from '../../../core/db/repo'
import type { LogEntry } from '../../../core/db/schema'
import { t, type TranslationKey } from '../../../core/i18n'
import { addDays, formatDuration, startOfDay } from '../../../core/time/day'
import { Button } from '../../../ui/Button'
import { Card } from '../../../ui/Card'
import { Screen } from '../../../ui/Screen'
import { describeAge } from '../../profile/logic/age'
import { DailyComparison } from '../components/DailyComparison'
import { buildDailyTotals, hasAnyData } from '../logic/dailyTotals'
import { compareToReference, computeMetrics, type Comparison } from '../logic/metrics'
import { formatRange, groupForAgeDays, type ValueRange } from '../logic/reference'
import { FEEDING_SLEEP_REFERENCE } from '../logic/referenceData'

type LoadState = 'loading' | 'ready' | 'error'

/**
 * How a comparison is styled. Only reachable when the knowledge table is
 * `verified: true`; an unreviewed table never gets a coloured verdict.
 */
const STATUS_META: Readonly<Record<Comparison, { labelKey: TranslationKey; className: string }>> = {
  within: { labelKey: 'dashboard.atRange', className: 'border-honey/30 bg-honey/10 text-honey' },
  below: { labelKey: 'dashboard.below', className: 'border-ember/30 bg-ember/10 text-ember' },
  above: { labelKey: 'dashboard.above', className: 'border-ember/30 bg-ember/10 text-ember' },
}

interface MetricCardProps {
  label: string
  /** Formatted value shown large, e.g. "8 lần" or "14h30". */
  value: string
  /** The same number, used for the (verified-only) comparison. */
  measured: number
  reference?: ValueRange
  /** Symbol appended to the reference, e.g. "h". */
  unit?: string
  /** Reviewed table? When false the card stays neutral (`text-mist`). */
  verified: boolean
  className?: string
}

/**
 * One 24-hour metric: label, value, reference interval and — only for a
 * reviewed table — a below/within/above badge.
 */
function MetricCard({
  label,
  value,
  measured,
  reference,
  unit = '',
  verified,
  className = '',
}: MetricCardProps) {
  const comparison = reference === undefined ? null : compareToReference(measured, reference)
  const status = verified && comparison !== null ? STATUS_META[comparison] : null

  return (
    <Card className={className}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[11px] font-medium tracking-[0.14em] text-mist uppercase">{label}</h2>

        {/* No chip at all while the table is unverified: the header badge and
            the note below already say why nothing is coloured. */}
        {status !== null && (
          <span
            className={`shrink-0 rounded-full border px-2.5 py-1 text-[10.5px] font-medium ${status.className}`.trim()}
          >
            {t(status.labelKey)}
          </span>
        )}
      </div>

      <p className="mt-2 font-display text-[1.75rem] leading-none text-cream tabular-nums">{value}</p>

      <p className="mt-2 text-[11.5px] leading-relaxed text-mist">
        {reference === undefined
          ? t('dashboard.noReference')
          : t('dashboard.reference', { range: formatRange(reference, unit) })}
      </p>
    </Card>
  )
}

/**
 * T014 — the last 24 hours compared with `knowledge/care/feeding_sleep_reference.md`.
 *
 * The reference table is currently `verified: false`, so every card shows the
 * raw numbers plus an "Đang chờ xác minh" badge and keeps a neutral tone: no
 * red/green verdict until a clinician has reviewed the table.
 */
export function DashboardPage() {
  const baby = useActiveBaby((state) => state.baby)

  const [entries, setEntries] = useState<LogEntry[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (baby === null) return
    let cancelled = false
    setLoadState('loading')

    // Seven local days: the 24-hour cards filter inside `computeMetrics`,
    // while the comparison card needs the full week.
    const now = new Date()
    const from = startOfDay(addDays(now, -6))
    getRepo()
      .listLogs(baby.id, from, now)
      .then((list) => {
        if (cancelled) return
        setEntries(list)
        setLoadState('ready')
      })
      .catch(() => {
        if (!cancelled) setLoadState('error')
      })

    return () => {
      cancelled = true
    }
  }, [baby, reloadToken])

  if (baby === null) {
    return (
      <Screen>
        <p className="mt-24 text-center text-sm text-mist">{t('common.loading')}</p>
      </Screen>
    )
  }

  const table = FEEDING_SLEEP_REFERENCE
  const age = describeAge(baby)
  const group = groupForAgeDays(table, age.correctedDays)
  const now = new Date()
  const metrics = computeMetrics(entries, now)
  const sleepHours = metrics.sleepMinutes / 60
  const dayTotals = buildDailyTotals(entries, 7, now)

  return (
    <Screen>
      <header className="rise rise-1">
        <p className="text-[10.5px] font-medium tracking-[0.16em] text-honey/80 uppercase">
          {t('app.name')}
        </p>
        <h1 className="mt-2 font-display text-[2rem] leading-[1.05] tracking-[-0.02em] text-cream text-balance">
          {t('dashboard.title')}
        </h1>
        <p className="mt-2 text-[13px] text-mist">{t('dashboard.window')}</p>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-[12.5px] text-mist">
            {group === undefined
              ? t('dashboard.noReference')
              : t('dashboard.ageGroup', { group: group.label })}
          </p>
          {!table.verified && (
            <span className="rounded-full border border-moss bg-canopy/70 px-2.5 py-1 text-[10.5px] font-medium text-mist">
              {t('common.unverified')}
            </span>
          )}
        </div>
      </header>

      {loadState === 'loading' ? (
        <p className="mt-16 text-center text-sm text-mist">{t('common.loading')}</p>
      ) : loadState === 'error' ? (
        <div role="alert" className="mt-16 text-center">
          <p className="text-sm text-ember">{t('common.error')}</p>
          <Button
            variant="secondary"
            className="mt-3"
            onClick={() => setReloadToken((token) => token + 1)}
          >
            {t('common.retry')}
          </Button>
        </div>
      ) : !hasAnyData(dayTotals) ? (
        <Card className="rise rise-2 mt-6 text-center">
          <p className="font-display text-[1.1rem] leading-snug text-cream">{t('dashboard.empty')}</p>
        </Card>
      ) : (
        <div className="mt-5 space-y-3">
          <MetricCard
            className="rise rise-2"
            label={t('dashboard.feeds')}
            value={t('dashboard.times', { count: metrics.feedCount })}
            measured={metrics.feedCount}
            reference={group?.feeds}
            verified={table.verified}
          />
          <MetricCard
            className="rise rise-3"
            label={t('dashboard.sleep')}
            value={formatDuration(metrics.sleepMinutes)}
            measured={sleepHours}
            reference={group?.sleepHours}
            unit="h"
            verified={table.verified}
          />
          <MetricCard
            className="rise rise-4"
            label={t('dashboard.diapers')}
            value={t('dashboard.times', { count: metrics.wetDiapers })}
            measured={metrics.wetDiapers}
            reference={group?.wetDiapers}
            verified={table.verified}
          />

          <div className="rise rise-5">
            <DailyComparison rows={dayTotals} />
          </div>
        </div>
      )}

      {loadState === 'ready' && !table.verified && (
        <p className="rise rise-5 mt-4 text-[11.5px] leading-relaxed text-mist/70">
          {t('dashboard.pendingNote')}
        </p>
      )}
    </Screen>
  )
}
