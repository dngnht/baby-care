import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { t, type TranslationKey } from '../../../core/i18n'
import { Card } from '../../../ui/Card'
import {
  averageOf,
  dayLabel,
  deltaOf,
  todayTotals,
  type DayMetric,
  type DayTotals,
} from '../logic/dailyTotals'

const MIST = '#8ea79b'
const HONEY = '#f0b563'
const MOSS = '#1b3229'

interface MetricOption {
  metric: DayMetric
  labelKey: TranslationKey
  /** Raw stored value -> the number drawn on the Y axis. */
  toAxis: (raw: number) => number
  /** Raw stored value -> human text (chips, rows, delta). */
  formatRaw: (raw: number) => string
  /** Axis value -> tooltip text. */
  formatAxis: (axis: number) => string
}

const OPTIONS: readonly MetricOption[] = [
  {
    metric: 'milkMl',
    labelKey: 'dashboard.metricMilk',
    toAxis: (raw) => raw,
    formatRaw: (raw) => `${Math.round(raw)} ml`,
    formatAxis: (axis) => `${Math.round(axis)} ml`,
  },
  {
    metric: 'sleepMinutes',
    labelKey: 'dashboard.metricSleep',
    toAxis: (raw) => Math.round((raw / 60) * 10) / 10,
    formatRaw: (raw) => `${(raw / 60).toFixed(1)} h`,
    formatAxis: (axis) => `${axis.toFixed(1)} h`,
  },
  {
    metric: 'diaperCount',
    labelKey: 'dashboard.metricDiaper',
    toAxis: (raw) => raw,
    formatRaw: (raw) => String(Math.round(raw)),
    formatAxis: (axis) => String(Math.round(axis)),
  },
]

interface ChartRow {
  dayKey: string
  label: string
  value: number
  fullLabel: string
}

const AXIS_TICK = { fill: MIST, fontSize: 10.5 }

/**
 * Seven-day comparison of bottle volume, sleep and diaper count.
 *
 * These are the parent's own recorded numbers (no WHO/reference thresholds),
 * so the card is safe to show while the care tables are still unverified.
 * Sleep hours are each local day's share, not the night that started it.
 */
