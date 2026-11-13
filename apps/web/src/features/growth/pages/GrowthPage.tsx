import { useCallback, useEffect, useMemo, useState } from 'react'
import { useActiveBaby } from '../../../core/baby/activeBaby'
import { getRepo } from '../../../core/db/repo'
import type { Measurement } from '../../../core/db/schema'
import { t, type TranslationKey } from '../../../core/i18n'
import { zForMeasurement, type GrowthIndicator, type ZScoreResult } from '../../../core/standards/growth'
import { isIndicatorVerified } from '../../../core/standards/lms'
import { Button } from '../../../ui/Button'
import { Card } from '../../../ui/Card'
import { Screen } from '../../../ui/Screen'
import { UnverifiedBadge } from '../../../ui/UnverifiedBadge'
import { BandPill } from '../components/BandPill'
import { GrowthChart } from '../components/GrowthChart'
import { MeasurementForm } from '../components/MeasurementForm'
import { VelocityAlert } from '../components/VelocityAlert'
import { assessVelocity } from '../logic/velocity'

type LoadState = 'loading' | 'ready' | 'error'

/** History is a glance, not an archive: the 20 most recent measurements. */
const HISTORY_LIMIT = 20

const INDICATORS: readonly GrowthIndicator[] = ['wfa', 'lhfa', 'hcfa']

const INDICATOR_LABEL: Readonly<Record<GrowthIndicator, TranslationKey>> = {
  wfa: 'growth.indicator.wfa',
  lhfa: 'growth.indicator.lhfa',
  hcfa: 'growth.indicator.hcfa',
}

/** Short indicator names used as captions above each band pill. */
const INDICATOR_SHORT: Readonly<Record<GrowthIndicator, TranslationKey>> = {
  wfa: 'growth.short.wfa',
  lhfa: 'growth.short.lhfa',
  hcfa: 'growth.short.hcfa',
}

const INT = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 })
const ONE_DECIMAL = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 })

