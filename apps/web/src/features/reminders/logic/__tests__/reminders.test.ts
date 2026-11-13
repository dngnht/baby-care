import { describe, expect, it } from 'vitest'
import type { Reminder, ReminderRepeat } from '../../../../core/db/schema'
import {
  dueSoon,
  formatWhen,
  nextOccurrence,
  parseDateTimeLocal,
  splitReminders,
  toDateTimeLocalValue,
} from '../reminders'

/** ISO UTC string for a local wall-clock time, so tests are timezone-safe. */
function iso(year: number, month: number, day: number, hour = 0, minute = 0): string {
  return new Date(year, month - 1, day, hour, minute).toISOString()
}

function reminder(
  id: string,
  at: string,
  overrides: Partial<Omit<Reminder, 'id' | 'at'>> = {},
): Reminder {
  return {
    id,
    babyId: 'baby-1',
    title: `Việc ${id}`,
    at,
    repeat: 'none',
    createdAt: iso(2026, 3, 1, 8),
    ...overrides,
  }
}

function ids(items: readonly Reminder[]): string[] {
  return items.map((item) => item.id)
}

/** Local `now` shared by the grouping tests: 10/03/2026 09:00. */
const NOW = new Date(2026, 2, 10, 9, 0)

describe('splitReminders', () => {
  it('buckets by due time and local day, keeping each bucket sorted by `at`', () => {
    const list = [
      reminder('upcoming-late', iso(2026, 3, 20, 9)),
      reminder('today-evening', iso(2026, 3, 10, 21)),
      reminder('overdue-yesterday', iso(2026, 3, 9, 18)),
      reminder('upcoming-next', iso(2026, 3, 11, 7)),
      reminder('today-soon', iso(2026, 3, 10, 9, 30)),
      reminder('overdue-today', iso(2026, 3, 10, 8)),
    ]

    const groups = splitReminders(list, NOW)

    expect(ids(groups.overdue)).toEqual(['overdue-yesterday', 'overdue-today'])
    expect(ids(groups.today)).toEqual(['today-soon', 'today-evening'])
    expect(ids(groups.upcoming)).toEqual(['upcoming-next', 'upcoming-late'])
    expect(groups.done).toEqual([])
  })

  it('treats a reminder due exactly now as today, not overdue', () => {
    const groups = splitReminders([reminder('exact', iso(2026, 3, 10, 9))], NOW)
    expect(ids(groups.today)).toEqual(['exact'])
    expect(groups.overdue).toEqual([])
  })

  it('puts a reminder with doneAt in `done`, even when it is in the past', () => {
    const groups = splitReminders(
      [reminder('done-past', iso(2026, 3, 1, 8), { doneAt: iso(2026, 3, 2, 8) })],
      NOW,
    )
    expect(ids(groups.done)).toEqual(['done-past'])
    expect(groups.overdue).toEqual([])
    expect(groups.today).toEqual([])
  })

  it('sorts the done bucket by `at` ascending like the others', () => {
    const groups = splitReminders(
      [
        reminder('done-late', iso(2026, 3, 5, 8), { doneAt: iso(2026, 3, 6, 8) }),
        reminder('done-early', iso(2026, 3, 2, 8), { doneAt: iso(2026, 3, 7, 8) }),
      ],
      NOW,
    )
    expect(ids(groups.done)).toEqual(['done-early', 'done-late'])
  })

  it('returns empty buckets for an empty list', () => {
    expect(splitReminders([], NOW)).toEqual({ overdue: [], today: [], upcoming: [], done: [] })
  })
})

describe('nextOccurrence', () => {
  const daily = (at: string): Reminder => reminder('daily', at, { repeat: 'daily' })
  const weekly = (at: string): Reminder => reminder('weekly', at, { repeat: 'weekly' })

  it('returns the stored date for a non-repeating reminder, even when past', () => {
    const past = iso(2026, 3, 1, 8, 15)
    expect(nextOccurrence(reminder('once', past), NOW).toISOString()).toBe(past)
  })

  it('keeps a future daily occurrence as-is', () => {
    const at = iso(2026, 3, 10, 10, 30)
    expect(nextOccurrence(daily(at), NOW).toISOString()).toBe(at)
  })

  it('rolls a past daily reminder to the same local time today', () => {
    const result = nextOccurrence(daily(iso(2026, 3, 4, 7, 45)), new Date(2026, 2, 10, 7, 0))
    expect(result.toISOString()).toBe(iso(2026, 3, 10, 7, 45))
  })

  it('rolls a daily reminder whose time already passed today to tomorrow', () => {
    const result = nextOccurrence(daily(iso(2026, 3, 1, 8)), new Date(2026, 2, 10, 8, 30))
    expect(result.toISOString()).toBe(iso(2026, 3, 11, 8))
  })

  it('preserves the local hour and minute across local days', () => {
    const result = nextOccurrence(daily(iso(2026, 2, 20, 21, 5)), NOW)
    expect(result.getHours()).toBe(21)
    expect(result.getMinutes()).toBe(5)
    expect(result.toISOString()).toBe(iso(2026, 3, 10, 21, 5))
  })

  it('moves a weekly reminder to the next seven-day slot', () => {
    // 03/03/2026 is a Tuesday; now is Tuesday 10/03 09:00.
    const result = nextOccurrence(weekly(iso(2026, 3, 3, 8)), NOW)
    expect(result.toISOString()).toBe(iso(2026, 3, 17, 8))
  })

  it('keeps a weekly reminder that is still ahead', () => {
    const at = iso(2026, 3, 12, 8)
    expect(nextOccurrence(weekly(at), NOW).toISOString()).toBe(at)
  })

  it('terminates for a very old anchor', () => {
    const result = nextOccurrence(daily(iso(2000, 1, 1, 6, 30)), NOW)
    expect(result.getTime()).toBeGreaterThanOrEqual(NOW.getTime())
    expect(result.toISOString()).toBe(iso(2026, 3, 11, 6, 30))
  })

  it('returns an invalid date unchanged instead of throwing', () => {
    expect(Number.isNaN(nextOccurrence(reminder('bad', 'not-a-date'), NOW).getTime())).toBe(true)
  })
})

