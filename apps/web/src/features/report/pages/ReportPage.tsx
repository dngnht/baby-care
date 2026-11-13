import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useActiveBaby } from '../../../core/baby/activeBaby'
import { getRepo } from '../../../core/db/repo'
import { t, type TranslationKey } from '../../../core/i18n'
import type { GrowthIndicator } from '../../../core/standards/growth'
import { MS_PER_DAY, formatDuration } from '../../../core/time/day'
import { Button } from '../../../ui/Button'
import { Screen } from '../../../ui/Screen'
import { UnverifiedBadge } from '../../../ui/UnverifiedBadge'
import { bandPresentation, formatZ } from '../../growth/logic/measurementForm'
import { describeLog } from '../../logs/describeLog'
import { logMeta } from '../../logs/logMeta'
import {
  RECENT_WINDOW_DAYS,
  buildReportData,
  formatReportDate,
  formatReportTime,
  type ReportData,
} from '../logic/report'
import '../report.css'

type LoadState = 'loading' | 'ready' | 'error'

/** How many of the newest logs the report lists. */
const RECENT_LOG_LIMIT = 10

/** Long label used beside a z-score ("Cân nặng theo tuổi"). */
const INDICATOR_LABEL: Readonly<Record<GrowthIndicator, TranslationKey>> = {
  wfa: 'growth.indicator.wfa',
  lhfa: 'growth.indicator.lhfa',
  hcfa: 'growth.indicator.hcfa',
}

/** Short label used beside a raw measurement ("Cân nặng"). */
const MEASURE_LABEL: Readonly<Record<GrowthIndicator, TranslationKey>> = {
  wfa: 'growth.short.wfa',
  lhfa: 'growth.short.lhfa',
  hcfa: 'growth.short.hcfa',
}

/** "6 kg", "3.55 kg": trailing zeros are dropped, never padded. */
function formatKg(weightKg: number): string {
  return `${Number(weightKg.toFixed(2))} kg`
}

/** "60.5 cm" - lengths are measured to one decimal in the app. */
function formatCm(value: number): string {
  return `${Number(value.toFixed(1))} cm`
}

/**
 * T043 - the visit report.
 *
 * A read-only summary of everything stored on the device (profile, newest
 * measurement with z-scores, vaccination progress, the last 48 hours), laid
 * out so the browser's own "Print / Save as PDF" turns it into a clean sheet.
 * No data leaves the device: printing goes through `window.print()` and the
 * print rules live in `report.css`.
 */
