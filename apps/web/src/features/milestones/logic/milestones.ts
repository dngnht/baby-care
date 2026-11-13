/**
 * Pure developmental-milestone logic (T040).
 *
 * Every milestone text and every red-flag threshold comes from
 * `knowledge/milestones/milestones_vi.json` — nothing is hard-coded here
 * (AGENTS rule 2). The file is still `verified: false`, so the
 * "Đang chờ xác minh" badge is driven by the file's own flag and the page
 * never paints a red warning while that flag is false (AGENTS rule 3).
 */
import milestonesJson from '../../../../../../knowledge/milestones/milestones_vi.json'

/** One developmental milestone row from the knowledge file. */
export interface MilestoneItem {
  id: string
  /** Age, in whole months, at which the milestone is expected. */
  month: number
  /** Domain slug (motor / social / language / cognitive). */
  domain: string
  /** Parent-facing description, copied verbatim from the file. */
  text: string
}

/** The bundled milestone knowledge file. */
export interface MilestoneFile {
  verified: boolean
  source?: string
  /** Per-milestone age (months) after which a missed milestone is a concern. */
  red_flags_redFlagIfNotBy: Readonly<Record<string, number>>
  items: readonly MilestoneItem[]
}

/** The subset of a stored `MilestoneCheck` this logic needs. */
export interface MilestoneCheckRef {
  milestoneId: string
  /** ISO 8601 UTC */
  achievedAt?: string
}

export type MilestoneStatus = 'achieved' | 'not_yet' | 'red_flag'

export interface DomainProgress {
  done: number
  total: number
}

export interface MilestoneSummary {
  done: number
  total: number
  byDomain: Record<string, DomainProgress>
}

/** The bundled file, typed once so callers share the same shape. */
export const MILESTONES: MilestoneFile = milestonesJson

/** Average Gregorian month, used only to turn an age in days into months. */
export const DAYS_PER_MONTH = 30.4375

/** Whole months for an age expressed in (corrected) days. Never negative. */
export function ageInMonths(days: number): number {
  return Math.max(0, Math.floor(days / DAYS_PER_MONTH))
}

/**
 * Age (months) after which a still-missing milestone should be discussed with a
 * clinician. Falls back to `month + 3` when the file has no explicit threshold,
 * so the UI never invents a number for an entry the file does not cover.
 */
export function redFlagMonth(item: MilestoneItem, file: MilestoneFile): number {
  return file.red_flags_redFlagIfNotBy[item.id] ?? item.month + 3
}

/**
 * Status of one milestone for a baby of `ageMonths`:
 * a recorded achievement always wins, then a passed threshold is a red flag.
 */
export function milestoneStatus(
  item: MilestoneItem,
  check: MilestoneCheckRef | undefined,
  ageMonths: number,
  file: MilestoneFile,
): MilestoneStatus {
  if (check?.achievedAt !== undefined) return 'achieved'
  if (ageMonths >= redFlagMonth(item, file)) return 'red_flag'
  return 'not_yet'
}

/**
 * Done/total overall and per domain. Only checks carrying an `achievedAt`
 * count as done; ids that are not in `items` are ignored.
 */
export function summarizeChecks(
  items: readonly MilestoneItem[],
  checks: readonly MilestoneCheckRef[],
): MilestoneSummary {
  const achievedIds = new Set<string>()
  for (const check of checks) {
    if (check.achievedAt !== undefined) achievedIds.add(check.milestoneId)
  }

  let done = 0
  const byDomain: Record<string, DomainProgress> = {}

  for (const item of items) {
    const isDone = achievedIds.has(item.id)
    if (isDone) done += 1

    const bucket = byDomain[item.domain] ?? { done: 0, total: 0 }
    bucket.total += 1
    if (isDone) bucket.done += 1
    byDomain[item.domain] = bucket
  }

  return { done, total: items.length, byDomain }
}

/** Copy of `items` ordered by month, then domain, then id (stable output). */
export function sortByMonthThenDomain(items: readonly MilestoneItem[]): MilestoneItem[] {
  return [...items].sort(
    (a, b) =>
      a.month - b.month ||
      a.domain.localeCompare(b.domain) ||
      a.id.localeCompare(b.id),
  )
}

/** "dd/MM/yyyy" in the device timezone; malformed input is returned as-is. */
export function formatDdMmYyyy(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`
}
