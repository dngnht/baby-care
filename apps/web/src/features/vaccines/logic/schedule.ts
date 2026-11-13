/**
 * Pure vaccination-schedule logic (T023).
 *
 * Every medical milestone comes from `knowledge/vaccines/vn_schedule.json` —
 * nothing is hard-coded here (AGENTS rule 2). Whether the UI shows the
 * "Đang chờ xác minh" badge is driven by the file's own `verified` flags.
 */
import scheduleJson from '../../../../../../knowledge/vaccines/vn_schedule.json'
import { MS_PER_DAY, addDays, startOfDay, toDayKey } from '../../../core/time/day'

/** One row of `tcmr` in the knowledge file. */
export interface ScheduleEntry {
  code: string
  /** Omitted when the dose repeats the previous dose's name (dose 2, 3, ...). */
  name?: string
  dose: number
  ageDays?: number
  ageMonths?: number
  ageYears?: number
  /** Latest age allowed for this dose (window end), in the file's own units. */
  maxAgeHours?: number
  maxAgeDays?: number
  maxAgeMonths?: number
  /** Minimum gap to the previous dose of the same code. */
  minIntervalMonths?: number
  /** Offset from the previous dose of the same `code` (e.g. JE dose 3). */
  afterPrevDays?: number
  /** Lower bound of a "N–M days after previous dose" window (JE dose 2). */
  afterPrevDaysMin?: number
  afterPrevDaysMax?: number
  /** Human-readable timing hint copied verbatim from the file. */
  window?: string
  note?: string
  rolloutNote?: string
}

/** Doses the app does not schedule because they are past 24 months. */
export interface OutOfRangeEntry {
  code: string
  name: string
  ageYears?: number
  ageMonths?: number
  note?: string
}

/** Name entry inside `optional_service.items`. */
export interface VaccineInfoEntry {
  code: string
  name: string
  note?: string
}

export interface OptionalServiceSection {
  verified: boolean
  note?: string
  items: readonly VaccineInfoEntry[]
}

export interface VaccineScheduleFile {
  version: string
  verified: boolean
  verified_scope?: string
  legal_basis?: string
  note?: string
  rule_note?: string
  sources?: readonly string[]
  tcmr: readonly ScheduleEntry[]
  /** Doses outside the 0–24 month app range (e.g. Td at 7 years). */
  out_of_app_range?: readonly OutOfRangeEntry[]
  /** Service (non-TCMR) vaccines: listed only, never auto-dated. */
  optional_service?: OptionalServiceSection
}

export type DoseSource = 'tcmr' | 'service'

/** A dose placed on the calendar for one baby. */
export interface PlannedDose {
  code: string
  name: string
  doseNo: number
  dueDate: Date
  /** Latest date the dose is still valid, when the file defines a window. */
  latestDate?: Date
  window?: string
  note?: string
  source: DoseSource
}

/** The subset of a stored `VaccineDose` the schedule needs. */
export interface StoredDoseRef {
  id: string
  vaccineCode: string
  doseNo: number
  /** ISO 8601 UTC */
  dueDate: string
  /** ISO 8601 UTC */
  givenDate?: string
}

export interface ScheduleMerge {
  toCreate: PlannedDose[]
  toUpdate: { id: string; dueDate: Date }[]
}

export type DoseStatusKind = 'given' | 'overdue' | 'today' | 'upcoming'

export interface DoseStatus {
  kind: DoseStatusKind
  /** Whole days late; `0` unless `kind === 'overdue'`. */
  daysOverdue: number
}

/** The bundled schedule, parsed by Vite from the knowledge folder. */
export const VN_SCHEDULE: VaccineScheduleFile = scheduleJson

/** Stable key shared by planned doses, stored doses and calendar UIDs. */
export const doseKey = (code: string, doseNo: number): string => `${code}#${doseNo}`

/** Whole local days from `from` to `to`; positive when `to` is later. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / MS_PER_DAY)
}

/**
 * Add calendar months, clamping to the last day of the target month.
 *
 * `31/01 + 1 month` is `28/02` (or `29/02` in a leap year), never `03/03`:
 * `new Date(year, month, day)` would otherwise roll the overflow forward.
 */
export function addCalendarMonths(date: Date, months: number): Date {
  const base = startOfDay(date)
  const year = base.getFullYear()
  const month = base.getMonth() + months
  const lastDayOfTarget = new Date(year, month + 1, 0).getDate()
  return new Date(year, month, Math.min(base.getDate(), lastDayOfTarget))
}

/**
 * Turn the knowledge file into dated doses for one baby.
 *
 * Only `tcmr` entries are dated: `optional_service` has no age anchors in the
 * file, so inventing dates for it is deliberately out of scope.
 */