/** "dd/MM/yyyy" in the device timezone; digits only, no locale dependency. */
function formatDay(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '\u2014'
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${date.getFullYear()}`
}

interface ValueCellProps {
  label: string
  value: string
}

/** One measurement inside the "last measurement" card. */
function ValueCell({ label, value }: ValueCellProps) {
  return (
    <div className="min-w-0 flex-1 basis-20">
      <dt className="truncate text-[11px] leading-none text-mist">{label}</dt>
      <dd className="mt-1.5 font-display text-[1.1rem] leading-none tabular-nums text-cream">
        {value}
      </dd>
    </div>
  )
}

/**
 * T020 — growth entry: measurement form, band pills, WHO chart (T021), growth
 * velocity (T022) and the recent history.
 *
 * Every score comes from `zForMeasurement` (WHO LMS tables in `knowledge/`);
 * nothing is computed here. Colour is delegated to `bandPresentation`, which
 * forces the neutral tone while the table is still `verified: false`, so an
 * unverified band can never paint the screen red (AGENTS rule 3).
 */
export function GrowthPage() {
  const baby = useActiveBaby((state) => state.baby)

  const [indicator, setIndicator] = useState<GrowthIndicator>('wfa')
  const [measurements, setMeasurements] = useState<Measurement[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (baby === null) return
    // Narrowed once: control-flow narrowing does not reach the async callback.
    const babyId = baby.id
    let cancelled = false

    setLoadState('loading')
    getRepo()
      .listMeasurements(babyId)
      .then((rows) => {
        if (cancelled) return
        setMeasurements(rows)
        setLoadState('ready')
      })
      .catch(() => {
        if (!cancelled) setLoadState('error')
      })

    return () => {
      cancelled = true
    }
  }, [baby, reloadToken])

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1)
  }, [])

  const latest = measurements.length === 0 ? undefined : measurements[measurements.length - 1]

  const latestScores = useMemo((): { indicator: GrowthIndicator; score: ZScoreResult }[] => {
    if (baby === null || latest === undefined) return []
    const scores: { indicator: GrowthIndicator; score: ZScoreResult }[] = []
    for (const value of INDICATORS) {
      const score = zForMeasurement(latest, baby, value)
      if (score !== null) scores.push({ indicator: value, score })
    }
    return scores
  }, [baby, latest])

  const assessment = useMemo(
    () => (baby === null ? null : assessVelocity(measurements, baby, indicator)),
    [measurements, baby, indicator],
  )

  const history = useMemo(
    () => measurements.slice(-HISTORY_LIMIT).reverse(),
    [measurements],
  )

  if (baby === null) {
    return (
      <Screen>
        <p className="mt-24 text-center text-sm text-mist">{t('common.loading')}</p>
      </Screen>
    )
  }

  const verified = isIndicatorVerified(indicator)

  return (
    <Screen>
      <header className="rise rise-1">
        <p className="text-[10.5px] font-medium tracking-[0.16em] text-honey/80 uppercase">
          {t('app.name')}
        </p>
        <h1 className="mt-2 font-display text-[2rem] leading-[1.05] tracking-[-0.02em] text-cream">
          {t('growth.title')}
        </h1>
        <p className="mt-2 text-[13px] text-mist">{t('growth.subtitle')}</p>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {!verified && <UnverifiedBadge />}
          <span className="text-[11.5px] text-mist">{t('common.localOnly')}</span>
        </div>
      </header>

      <div
        role="group"
        aria-label={t('growth.indicatorLabel')}
        className="rise rise-2 mt-5 grid grid-cols-3 gap-1 rounded-2xl border border-moss bg-canopy/60 p-1"
      >
        {INDICATORS.map((value) => {
          const active = value === indicator
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => setIndicator(value)}
              className={`flex min-h-11 items-center justify-center rounded-xl px-1.5 py-2 text-[11px] leading-snug font-medium transition active:scale-[0.98] ${
                active ? 'bg-honey text-night' : 'text-mist hover:text-cream'
              }`}
            >
              {t(INDICATOR_LABEL[value])}
            </button>
          )
        })}
      </div>

      {loadState === 'loading' ? (
        <p className="mt-16 text-center text-sm text-mist">{t('common.loading')}</p>
      ) : loadState === 'error' ? (
        <div role="alert" className="mt-16 text-center">
          <p className="text-sm text-ember">{t('common.error')}</p>
          <Button variant="secondary" className="mt-3" onClick={reload}>
            {t('common.retry')}
          </Button>
        </div>
      ) : (
        <>
          <Card className="rise rise-3 mt-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-[11px] font-medium tracking-[0.16em] text-honey/80 uppercase">
                {t('growth.latest')}
              </h2>
              {latest !== undefined && (
                <span className="shrink-0 text-[11px] tabular-nums text-mist">
                  {formatDay(latest.date)}
                </span>
              )}
            </div>

            {latest === undefined ? (
              <p className="mt-3 text-[13px] leading-relaxed text-mist">{t('growth.empty')}</p>
            ) : (
              <>
                <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-3">
                  {latest.weightG !== undefined && (
                    <ValueCell label={t('growth.weightLabel')} value={INT.format(latest.weightG)} />
                  )}
                  {latest.lengthCm !== undefined && (
                    <ValueCell
                      label={t('growth.lengthLabel')}
                      value={ONE_DECIMAL.format(latest.lengthCm)}
                    />
                  )}
                  {latest.headCm !== undefined && (
                    <ValueCell label={t('growth.headLabel')} value={ONE_DECIMAL.format(latest.headCm)} />
                  )}
                </dl>

                {latestScores.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {latestScores.map(({ indicator: key, score }) => (
                      <div key={key} className="flex min-w-0 flex-col gap-1">
                        <span className="text-[10px] leading-none text-mist/80">
                          {t(INDICATOR_SHORT[key])}
                        </span>
                        <BandPill band={score.band} z={score.z} verified={score.verified} />
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </Card>

          <div className="mt-4">
            <GrowthChart baby={baby} measurements={measurements} indicator={indicator} />
          </div>

          {assessment !== null && (
            <div className="mt-4">
              <VelocityAlert assessment={assessment} />
            </div>
          )}

          <MeasurementForm baby={baby} onSaved={reload} />

          <Card className="mt-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-[11px] font-medium tracking-[0.16em] text-honey/80 uppercase">
                {t('growth.history')}
              </h2>
            </div>

            {history.length === 0 ? (
              <p className="mt-3 text-[13px] leading-relaxed text-mist">{t('growth.empty')}</p>
            ) : (
              <ol className="mt-2 divide-y divide-moss/60">
                {history.map((row) => {
                  const score = zForMeasurement(row, baby, indicator)
                  return (
                    <li key={row.id} className="py-2.5 first:pt-1 last:pb-0">
                      <div className="flex min-w-0 items-center justify-between gap-2">
                        <span className="shrink-0 text-[12px] tabular-nums text-mist">
                          {formatDay(row.date)}
                        </span>
                        {score !== null && (
                          <BandPill band={score.band} z={score.z} verified={score.verified} />
                        )}
                      </div>

                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] leading-none text-cream/85">
                        {row.weightG !== undefined && (
                          <span className="min-w-0">
                            <span className="text-mist">{t('growth.weightLabel')}</span>{' '}
                            <span className="tabular-nums">{INT.format(row.weightG)}</span>
                          </span>
                        )}
                        {row.lengthCm !== undefined && (
                          <span className="min-w-0">
                            <span className="text-mist">{t('growth.lengthLabel')}</span>{' '}
                            <span className="tabular-nums">{ONE_DECIMAL.format(row.lengthCm)}</span>
                          </span>
                        )}
                        {row.headCm !== undefined && (
                          <span className="min-w-0">
                            <span className="text-mist">{t('growth.headLabel')}</span>{' '}
                            <span className="tabular-nums">{ONE_DECIMAL.format(row.headCm)}</span>
                          </span>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </Card>

          {!verified && (
            <p className="mt-4 text-[11px] leading-relaxed text-mist">{t('disclaimer')}</p>
          )}
        </>
      )}
    </Screen>
  )
}
