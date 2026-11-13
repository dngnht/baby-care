import { describe, expect, it } from 'vitest'
import {
  DAYS_PER_MONTH,
  MILESTONES,
  ageInMonths,
  formatDdMmYyyy,
  milestoneStatus,
  redFlagMonth,
  sortByMonthThenDomain,
  summarizeChecks,
  type MilestoneCheckRef,
  type MilestoneItem,
} from '../milestones'

function itemById(id: string): MilestoneItem {
  const found = MILESTONES.items.find((item) => item.id === id)
  if (found === undefined) throw new Error(`missing milestone ${id}`)
  return found
}

describe('milestoneStatus', () => {
  it('is achieved when the check carries an achievedAt', () => {
    const item = itemById('m4_head')
    const check: MilestoneCheckRef = { milestoneId: item.id, achievedAt: '2026-01-01T00:00:00.000Z' }
    expect(milestoneStatus(item, check, 0, MILESTONES)).toBe('achieved')
  })

  it('treats a check without achievedAt as not achieved', () => {
    const item = itemById('m4_head')
    expect(milestoneStatus(item, { milestoneId: item.id }, 0, MILESTONES)).toBe('not_yet')
  })

  it('flags m4_head at its 6-month threshold from the file', () => {
    const item = itemById('m4_head')
    expect(MILESTONES.red_flags_redFlagIfNotBy[item.id]).toBe(6)
    expect(redFlagMonth(item, MILESTONES)).toBe(6)
    expect(milestoneStatus(item, undefined, 6, MILESTONES)).toBe('red_flag')
  })

  it('stays not_yet one month before the threshold', () => {
    expect(milestoneStatus(itemById('m4_head'), undefined, 5, MILESTONES)).toBe('not_yet')
  })

  it('falls back to month + 3 when the file has no threshold for the item', () => {
    const item = itemById('m2_smile')
    expect(MILESTONES.red_flags_redFlagIfNotBy[item.id]).toBeUndefined()
    expect(redFlagMonth(item, MILESTONES)).toBe(item.month + 3)
    expect(milestoneStatus(item, undefined, item.month + 2, MILESTONES)).toBe('not_yet')
    expect(milestoneStatus(item, undefined, item.month + 3, MILESTONES)).toBe('red_flag')
  })

  it('uses the threshold from the file, not a hard-coded default', () => {
    const file = {
      ...MILESTONES,
      red_flags_redFlagIfNotBy: { m4_head: 9 },
    }
    expect(redFlagMonth(itemById('m4_head'), file)).toBe(9)
    expect(milestoneStatus(itemById('m4_head'), undefined, 8, file)).toBe('not_yet')
    expect(milestoneStatus(itemById('m4_head'), undefined, 9, file)).toBe('red_flag')
  })
})

describe('summarizeChecks', () => {
  it('counts only achieved checks and covers every milestone in the file', () => {
    const checks: MilestoneCheckRef[] = [
      { milestoneId: 'm2_smile', achievedAt: '2026-01-01T00:00:00.000Z' },
      { milestoneId: 'm4_head' },
      { milestoneId: 'not_in_file', achievedAt: '2026-01-01T00:00:00.000Z' },
    ]

    const summary = summarizeChecks(MILESTONES.items, checks)
    expect(summary.total).toBe(MILESTONES.items.length)
    expect(summary.done).toBe(1)

    const socialTotal = MILESTONES.items.filter((item) => item.domain === 'social').length
    const social = summary.byDomain['social']
    expect(social).toEqual({ done: 1, total: socialTotal })

    const motorTotal = MILESTONES.items.filter((item) => item.domain === 'motor').length
    expect(summary.byDomain['motor']).toEqual({ done: 0, total: motorTotal })
  })

  it('has zero done before any check exists', () => {
    const summary = summarizeChecks(MILESTONES.items, [])
    expect(summary.done).toBe(0)
    expect(summary.total).toBe(MILESTONES.items.length)
  })
})

describe('sortByMonthThenDomain', () => {
  it('orders by month ascending and does not mutate the input', () => {
    const reversed = [...MILESTONES.items].reverse()
    const sorted = sortByMonthThenDomain(reversed)

    expect(sorted).toHaveLength(MILESTONES.items.length)
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1]
      const current = sorted[index]
      if (previous === undefined || current === undefined) throw new Error('missing item')
      expect(previous.month).toBeLessThanOrEqual(current.month)
    }

    // The source array keeps its original order.
    expect(reversed[0]).toBe(MILESTONES.items[MILESTONES.items.length - 1])
  })

  it('breaks a month tie by domain', () => {
    const tied: MilestoneItem[] = [
      { id: 'b', month: 6, domain: 'social', text: 'b' },
      { id: 'a', month: 6, domain: 'motor', text: 'a' },
    ]
    expect(sortByMonthThenDomain(tied).map((item) => item.id)).toEqual(['a', 'b'])
  })
})

describe('ageInMonths', () => {
  it('converts whole days into whole months', () => {
    expect(ageInMonths(0)).toBe(0)
    expect(ageInMonths(DAYS_PER_MONTH * 6)).toBe(6)
    expect(ageInMonths(-10)).toBe(0)
  })
})

describe('formatDdMmYyyy', () => {
  it('renders a local date as dd/MM/yyyy', () => {
    const date = new Date(2025, 0, 5, 12, 0, 0)
    expect(formatDdMmYyyy(date.toISOString())).toBe('05/01/2025')
  })

  it('returns malformed input unchanged', () => {
    expect(formatDdMmYyyy('not-a-date')).toBe('not-a-date')
  })
})