describe('dueSoon', () => {
  it('includes the window edges and excludes what is outside it', () => {
    const list = [
      reminder('now', iso(2026, 3, 10, 9)),
      reminder('inside', iso(2026, 3, 10, 20)),
      reminder('edge', iso(2026, 3, 11, 9)),
      reminder('late', iso(2026, 3, 11, 9, 1)),
      reminder('past', iso(2026, 3, 10, 8)),
    ]

    expect(ids(dueSoon(list, NOW))).toEqual(['now', 'inside', 'edge'])
  })

  it('excludes reminders already marked done', () => {
    const list = [reminder('done', iso(2026, 3, 10, 10), { doneAt: iso(2026, 3, 10, 9, 5) })]
    expect(dueSoon(list, NOW)).toEqual([])
  })

  it('honours a custom window and sorts the result by due time', () => {
    const list = [
      reminder('in-two-hours', iso(2026, 3, 10, 11)),
      reminder('in-thirty', iso(2026, 3, 10, 9, 30)),
      reminder('in-five-hours', iso(2026, 3, 10, 14)),
    ]
    expect(ids(dueSoon(list, NOW, 1))).toEqual(['in-thirty'])
    expect(ids(dueSoon(list, NOW, 6))).toEqual(['in-thirty', 'in-two-hours', 'in-five-hours'])
  })

  it('returns an empty list for a zero-width window with nothing due right now', () => {
    const list = [reminder('later', iso(2026, 3, 10, 10))]
    expect(dueSoon(list, NOW, 0)).toEqual([])
  })
})

describe('formatWhen', () => {
  it('formats a local wall-clock time as dd/MM/yyyy HH:mm', () => {
    expect(formatWhen(new Date(2026, 2, 5, 7, 5).toISOString())).toBe('05/03/2026 07:05')
  })

  it('pads day, month, hour and minute', () => {
    expect(formatWhen(new Date(2026, 0, 1, 0, 0).toISOString())).toBe('01/01/2026 00:00')
  })

  it('returns a placeholder for an unparsable value', () => {
    expect(formatWhen('not-a-date')).toBe('--/--/---- --:--')
  })
})

describe('datetime-local conversion', () => {
  it('formats a Date for an input[type="datetime-local"] value', () => {
    expect(toDateTimeLocalValue(new Date(2026, 2, 5, 7, 5))).toBe('2026-03-05T07:05')
  })

  it('parses the input value back to the same local instant', () => {
    const parsed = parseDateTimeLocal('2026-03-05T07:05')
    expect(parsed).not.toBeNull()
    expect(parsed?.toISOString()).toBe(new Date(2026, 2, 5, 7, 5).toISOString())
  })

  it('accepts seconds and truncates them', () => {
    const parsed = parseDateTimeLocal('2026-03-05T07:05:42')
    expect(parsed?.getSeconds()).toBe(0)
  })

  it('rejects empty, malformed and impossible values', () => {
    expect(parseDateTimeLocal('')).toBeNull()
    expect(parseDateTimeLocal('2026-03-05')).toBeNull()
    expect(parseDateTimeLocal('nope')).toBeNull()
    expect(parseDateTimeLocal('2026-02-31T08:00')).toBeNull()
  })

  it('round-trips through the two helpers', () => {
    const date = new Date(2026, 11, 31, 23, 45)
    const value = toDateTimeLocalValue(date)
    expect(parseDateTimeLocal(value)?.toISOString()).toBe(date.toISOString())
  })
})

describe('ReminderRepeat typing', () => {
  it('covers every repeat value used by the page', () => {
    const values: ReminderRepeat[] = ['none', 'daily', 'weekly']
    expect(values).toHaveLength(3)
  })
})