export function ReportPage() {
  const baby = useActiveBaby((state) => state.baby)

  const [data, setData] = useState<ReportData | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (baby === null) return
    // Narrowed once: control-flow narrowing does not reach the nested function.
    const activeBaby = baby
    let cancelled = false
    const repo = getRepo()

    async function prepare() {
      setLoadState('loading')
      const now = new Date()
      const from = new Date(now.getTime() - RECENT_WINDOW_DAYS * MS_PER_DAY)

      const [measurements, doses, logs] = await Promise.all([
        repo.listMeasurements(activeBaby.id),
        repo.listVaccineDoses(activeBaby.id),
        repo.listLogs(activeBaby.id, from, now),
      ])

      if (cancelled) return
      setData(
        buildReportData({
          baby: activeBaby,
          measurements,
          doses,
          logs,
          now,
        }),
      )
      setLoadState('ready')
    }

    void prepare().catch(() => {
      if (!cancelled) setLoadState('error')
    })

    return () => {
      cancelled = true
    }
  }, [baby, reloadToken])

  function handlePrint() {
    window.print()
  }

  if (baby === null || (data === null && loadState !== 'error')) {
    return (
      <Screen>
        <p className="mt-24 text-center text-sm text-mist">{t('common.loading')}</p>
      </Screen>
    )
  }

  if (data === null) {
    return (
      <Screen>
        <div role="alert" className="mt-24 text-center">
          <p className="text-sm text-ember">{t('common.error')}</p>
          <Button
            variant="secondary"
            className="mt-3"
            onClick={() => setReloadToken((token) => token + 1)}
          >
            {t('common.retry')}
          </Button>
        </div>
      </Screen>
    )
  }

  const growth = data.growth
  const isPremature = data.profile.correctedDays !== data.profile.ageDays
  const renderNow = new Date()

  const measures: { indicator: GrowthIndicator; value: string }[] = []
  if (growth !== null) {
    if (growth.weightKg !== undefined) {
      measures.push({ indicator: 'wfa', value: formatKg(growth.weightKg) })
    }
    if (growth.lengthCm !== undefined) {
      measures.push({ indicator: 'lhfa', value: formatCm(growth.lengthCm) })
    }
    if (growth.headCm !== undefined) {
      measures.push({ indicator: 'hcfa', value: formatCm(growth.headCm) })
    }
  }

  const recentLogs = data.recent.logs.slice(0, RECENT_LOG_LIMIT)
  const pendingCount = data.vaccines.totalCount - data.vaccines.givenCount
  const generatedLabel = `${formatReportDate(data.generatedAt)} ${formatReportTime(data.generatedAt)}`

  return (
    <Screen>
      <header className="rise rise-1">
        <Link
          to="/more"
          className="no-print inline-flex items-center gap-1.5 text-[12.5px] text-mist transition hover:text-cream"
        >
          <span aria-hidden="true" className="text-base leading-none">
            ‹
          </span>
          {t('common.back')}
        </Link>

        <p className="mt-5 text-[10.5px] font-medium tracking-[0.16em] text-honey/80 uppercase">
          {t('app.name')}
        </p>
        <h1 className="report-title mt-2 font-display text-[2rem] leading-[1.05] tracking-[-0.02em] text-cream">
          {t('report.title')}
        </h1>
        <p className="report-subtitle mt-2 text-[13px] text-mist">{t('report.subtitle')}</p>

        <Button className="no-print mt-4" fullWidth onClick={handlePrint}>
          {t('report.print')}
        </Button>
      </header>

      <div className="report-page rise rise-2 mt-5">
        <section className="report-section">
          <h2 className="report-heading">{t('report.profile')}</h2>

          <p className="mt-2 text-[16px] leading-snug font-medium break-words text-cream">
            {data.profile.name || t('profile.defaultName')}
          </p>
          <p className="mt-1 text-[13px] text-mist">
            {t('profile.age', { days: data.profile.ageDays })}
          </p>
          {isPremature && (
            <p className="mt-0.5 text-[13px] text-honey/90">
              {t('profile.ageCorrected', { days: data.profile.correctedDays })}
            </p>
          )}
          <div className="mt-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="text-mist">{t('onboarding.sexLabel')}</span>
            <span className="text-cream">
              {t(data.profile.sex === 'M' ? 'onboarding.sexMale' : 'onboarding.sexFemale')}
            </span>
          </div>
        </section>

        <section className="report-section">
          <h2 className="report-heading">{t('report.growth')}</h2>

          {growth === null ? (
            <p className="mt-2 text-[13px] text-mist">{t('report.noData')}</p>
          ) : (
            <>
              <div className="mt-2 flex items-baseline justify-between gap-3 text-[12.5px]">
                <span className="text-mist">{t('growth.latest')}</span>
                <span className="text-cream tabular-nums">{formatReportDate(growth.date)}</span>
              </div>

              {measures.length === 0 && growth.scores.length === 0 && (
                <p className="mt-1 text-[12.5px] text-mist">{t('report.noData')}</p>
              )}

              {measures.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {measures.map((row) => (
                    <li
                      key={row.indicator}
                      className="flex items-baseline justify-between gap-3 text-[13px]"
                    >
                      <span className="text-mist">{t(MEASURE_LABEL[row.indicator])}</span>
                      <span className="font-medium text-cream tabular-nums">{row.value}</span>
                    </li>
                  ))}
                </ul>
              )}

              {growth.scores.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {growth.scores.map((score) => (
                    <li
                      key={score.indicator}
                      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[12.5px]"
                    >
                      <span className="min-w-0 text-mist">{t(INDICATOR_LABEL[score.indicator])}</span>
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-cream tabular-nums">
                          {t('growth.zscore')} {formatZ(score.z)}
                        </span>
                        <span className="text-[11.5px] text-mist">
                          {t(bandPresentation(score.band, score.verified).labelKey)}
                        </span>
                        {!score.verified && <UnverifiedBadge />}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        <section className="report-section">
          <h2 className="report-heading">{t('report.vaccines')}</h2>

          <div className="mt-2 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="text-mist">{t('report.given')}</span>
            <span className="text-cream tabular-nums">
              {data.vaccines.givenCount}/{data.vaccines.totalCount}
            </span>
          </div>

          {data.vaccines.given.length === 0 ? (
            <p className="mt-1 text-[12.5px] text-mist">{t('report.noData')}</p>
          ) : (
            <ul className="mt-1.5 space-y-1.5">
              {data.vaccines.given.map((entry) => (
                <li
                  key={`${entry.name}-${entry.doseNo}-${entry.givenDate}`}
                  className="text-[13px] leading-snug"
                >
                  <span className="break-words text-cream">{entry.name}</span>
                  <span className="mt-0.5 block text-[11.5px] text-mist tabular-nums">
                    {t('vaccines.doseNo', { dose: entry.doseNo })}
                    {' · '}
                    {t('vaccines.givenOn', { date: formatReportDate(entry.givenDate) })}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="text-mist">{t('report.pending')}</span>
            <span className="text-cream tabular-nums">{pendingCount}</span>
          </div>

          <p className="mt-2 text-[11.5px] font-medium tracking-[0.08em] text-mist uppercase">
            {t('report.upcoming')}
          </p>

          {data.vaccines.next.length === 0 ? (
            <p className="mt-1 text-[12.5px] text-mist">{t('report.noData')}</p>
          ) : (
            <ul className="mt-1 space-y-1.5">
              {data.vaccines.next.map((entry) => (
                <li
                  key={`${entry.name}-${entry.doseNo}-${entry.dueDate}`}
                  className="text-[13px] leading-snug"
                >
                  <span className="break-words text-cream">{entry.name}</span>
                  <span className="mt-0.5 block text-[11.5px] text-mist tabular-nums">
                    {t('vaccines.doseNo', { dose: entry.doseNo })}
                    {' · '}
                    {t('vaccines.due', { date: formatReportDate(entry.dueDate) })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="report-section">
          <h2 className="report-heading">{t('report.recent')}</h2>

          <ul className="mt-2 space-y-1 text-[13px]">
            <li className="flex items-baseline justify-between gap-3">
              <span className="text-mist">{t('report.feedCount')}</span>
              <span className="text-cream tabular-nums">{data.recent.feedCount}</span>
            </li>
            <li className="flex items-baseline justify-between gap-3">
              <span className="text-mist">{t('report.sleepTotal')}</span>
              <span className="text-cream tabular-nums">
                {formatDuration(data.recent.sleepMinutes)}
              </span>
            </li>
            <li className="flex items-baseline justify-between gap-3">
              <span className="text-mist">{t('report.diaperWet')}</span>
              <span className="text-cream tabular-nums">{data.recent.diaperWet}</span>
            </li>
            {data.recent.tempMax !== undefined && (
              <li className="flex items-baseline justify-between gap-3">
                <span className="text-mist">{t('report.tempMax')}</span>
                <span className="text-cream tabular-nums">
                  {t('illness.tempMax', { max: data.recent.tempMax })}
                </span>
              </li>
            )}
          </ul>

          {recentLogs.length === 0 ? (
            <p className="mt-3 text-[12.5px] text-mist">{t('report.noData')}</p>
          ) : (
            <ul className="mt-3 space-y-1 border-t border-moss/60 pt-2.5">
              {recentLogs.map((entry) => {
                const detail = describeLog(entry, renderNow)
                return (
                  <li key={entry.id} className="flex items-baseline gap-2 text-[12.5px] leading-snug">
                    <span className="w-11 shrink-0 text-mist tabular-nums">
                      {formatReportTime(entry.startAt)}
                    </span>
                    <span className="min-w-0 flex-1 break-words">
                      <span className="text-cream">{t(logMeta(entry.type).labelKey)}</span>
                      {detail !== '' && <span className="text-mist"> · {detail}</span>}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <div className="report-note">
          <p className="text-[11.5px] text-mist tabular-nums">
            {t('report.generated', { time: generatedLabel })}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-mist">{t('report.note')}</p>
        </div>
      </div>
    </Screen>
  )
}
