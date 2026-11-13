import { describe, expect, it } from 'vitest'
import type { LogEntry, LogType } from '../../../../core/db/schema'
import {
  DEFAULT_REMINDER_SETTINGS,
  REMINDER_STORAGE_KEY,
  dueReminders,
  lastDiaperAt,
  lastFeedAt,
  loadReminderSettings,
  saveReminderSettings,
  type ReminderSettings,
} from '../reminderSettings'

function store(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    dump: () => Object.fromEntries(data),
  }
}

let counter = 0
function log(type: LogType, start: Date): LogEntry {
  counter += 1
  return {
    id: `r-${counter}`,
    babyId: 'baby-1',
    type,
    startAt: start.toISOString(),
    payload: {},
    createdBy: 'parent',
  }
}

const NOW = new Date(2026, 4, 20, 12, 0, 0)
const minutesAgo = (minutes: number): string =>
  new Date(NOW.getTime() - minutes * 60_000).toISOString()

const ENABLED: ReminderSettings = {
  feed: { enabled: true, intervalMinutes: 180 },
  diaper: { enabled: true, intervalMinutes: 120 },
}

describe('settings persistence', () => {
  it('defaults to off', () => {
    const storage = store()
    const settings = loadReminderSettings(storage)
    expect(settings).toEqual(DEFAULT_REMINDER_SETTINGS)
    expect(settings.feed.enabled).toBe(false)
  })

  it('round-trips through storage', () => {
    const storage = store()
    saveReminderSettings(ENABLED, storage)
    expect(loadReminderSettings(storage)).toEqual(ENABLED)
    expect(JSON.parse(storage.dump()[REMINDER_STORAGE_KEY] ?? '{}')).toMatchObject({
      feed: { enabled: true, intervalMinutes: 180 },
    })
  })

  it('falls back to defaults for malformed data', () => {
    expect(loadReminderSettings(store({ [REMINDER_STORAGE_KEY]: '{nope' }))).toEqual(
      DEFAULT_REMINDER_SETTINGS,
    )
    const badInterval = loadReminderSettings(
      store({ [REMINDER_STORAGE_KEY]: JSON.stringify({ feed: { enabled: true, intervalMinutes: 7 } }) }),
    )
    expect(badInterval.feed).toEqual({ enabled: true, intervalMinutes: 180 })
    expect(badInterval.diaper).toEqual(DEFAULT_REMINDER_SETTINGS.diaper)
  })

  it('never throws when storage is unavailable', () => {
    expect(loadReminderSettings(undefined)).toEqual(DEFAULT_REMINDER_SETTINGS)
    expect(() => saveReminderSettings(ENABLED, undefined)).not.toThrow()
    const throwing = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    }
    expect(loadReminderSettings(throwing)).toEqual(DEFAULT_REMINDER_SETTINGS)
    expect(() => saveReminderSettings(ENABLED, throwing)).not.toThrow()
  })
})

describe('last event detection', () => {
  it('picks the newest feed across breast and bottle', () => {
    const entries = [
      log('feed_breast', new Date(2026, 4, 20, 8, 0)),
      log('feed_bottle', new Date(2026, 4, 20, 10, 0)),
      log('diaper', new Date(2026, 4, 20, 11, 0)),
    ]
    expect(lastFeedAt(entries)).toBe(new Date(2026, 4, 20, 10, 0).toISOString())
    expect(lastDiaperAt(entries)).toBe(new Date(2026, 4, 20, 11, 0).toISOString())
  })

  it('returns undefined when nothing matches', () => {
    expect(lastFeedAt([])).toBeUndefined()
    expect(lastDiaperAt([log('sleep', new Date(2026, 4, 20, 10, 0))])).toBeUndefined()
  })
})

describe('dueReminders', () => {
  it('stays quiet when the toggle is off', () => {
    const off: ReminderSettings = {
      feed: { enabled: false, intervalMinutes: 180 },
      diaper: { enabled: false, intervalMinutes: 120 },
    }
    expect(dueReminders(off, minutesAgo(600), minutesAgo(600), NOW)).toEqual([])
  })

  it('fires once the interval has passed', () => {
    const due = dueReminders(ENABLED, minutesAgo(200), undefined, NOW)
    expect(due).toHaveLength(1)
    expect(due[0]?.kind).toBe('feed')
    expect(due[0]?.sinceMinutes).toBe(200)
    expect(due[0]?.overdueMinutes).toBe(20)
  })

  it('fires exactly at the interval boundary', () => {
    const due = dueReminders(ENABLED, minutesAgo(180), undefined, NOW)
    expect(due[0]?.overdueMinutes).toBe(0)
  })

  it('does not fire before the interval', () => {
    expect(dueReminders(ENABLED, minutesAgo(179), undefined, NOW)).toEqual([])
  })

  it('never fires without a recorded event', () => {
    expect(dueReminders(ENABLED, undefined, undefined, NOW)).toEqual([])
  })

  it('sorts by the most overdue first', () => {
    const due = dueReminders(ENABLED, minutesAgo(200), minutesAgo(400), NOW)
    expect(due.map((item) => item.kind)).toEqual(['diaper', 'feed'])
  })

  it('ignores a timestamp in the future', () => {
    expect(dueReminders(ENABLED, minutesAgo(-30), undefined, NOW)).toEqual([])
  })
})
