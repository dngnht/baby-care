import { useMemo } from 'react'
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Baby, Measurement } from '../../../core/db/schema'
import { t, type TranslationKey } from '../../../core/i18n'
import { indicatorUnit, type GrowthIndicator } from '../../../core/standards/growth'
import { isIndicatorVerified, lmsTable } from '../../../core/standards/lms'
import { Card } from '../../../ui/Card'
import { UnverifiedBadge } from '../../../ui/UnverifiedBadge'
import {
  DAYS_PER_MONTH,
  SD_BANDS,
  buildBabyPoints,
  buildSdSeries,
  chartDomain,
  type BabyPoint,
  type SdSeries,
} from '../logic/chartSeries'

export interface GrowthChartProps {
  baby: Baby
  measurements: Measurement[]
  indicator: GrowthIndicator
  /** Chart height in px; the card stays inside the 240–260 band. */
  height?: number
}

/** Reference curves stay muted (mist / moss) — the baby's line is the accent. */
const MIST = '#8ea79b'
const MOSS = '#1b3229'
const HONEY = '#f0b563'

interface SdStyle {
  stroke: string
  opacity: number
  width: number
}

const SD_STYLE: Record<number, SdStyle> = {
  [-3]: { stroke: MIST, opacity: 0.3, width: 1 },
  [-2]: { stroke: MIST, opacity: 0.45, width: 1 },
  [-1]: { stroke: MOSS, opacity: 1, width: 1 },
  [0]: { stroke: MIST, opacity: 0.9, width: 1.6 },
  [1]: { stroke: MOSS, opacity: 1, width: 1 },
  [2]: { stroke: MIST, opacity: 0.45, width: 1 },
  [3]: { stroke: MIST, opacity: 0.3, width: 1 },
}

const INDICATOR_LABEL: Record<GrowthIndicator, TranslationKey> = {
  wfa: 'growth.indicator.wfa',
  lhfa: 'growth.indicator.lhfa',
  hcfa: 'growth.indicator.hcfa',
}

const NUMBER = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 })

const AXIS_TICK = { fill: MIST, fontSize: 11 }

/** Merged reference rows so all seven curves share one dataset. */
type ChartRow = { ageDays: number } & Record<string, number>

function sdKey(band: number): string {
  return `sd${band}`
}

function mergeSeries(series: SdSeries[]): ChartRow[] {
  const byAge = new Map<number, ChartRow>()
  for (const band of series) {
    for (const point of band.points) {
      const key = sdKey(band.band)
      const row = byAge.get(point.ageDays) ?? { ageDays: point.ageDays }
      row[key] = point.value
      byAge.set(point.ageDays, row)
    }
  }
  return [...byAge.values()].sort((a, b) => a.ageDays - b.ageDays)
}

/** Month ticks, coarse enough to stay readable at 390 px. */
function monthTicks(xMax: number): number[] {
  const months = xMax / DAYS_PER_MONTH
  const step = months > 12 ? 6 : 3
  const ticks: number[] = []
  for (let month = 0; month <= months + 0.01; month += step) ticks.push(month * DAYS_PER_MONTH)
  return ticks
}

interface TooltipItem {
  payload?: unknown
}

function isBabyPoint(value: unknown): value is BabyPoint {
  if (typeof value !== 'object' || value === null) return false
  const point = value as Record<string, unknown>
  return (
    typeof point.ageDays === 'number' &&
    typeof point.value === 'number' &&
    typeof point.z === 'number'
  )
}

interface GrowthTooltipProps {
  unit: 'kg' | 'cm'
  active?: boolean
  payload?: ReadonlyArray<TooltipItem>
}

/**
 * Tooltip for the baby's own points: age in days, the measured value in the
 * indicator unit and the WHO z-score. Reference curves deliberately have no
 * tooltip (they are context, not the child's data).
 */
function GrowthTooltip({ unit, active, payload }: GrowthTooltipProps) {
  const point = payload?.map((item) => item.payload).find(isBabyPoint)
  if (active !== true || point === undefined) return null

  return (
    <div className="rounded-xl border border-moss/80 bg-canopy/95 px-3 py-2 text-[11px] text-cream shadow-lg">
      <p className="font-medium">{t('profile.age', { days: point.ageDays })}</p>
      <p className="mt-1 text-honey">{`${NUMBER.format(point.value)} ${unit}`}</p>
      <p className="text-mist">
        {t('growth.zscore')}
        {`: ${NUMBER.format(point.z)}`}
      </p>
    </div>
  )
}

/**
 * WHO growth chart: the seven reference curves plus the baby's measurements.
 * Unverified tables render in honey/mist only and carry the badge (AGENTS rule 3).
 */
export function GrowthChart({ baby, measurements, indicator, height = 250 }: GrowthChartProps) {
  const verified = isIndicatorVerified(indicator)
  const unit = indicatorUnit(indicator)

  const table = useMemo(() => lmsTable(indicator, baby.sex), [indicator, baby.sex])
  const series = useMemo(() => buildSdSeries(table), [table])
  const rows = useMemo(() => mergeSeries(series), [series])
  const points = useMemo(
    () => buildBabyPoints(measurements, baby, indicator),
    [measurements, baby, indicator],
  )
  const domain = useMemo(() => chartDomain(table, indicator), [table, indicator])
  const ticks = useMemo(() => monthTicks(domain.xMax), [domain.xMax])

  return (
    <Card className="min-w-0 overflow-hidden">
      <h2 className="font-display text-base text-cream">{t(INDICATOR_LABEL[indicator])}</h2>
      <div className="mt-1 mb-2 flex flex-wrap items-center gap-2 text-[11px] text-mist">
        <span>{t('growth.chartHint')}</span>
        {!verified && <UnverifiedBadge />}
      </div>

      {points.length === 0 ? (
        <p className="py-12 text-center text-[11px] text-mist">{t('growth.chartEmpty')}</p>
      ) : (
        <div className="min-w-0" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={MIST} strokeOpacity={0.12} vertical={false} />
              <XAxis
                dataKey="ageDays"
                type="number"
                domain={[0, domain.xMax]}
                ticks={ticks}
                tickFormatter={(value: number) => String(Math.round(value / DAYS_PER_MONTH))}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={[domain.yMin, domain.yMax]}
                width={46}
                tickFormatter={(value: number) => NUMBER.format(value)}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
              />
              {/* `shared={false}` switches Recharts to per-item tooltips, so the
                  card only pops up when the parent hovers one of the baby dots. */}
              <Tooltip content={<GrowthTooltip unit={unit} />} shared={false} cursor={false} />
              <Legend
                verticalAlign="top"
                align="right"
                height={20}
                iconSize={9}
                wrapperStyle={{ fontSize: 11, color: MIST }}
              />

              {SD_BANDS.map((band) => {
                const style = SD_STYLE[band]
                return (
                  <Line
                    key={band}
                    type="monotone"
                    dataKey={sdKey(band)}
                    name={band === 3 ? t('growth.chartHint') : undefined}
                    legendType={band === 3 ? 'line' : 'none'}
                    stroke={style?.stroke ?? MIST}
                    strokeOpacity={style?.opacity ?? 0.4}
                    strokeWidth={style?.width ?? 1}
                    dot={false}
                    activeDot={false}
                    isAnimationActive={false}
                  />
                )
              })}

              <Scatter
                data={points}
                dataKey="value"
                name={t('profile.defaultName')}
                fill={HONEY}
                stroke={HONEY}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}