export function DailyComparison({ rows }: { rows: readonly DayTotals[] }) {
  const [metric, setMetric] = useState<DayMetric>('milkMl')
  const option = OPTIONS.find((item) => item.metric === metric) ?? (OPTIONS[0] as MetricOption)

  const today = todayTotals(rows)
  const previous = rows.length >= 2 ? rows[rows.length - 2] : undefined
  const average = averageOf(rows.slice(0, -1), metric)

  const chartRows = useMemo<ChartRow[]>(
    () =>
      rows.map((row) => {
        const label = dayLabel(row, rows)
        const display =
          label === 'today'
            ? t('dashboard.legendToday')
            : label === 'yesterday'
              ? t('dashboard.yesterday')
              : label
        return {
          dayKey: row.dayKey,
          label: display,
          fullLabel: `${String(row.date.getDate()).padStart(2, '0')}/${String(row.date.getMonth() + 1).padStart(2, '0')}/${row.date.getFullYear()}`,
          value: option.toAxis(row[metric]),
        }
      }),
    [rows, metric, option],
  )

  const todayRaw = today === undefined ? 0 : today[metric]
  const delta = deltaOf(todayRaw, previous === undefined ? null : previous[metric])
  const averageAxis = average === null ? null : option.toAxis(average)

  const deltaText =
    delta === null
      ? null
      : delta === 0
        ? t('dashboard.deltaSame')
        : delta > 0
          ? t('dashboard.deltaUp', { value: option.formatRaw(Math.abs(delta)) })
          : t('dashboard.deltaDown', { value: option.formatRaw(Math.abs(delta)) })

  return (
    <Card className="min-w-0 overflow-hidden">
      <h2 className="text-[11px] font-medium tracking-[0.14em] text-honey/80 uppercase">
        {t('dashboard.compareTitle')}
      </h2>
      <p className="mt-1 text-[11px] leading-relaxed text-mist">{t('dashboard.compareHint')}</p>

      <div className="mt-3 flex gap-1.5" role="group" aria-label={t('dashboard.compareTitle')}>
        {OPTIONS.map((item) => {
          const active = item.metric === metric
          return (
            <button
              key={item.metric}
              type="button"
              aria-pressed={active}
              onClick={() => setMetric(item.metric)}
              className={`min-h-9 flex-1 rounded-xl border px-2 text-[11.5px] font-medium transition ${
                active
                  ? 'border-honey/60 bg-honey/15 text-honey'
                  : 'border-moss bg-night/50 text-mist hover:text-cream'
              }`}
            >
              {t(item.labelKey)}
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="font-display text-[1.5rem] leading-none text-cream tabular-nums">
          {option.formatRaw(todayRaw)}
        </p>
        {average !== null && (
          <p className="text-[11.5px] text-mist tabular-nums">
            {t('dashboard.average', { value: option.formatRaw(average) })}
          </p>
        )}
      </div>
      {deltaText !== null && (
        <p className={`mt-1 text-[11.5px] tabular-nums ${delta !== null && delta > 0 ? 'text-honey' : 'text-mist'}`}>
          {deltaText}
        </p>
      )}

      <div className="mt-3 min-w-0" style={{ height: 168 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartRows} margin={{ top: 8, right: 4, bottom: 0, left: -22 }}>
            <CartesianGrid stroke={MIST} strokeOpacity={0.12} vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} interval={0} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={34} />
            <Tooltip
              cursor={{ fill: MOSS, fillOpacity: 0.35 }}
              contentStyle={{
                background: '#0e1d18',
                border: '1px solid #1b3229',
                borderRadius: 12,
                fontSize: 11,
                color: '#f5eee2',
              }}
              labelStyle={{ color: MIST }}
              formatter={(value: number) => option.formatAxis(value)}
              labelFormatter={(_label, payload) => {
                const row = payload?.[0]?.payload as ChartRow | undefined
                return row?.fullLabel ?? ''
              }}
            />
            {averageAxis !== null && (
              <ReferenceLine
                y={averageAxis}
                stroke={MIST}
                strokeDasharray="4 4"
                strokeOpacity={0.6}
                label={{
                  value: t('dashboard.legendAvg'),
                  fill: MIST,
                  fontSize: 9.5,
                  position: 'insideTopRight',
                }}
              />
            )}
            <Bar dataKey="value" fill={HONEY} fillOpacity={0.8} radius={[5, 5, 0, 0]} maxBarSize={26} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <ul className="mt-2 divide-y divide-moss/50 overflow-hidden rounded-2xl border border-moss/60">
        {rows.map((row, index) => {
          const label = dayLabel(row, rows)
          const display =
            label === 'today'
              ? t('dashboard.legendToday')
              : label === 'yesterday'
                ? t('dashboard.yesterday')
                : label
          const value = row[metric]
          const before = index === 0 ? undefined : rows[index - 1]
          const rowDelta = deltaOf(value, before === undefined ? null : before[metric])
          return (
            <li key={row.dayKey} className="flex items-center gap-2 px-3 py-1.5 text-[11.5px]">
              <span className="w-20 shrink-0 text-mist">{display}</span>
              <span className="flex-1 text-right font-medium text-cream tabular-nums">
                {option.formatRaw(value)}
              </span>
              <span
                className={`w-16 shrink-0 text-right text-[10.5px] tabular-nums ${
                  rowDelta === null || rowDelta === 0
                    ? 'text-mist/60'
                    : rowDelta > 0
                      ? 'text-honey'
                      : 'text-mist'
                }`}
              >
                {rowDelta === null || rowDelta === 0
                  ? ''
                  : `${rowDelta > 0 ? '+' : '−'}${option.formatRaw(Math.abs(rowDelta))}`}
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