export function generateSchedule(birthDate: Date, file: VaccineScheduleFile): PlannedDose[] {
  const birth = startOfDay(birthDate)
  const dueByDose = new Map<string, Map<number, Date>>()
  const knownNames = new Map<string, string>()
  const planned: PlannedDose[] = []

  for (const entry of file.tcmr) {
    if (entry.name !== undefined) knownNames.set(entry.code, entry.name)
    const name = entry.name ?? knownNames.get(entry.code) ?? entry.code
    const dueDate = resolveDueDate(entry, birth, dueByDose)

    let perCode = dueByDose.get(entry.code)
    if (perCode === undefined) {
      perCode = new Map<number, Date>()
      dueByDose.set(entry.code, perCode)
    }
    perCode.set(entry.dose, dueDate)

    const dose: PlannedDose = {
      code: entry.code,
      name,
      doseNo: entry.dose,
      dueDate,
      source: 'tcmr',
    }
    if (entry.window !== undefined) dose.window = entry.window
    if (entry.note !== undefined) dose.note = entry.note
    if (entry.rolloutNote !== undefined) dose.note = entry.rolloutNote
    const latest = resolveLatestDate(entry, birth)
    if (latest !== undefined) dose.latestDate = latest
    planned.push(dose)
  }

  planned.sort(
    (a, b) =>
      a.dueDate.getTime() - b.dueDate.getTime() ||
      a.code.localeCompare(b.code) ||
      a.doseNo - b.doseNo,
  )
  return planned
}

/**
 * Date for one entry. `afterPrevDays` wins over an age anchor: JE dose 2 is
 * defined as "14 days after dose 1", not as a second birthday milestone.
 */
function resolveDueDate(
  entry: ScheduleEntry,
  birth: Date,
  dueByDose: ReadonlyMap<string, ReadonlyMap<number, Date>>,
): Date {
  const offset = entry.afterPrevDays ?? entry.afterPrevDaysMin
  if (offset !== undefined) {
    const previous = previousDueDate(dueByDose.get(entry.code), entry.dose)
    if (previous === undefined) {
      // Refuse to invent a date: the file is malformed.
      throw new Error(
        `Schedule entry ${entry.code} dose ${entry.dose} needs a previous dose for afterPrevDays`,
      )
    }
    return addDays(previous, offset)
  }
  if (entry.ageMonths !== undefined) return addCalendarMonths(birth, entry.ageMonths)
  if (entry.ageYears !== undefined) return addCalendarMonths(birth, entry.ageYears * 12)
  if (entry.ageDays !== undefined) return addDays(birth, entry.ageDays)
  throw new Error(`Schedule entry ${entry.code} dose ${entry.dose} has no age anchor`)
}

/** End of the valid window ("must be done before ..."), when the file has one. */
function resolveLatestDate(entry: ScheduleEntry, birth: Date): Date | undefined {
  if (entry.maxAgeMonths !== undefined) {
    const base = addCalendarMonths(birth, entry.maxAgeMonths)
    return new Date(base.getTime() + MS_PER_DAY - 1)
  }
  if (entry.maxAgeDays !== undefined) return new Date(addDays(birth, entry.maxAgeDays).getTime() + MS_PER_DAY - 1)
  if (entry.maxAgeHours !== undefined) return new Date(addDays(birth, 0).getTime() + entry.maxAgeHours * 3_600_000)
  return undefined
}

/** Due date of the highest dose number below `doseNo` for the same code. */
function previousDueDate(
  doses: ReadonlyMap<number, Date> | undefined,
  doseNo: number,
): Date | undefined {
  if (doses === undefined) return undefined
  let best: Date | undefined
  let bestDoseNo = Number.NEGATIVE_INFINITY
  for (const [no, dueDate] of doses) {
    if (no < doseNo && no > bestDoseNo) {
      bestDoseNo = no
      best = dueDate
    }
  }
  return best
}

/**
 * Reconcile the planned schedule with what is already stored.
 *
 * Matching is by `code` + `doseNo`; an existing row keeps its `givenDate`,
 * `lot` and `place` (the update only ever carries a new `dueDate`). Dates are
 * compared by local day, so a stored timestamp at a different time of day on
 * the same day is not rewritten.
 */
export function mergeWithStored(
  planned: readonly PlannedDose[],
  stored: readonly StoredDoseRef[],
): ScheduleMerge {
  const byKey = new Map<string, StoredDoseRef>()
  for (const dose of stored) byKey.set(doseKey(dose.vaccineCode, dose.doseNo), dose)

  const toCreate: PlannedDose[] = []
  const toUpdate: { id: string; dueDate: Date }[] = []

  for (const dose of planned) {
    const existing = byKey.get(doseKey(dose.code, dose.doseNo))
    if (existing === undefined) {
      toCreate.push(dose)
      continue
    }
    if (toDayKey(new Date(existing.dueDate)) !== toDayKey(dose.dueDate)) {
      toUpdate.push({ id: existing.id, dueDate: dose.dueDate })
    }
  }

  return { toCreate, toUpdate }
}

/**
 * Status of one dose: a recorded `givenDate` always wins, otherwise it is
 * compared to `now` at local-day granularity.
 */
export function doseStatus(
  dose: { dueDate: Date },
  stored: { givenDate?: string } | undefined,
  now: Date,
): DoseStatus {
  if (stored?.givenDate !== undefined) return { kind: 'given', daysOverdue: 0 }

  const lateDays = daysBetween(dose.dueDate, now)
  if (lateDays > 0) return { kind: 'overdue', daysOverdue: lateDays }
  if (lateDays === 0) return { kind: 'today', daysOverdue: 0 }
  return { kind: 'upcoming', daysOverdue: 0 }
}
