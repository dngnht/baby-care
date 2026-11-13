/**
 * Thin notification wrapper for the vaccine reminders.
 *
 * Everything native goes through `core/platform` (AGENTS rule 5 / CLAUDE) so
 * the Capacitor build (T050) can swap the implementation; the module is small
 * and side-effect free apart from the permission prompt, which makes it easy to
 * test with a mocked platform.
 */
import { t } from '../../../core/i18n'
import { requestPermission, show } from '../../../core/platform'
import { daysBetween, doseKey, type PlannedDose, type StoredDoseRef } from './schedule'

export type NotifyResult = 'shown' | 'blocked' | 'unsupported' | 'empty'

/** How many days ahead "sắp tới" means, matching the copy in `remindBody`. */
export const NOTIFY_WINDOW_DAYS = 3

/**
 * Doses due in the next `days` days (today included) that have not been given
 * yet. Overdue doses are intentionally excluded: they belong to the list view,
 * not to a "còn N ngày" reminder.
 */
export function dosesWithinDays(
  doses: readonly PlannedDose[],
  stored: readonly StoredDoseRef[],
  now: Date,
  days: number = NOTIFY_WINDOW_DAYS,
): PlannedDose[] {
  const given = new Set<string>()
  for (const dose of stored) {
    if (dose.givenDate !== undefined) given.add(doseKey(dose.vaccineCode, dose.doseNo))
  }

  return doses.filter((dose) => {
    if (given.has(doseKey(dose.code, dose.doseNo))) return false
    const remainingDays = daysBetween(now, dose.dueDate)
    return remainingDays >= 0 && remainingDays <= days
  })
}

/**
 * Ask for permission, then show one notification for the closest upcoming dose.
 *
 * Never prompts when there is nothing to remind about. The four outcomes map
 * 1:1 to the toast copy in `vi.json`.
 */
export async function notifyUpcoming(
  doses: readonly PlannedDose[],
  stored: readonly StoredDoseRef[],
  now: Date,
): Promise<NotifyResult> {
  const upcoming = dosesWithinDays(doses, stored, now)
  const next = upcoming[0]
  if (next === undefined) return 'empty'

  const permission = await requestPermission()
  if (permission === 'unsupported') return 'unsupported'
  if (permission !== 'granted') return 'blocked'

  const shown = await show({
    title: t('vaccines.remindTitle'),
    body: t('vaccines.remindBody', { name: next.name }),
    // Same tag as the calendar UID: a newer reminder replaces the older one.
    tag: `${next.code}-${next.doseNo}@beyeu`,
  })
  return shown ? 'shown' : 'blocked'
}
