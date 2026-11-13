/**
 * Personal "it has been a while" reminders shown on the home screen.
 *
 * These are NOT a medical schedule: the parent picks the interval, and the
 * prompt only fires from the last logged feed/diaper. Nothing here is derived
 * from `knowledge/`, and nothing claims what the baby *should* be doing.
 */
import type { LogEntry } from '../../../core/db/schema'
import { FEED_TYPES } from '../../logs/logMeta'

export type ReminderKind = 'feed' | 'diaper'

export interface ReminderSetting {
  enabled: boolean
  /** Minutes between prompts; the parent chooses from INTERVAL_OPTIONS. */
  intervalMinutes: number
}

export interface ReminderSettings {
  feed: ReminderSetting
  diaper: ReminderSetting
}

export const REMINDER_STORAGE_KEY = 'beyeu.reminderSettings.v1'

/** Off by default: a nudge must be opt-in. */
export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  feed: { enabled: false, intervalMinutes: 180 },
  diaper: { enabled: false, intervalMinutes: 180 },
}

/** Intervals offered in the UI (minutes). */
export const INTERVAL_OPTIONS: readonly number[] = [120, 180, 240, 300]

export interface DueReminder {
  kind: ReminderKind
  /** Minutes since the last matching log. */
  sinceMinutes: number
  /** Minutes past the chosen interval (>= 0). */
  overdueMinutes: number
  /** ISO timestamp of the last matching log. */
  lastAt: string
}

type ReadableStorage = Pick<Storage, 'getItem'> | undefined
type WritableStorage = Pick<Storage, 'setItem'> | undefined

function defaultStorage(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

function sanitizeSetting(raw: unknown, fallback: ReminderSetting): ReminderSetting {
  if (typeof raw !== 'object' || raw === null) return { ...fallback }
  const record = raw as Record<string, unknown>
  const enabled = record.enabled === true
  const interval = record.intervalMinutes
  return {
    enabled,
    intervalMinutes:
      typeof interval === 'number' && INTERVAL_OPTIONS.includes(interval)
        ? interval
        : fallback.intervalMinutes,
  }
}

/** Read settings from local storage; malformed data falls back to defaults. */
export function loadReminderSettings(storage: ReadableStorage = defaultStorage()): ReminderSettings {
  try {
    const text = storage?.getItem(REMINDER_STORAGE_KEY)
    if (text === undefined || text === null) return structuredCloneSettings(DEFAULT_REMINDER_SETTINGS)
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null) {
      return structuredCloneSettings(DEFAULT_REMINDER_SETTINGS)
    }
    const record = parsed as Record<string, unknown>
    return {
      feed: sanitizeSetting(record.feed, DEFAULT_REMINDER_SETTINGS.feed),
      diaper: sanitizeSetting(record.diaper, DEFAULT_REMINDER_SETTINGS.diaper),
    }
  } catch {
    return structuredCloneSettings(DEFAULT_REMINDER_SETTINGS)
  }
}

export function saveReminderSettings(
  settings: ReminderSettings,
  storage: WritableStorage = defaultStorage(),
): void {
  try {
    storage?.setItem(REMINDER_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Private mode / quota: reminders simply do not persist.
  }
}

function structuredCloneSettings(settings: ReminderSettings): ReminderSettings {
  return {
    feed: { ...settings.feed },
    diaper: { ...settings.diaper },
  }
}

function newestIso(entries: readonly LogEntry[], predicate: (entry: LogEntry) => boolean): string | undefined {
  let newest: string | undefined
  let newestMs = Number.NEGATIVE_INFINITY
  for (const entry of entries) {
    if (!predicate(entry)) continue
    const ms = Date.parse(entry.startAt)
    if (Number.isNaN(ms) || ms > newestMs) {
      if (Number.isNaN(ms)) continue
      newestMs = ms
      newest = entry.startAt
    }
  }
  return newest
}

export function lastFeedAt(entries: readonly LogEntry[]): string | undefined {
  return newestIso(entries, (entry) => FEED_TYPES.includes(entry.type))
}

export function lastDiaperAt(entries: readonly LogEntry[]): string | undefined {
  return newestIso(entries, (entry) => entry.type === 'diaper')
}

/**
 * Which enabled reminders are due. A missing last event never fires: without a
 * recorded time there is nothing honest to measure from.
 */
export function dueReminders(
  settings: ReminderSettings,
  feedAt: string | undefined,
  diaperAt: string | undefined,
  now: Date,
): DueReminder[] {
  const nowMs = now.getTime()
  const result: DueReminder[] = []

  const check = (kind: ReminderKind, setting: ReminderSetting, last: string | undefined): void => {
    if (!setting.enabled || last === undefined) return
    const lastMs = Date.parse(last)
    if (Number.isNaN(lastMs) || lastMs > nowMs) return
    const sinceMinutes = Math.floor((nowMs - lastMs) / 60_000)
    const overdueMinutes = sinceMinutes - setting.intervalMinutes
    if (overdueMinutes >= 0) result.push({ kind, sinceMinutes, overdueMinutes, lastAt: last })
  }

  check('feed', settings.feed, feedAt)
  check('diaper', settings.diaper, diaperAt)
  return result.sort((a, b) => b.overdueMinutes - a.overdueMinutes)
}
