import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { LogEntry, LogType } from '../../../../core/db/schema'
import { buildDailyTotals } from '../../logic/dailyTotals'
import { DailyComparison } from '../DailyComparison'

const NOW = new Date(2026, 4, 20, 23, 0, 0)

let counter = 0
function log(type: LogType, start: Date, payload: Record<string, unknown> = {}, end?: Date): LogEntry {
  counter += 1
  return {
    id: `cmp-${counter}`,
    babyId: 'baby-1',
    type,
    startAt: start.toISOString(),
    payload,
    createdBy: 'parent',
    ...(end === undefined ? {} : { endAt: end.toISOString() }),
  }
}

const ENTRIES = [
  log('feed_bottle', new Date(2026, 4, 20, 8, 0), { amountMl: 120 }),
  log('feed_bottle', new Date(2026, 4, 20, 12, 0), { amountMl: 180 }),
  log('diaper', new Date(2026, 4, 20, 9, 0), { diaperKind: 'wet' }),
  log('sleep', new Date(2026, 4, 20, 13, 0), {}, new Date(2026, 4, 20, 15, 0)),
  log('feed_bottle', new Date(2026, 4, 19, 8, 0), { amountMl: 200 }),
]

describe('DailyComparison', () => {
  it('renders the title, metric tabs, today value and seven day rows', () => {
    const rows = buildDailyTotals(ENTRIES, 7, NOW)
    const html = renderToStaticMarkup(<DailyComparison rows={rows} />)

    expect(html).toContain('So sánh 7 ngày')
    expect(html).toContain('Sữa bình')
    expect(html).toContain('Giấc ngủ')
    expect(html).toContain('300 ml')
    expect(html).toContain('TB ')
    expect(html).toContain('so với hôm qua')
    // One <li> per day, no skipped dates.
    expect((html.match(/<li/g) ?? []).length).toBe(7)
    expect(html).toContain('Hôm qua')
  })

  it('renders without data without claiming numbers', () => {
    const rows = buildDailyTotals([], 7, NOW)
    const html = renderToStaticMarkup(<DailyComparison rows={rows} />)
    expect(html).toContain('So sánh 7 ngày')
    expect(html).toContain('0 ml')
  })
})
