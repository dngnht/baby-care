// Dexie schema for the local-first BéYêu database.
// All timestamps are persisted as ISO 8601 UTC strings (`Date#toISOString`).
// Inputs accept `Date`; repository outputs always return the stored string form.
import Dexie, { type Table } from 'dexie'

export type Sex = 'M' | 'F'

export type LogType =
  | 'feed_breast'
  | 'feed_bottle'
  | 'solid'
  | 'diaper'
  | 'sleep'
  | 'temp'
  | 'med'
  | 'symptom'
  | 'note'

/** Free-form, feature-owned details for a log entry (ml, side, color, ...). */
export type LogPayload = Record<string, unknown>

// ---------------------------------------------------------------------------
// Persisted records (read model)
// ---------------------------------------------------------------------------

export interface Baby {
  id: string
  name: string
  sex: Sex
  /** ISO 8601 UTC */
  birthDate: string
  gestationalWeeks: number
  /** Optional: unknown at onboarding, filled by the first measurement (T020). */
  birthWeightG?: number
  birthLengthCm?: number
}

export interface LogEntry {
  id: string
  babyId: string
  type: LogType
  /** ISO 8601 UTC */
  startAt: string
  /** ISO 8601 UTC */
  endAt?: string
  payload: LogPayload
  createdBy: string
}

export interface Measurement {
  id: string
  babyId: string
  /** ISO 8601 UTC */
  date: string
  weightG?: number
  lengthCm?: number
  headCm?: number
}

export interface VaccineDose {
  id: string
  babyId: string
  vaccineCode: string
  doseNo: number
  /** ISO 8601 UTC */
  dueDate: string
  /** ISO 8601 UTC */
  givenDate?: string
  lot?: string
  place?: string
}

export interface MilestoneCheck {
  babyId: string
  milestoneId: string
  /** ISO 8601 UTC */
  achievedAt?: string
}

export type ReminderRepeat = 'none' | 'daily' | 'weekly'

export interface Reminder {
  id: string
  babyId: string
  title: string
  /** ISO 8601 UTC - next occurrence to notify about. */
  at: string
  repeat: ReminderRepeat
  note?: string
  /** ISO 8601 UTC - set when the parent marks the reminder done. */
  doneAt?: string
  /** ISO 8601 UTC */
  createdAt: string
}

// ---------------------------------------------------------------------------
// Write models (input) - dates are accepted as `Date`
// ---------------------------------------------------------------------------

export interface NewBaby {
  name: string
  sex: Sex
  birthDate: Date
  gestationalWeeks: number
  birthWeightG?: number
  birthLengthCm?: number
}

export interface NewLogEntry {
  babyId: string
  type: LogType
  startAt: Date
  endAt?: Date
  payload: LogPayload
  createdBy: string
}

export type LogPatch = Partial<Pick<NewLogEntry, 'type' | 'startAt' | 'endAt' | 'payload' | 'createdBy'>>

export interface NewMeasurement {
  babyId: string
  date: Date
  weightG?: number
  lengthCm?: number
  headCm?: number
}

export interface NewVaccineDose {
  babyId: string
  vaccineCode: string
  doseNo: number
  dueDate: Date
  givenDate?: Date
  lot?: string
  place?: string
}

export interface VaccineDosePatch {
  vaccineCode?: string
  doseNo?: number
  dueDate?: Date
  givenDate?: Date
  lot?: string
  place?: string
}

export interface NewMilestoneCheck {
  babyId: string
  milestoneId: string
  achievedAt?: Date
}

export interface NewReminder {
  babyId: string
  title: string
  at: Date
  repeat?: ReminderRepeat
  note?: string
}

export interface ReminderPatch {
  title?: string
  at?: Date
  repeat?: ReminderRepeat
  note?: string
  doneAt?: Date
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

export const DEFAULT_DB_NAME = 'beyeu'

export class BeyeuDatabase extends Dexie {
  babies!: Table<Baby, string>
  logs!: Table<LogEntry, string>
  measurements!: Table<Measurement, string>
  vaccineDoses!: Table<VaccineDose, string>
  milestoneChecks!: Table<MilestoneCheck, [string, string]>
  reminders!: Table<Reminder, string>

  constructor(name: string = DEFAULT_DB_NAME) {
    super(name)

    // Primary keys must come first. Compound indexes power the hot queries:
    // logs by baby + time range, measurements by baby + date.
    this.version(1).stores({
      babies: 'id, birthDate',
      logs: 'id, babyId, startAt, [babyId+startAt]',
      measurements: 'id, babyId, date, [babyId+date]',
      vaccineDoses: 'id, babyId, dueDate, [babyId+dueDate]',
      milestoneChecks: '[babyId+milestoneId], babyId, milestoneId',
    })

    // v2 (M4/T041): parent-defined reminders. Additive, so existing rows are
    // untouched when the upgrade runs.
    this.version(2).stores({
      reminders: 'id, babyId, at, [babyId+at]',
    })
  }
}
