// Repository layer for the local-first BéYêu database.
//
// - Every write converts `Date` inputs to ISO 8601 UTC strings.
// - Every read returns the persisted ISO strings unchanged.
// - `createRepo(dbName)` builds an isolated repository, which keeps tests
//   independent from each other and from the default `beyeu` database.
import {
  BeyeuDatabase,
  DEFAULT_DB_NAME,
  type Baby,
  type LogEntry,
  type LogPatch,
  type Measurement,
  type MilestoneCheck,
  type NewBaby,
  type NewLogEntry,
  type NewMeasurement,
  type NewMilestoneCheck,
  type NewReminder,
  type NewVaccineDose,
  type Reminder,
  type ReminderPatch,
  type VaccineDose,
  type VaccineDosePatch,
} from './schema'

/** Generate a UUID v4 primary key. */
const newId = (): string => crypto.randomUUID()

/** Convert a `Date` to the ISO 8601 UTC form stored in IndexedDB. */
function toIso(value: Date, field: string): string {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError(`${field} must be a valid Date`)
  }
  return value.toISOString()
}

function toOptionalIso(value: Date | undefined, field: string): string | undefined {
  return value === undefined ? undefined : toIso(value, field)
}

function assertId(value: string, field: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${field} is required`)
  }
}

export interface Repo {
  readonly db: BeyeuDatabase

  // Babies
  createBaby(input: NewBaby): Promise<Baby>
  getBaby(id: string): Promise<Baby | undefined>
  listBabies(): Promise<Baby[]>

  // Logs
  addLog(input: NewLogEntry): Promise<LogEntry>
  updateLog(id: string, patch: LogPatch): Promise<LogEntry>
  /** Inclusive [from, to] range, newest first. */
  listLogs(babyId: string, from: Date, to: Date): Promise<LogEntry[]>
  deleteLog(id: string): Promise<void>

  // Measurements
  addMeasurement(input: NewMeasurement): Promise<Measurement>
  /** Optional inclusive [from, to] range, oldest first (chart order). */
  listMeasurements(babyId: string, from?: Date, to?: Date): Promise<Measurement[]>

  // Vaccine doses
  addVaccineDose(input: NewVaccineDose): Promise<VaccineDose>
  /** Ordered by due date, oldest first. */
  listVaccineDoses(babyId: string): Promise<VaccineDose[]>
  updateVaccineDose(id: string, patch: VaccineDosePatch): Promise<VaccineDose>

  // Milestone checks
  setMilestoneCheck(input: NewMilestoneCheck): Promise<MilestoneCheck>
  listMilestoneChecks(babyId: string): Promise<MilestoneCheck[]>
  clearMilestoneCheck(babyId: string, milestoneId: string): Promise<void>

  // Reminders
  addReminder(input: NewReminder): Promise<Reminder>
  updateReminder(id: string, patch: ReminderPatch): Promise<Reminder>
  deleteReminder(id: string): Promise<void>
  /** Ordered by `at`, soonest first. */
  listReminders(babyId: string): Promise<Reminder[]>

  // Lifecycle
  close(): void
  /** Close and remove the underlying IndexedDB database (useful in tests). */
  destroy(): Promise<void>
}

/**
 * Build a repository bound to a specific IndexedDB database name.
 * Pass a unique name (e.g. per test) to get a fully isolated database.
 */
export function createRepo(dbName: string = DEFAULT_DB_NAME): Repo {
  const db = new BeyeuDatabase(dbName)

  return {
    db,

    async createBaby(input) {
      const baby: Baby = {
        id: newId(),
        name: input.name,
        sex: input.sex,
        birthDate: toIso(input.birthDate, 'birthDate'),
        gestationalWeeks: input.gestationalWeeks,
      }
      if (input.birthWeightG !== undefined) baby.birthWeightG = input.birthWeightG
      if (input.birthLengthCm !== undefined) baby.birthLengthCm = input.birthLengthCm
      await db.babies.add(baby)
      return baby
    },

    getBaby(id) {
      return db.babies.get(id)
    },

    listBabies() {
      return db.babies.toArray()
    },

    async addLog(input) {
      assertId(input.babyId, 'babyId')
      const entry: LogEntry = {
        id: newId(),
        babyId: input.babyId,
        type: input.type,
        startAt: toIso(input.startAt, 'startAt'),
        payload: input.payload,
        createdBy: input.createdBy,
      }
      const endAt = toOptionalIso(input.endAt, 'endAt')
      if (endAt !== undefined) entry.endAt = endAt
      await db.logs.add(entry)
      return entry
    },

    async updateLog(id, patch) {
      assertId(id, 'id')
      const existing = await db.logs.get(id)
      if (existing === undefined) throw new Error(`LogEntry ${id} not found`)

      const next: LogEntry = { ...existing }
      if (patch.type !== undefined) next.type = patch.type
      if (patch.payload !== undefined) next.payload = patch.payload
      if (patch.createdBy !== undefined) next.createdBy = patch.createdBy
      if (patch.startAt !== undefined) next.startAt = toIso(patch.startAt, 'startAt')
      if (patch.endAt !== undefined) next.endAt = toIso(patch.endAt, 'endAt')

      await db.logs.put(next)
      return next
    },

    async listLogs(babyId, from, to) {
      assertId(babyId, 'babyId')
      const fromIso = toIso(from, 'from')
      const toIsoValue = toIso(to, 'to')
      if (from.getTime() > to.getTime()) return []

      // Compound index keeps the range scan inside one baby partition;
      // `reverse()` yields the newest entry first.
      return db.logs
        .where('[babyId+startAt]')
        .between([babyId, fromIso], [babyId, toIsoValue], true, true)
        .reverse()
        .toArray()
    },

    async deleteLog(id) {
      assertId(id, 'id')
      await db.logs.delete(id)
    },

    async addMeasurement(input) {
      assertId(input.babyId, 'babyId')
      const measurement: Measurement = {
        id: newId(),
        babyId: input.babyId,
        date: toIso(input.date, 'date'),
      }
      if (input.weightG !== undefined) measurement.weightG = input.weightG
      if (input.lengthCm !== undefined) measurement.lengthCm = input.lengthCm
      if (input.headCm !== undefined) measurement.headCm = input.headCm
      await db.measurements.add(measurement)
      return measurement
    },

    async listMeasurements(babyId, from, to) {
      assertId(babyId, 'babyId')
      if (from === undefined && to === undefined) {
        return db.measurements.where('babyId').equals(babyId).sortBy('date')
      }

      const fromIso = from === undefined ? '' : toIso(from, 'from')
      const toIsoValue = to === undefined ? '\uffff' : toIso(to, 'to')
      if (from !== undefined && to !== undefined && from.getTime() > to.getTime()) return []

      return db.measurements
        .where('[babyId+date]')
        .between([babyId, fromIso], [babyId, toIsoValue], true, true)
        .toArray()
    },

    async addVaccineDose(input) {
      assertId(input.babyId, 'babyId')
      const dose: VaccineDose = {
        id: newId(),
        babyId: input.babyId,
        vaccineCode: input.vaccineCode,
        doseNo: input.doseNo,
        dueDate: toIso(input.dueDate, 'dueDate'),
      }
      const givenDate = toOptionalIso(input.givenDate, 'givenDate')
      if (givenDate !== undefined) dose.givenDate = givenDate
      if (input.lot !== undefined) dose.lot = input.lot
      if (input.place !== undefined) dose.place = input.place
      await db.vaccineDoses.add(dose)
      return dose
    },

    listVaccineDoses(babyId) {
      assertId(babyId, 'babyId')
      return db.vaccineDoses.where('babyId').equals(babyId).sortBy('dueDate')
    },

    async updateVaccineDose(id, patch) {
      assertId(id, 'id')
      const existing = await db.vaccineDoses.get(id)
      if (existing === undefined) throw new Error(`VaccineDose ${id} not found`)

      const next: VaccineDose = { ...existing }
      if (patch.vaccineCode !== undefined) next.vaccineCode = patch.vaccineCode
      if (patch.doseNo !== undefined) next.doseNo = patch.doseNo
      if (patch.dueDate !== undefined) next.dueDate = toIso(patch.dueDate, 'dueDate')
      if (patch.givenDate !== undefined) next.givenDate = toIso(patch.givenDate, 'givenDate')
      if (patch.lot !== undefined) next.lot = patch.lot
      if (patch.place !== undefined) next.place = patch.place

      await db.vaccineDoses.put(next)
      return next
    },

    async setMilestoneCheck(input) {
      assertId(input.babyId, 'babyId')
      assertId(input.milestoneId, 'milestoneId')
      const achievedAt = toOptionalIso(input.achievedAt, 'achievedAt')
      const check: MilestoneCheck =
        achievedAt === undefined
          ? { babyId: input.babyId, milestoneId: input.milestoneId }
          : { babyId: input.babyId, milestoneId: input.milestoneId, achievedAt }
      await db.milestoneChecks.put(check)
      return check
    },

    listMilestoneChecks(babyId) {
      assertId(babyId, 'babyId')
      return db.milestoneChecks.where('babyId').equals(babyId).toArray()
    },

    async clearMilestoneCheck(babyId, milestoneId) {
      assertId(babyId, 'babyId')
      assertId(milestoneId, 'milestoneId')
      await db.milestoneChecks.delete([babyId, milestoneId])
    },

    async addReminder(input) {
      assertId(input.babyId, 'babyId')
      const reminder: Reminder = {
        id: newId(),
        babyId: input.babyId,
        title: input.title.trim(),
        at: toIso(input.at, 'at'),
        repeat: input.repeat ?? 'none',
        createdAt: new Date().toISOString(),
      }
      if (reminder.title.length === 0) throw new TypeError('title is required')
      if (input.note !== undefined) reminder.note = input.note
      await db.reminders.add(reminder)
      return reminder
    },

    async updateReminder(id, patch) {
      assertId(id, 'id')
      const existing = await db.reminders.get(id)
      if (existing === undefined) throw new TypeError(`reminder ${id} not found`)

      const next: Reminder = { ...existing }
      if (patch.title !== undefined) {
        const title = patch.title.trim()
        if (title.length === 0) throw new TypeError('title is required')
        next.title = title
      }
      if (patch.at !== undefined) next.at = toIso(patch.at, 'at')
      if (patch.repeat !== undefined) next.repeat = patch.repeat
      if (patch.note !== undefined) next.note = patch.note
      if (patch.doneAt !== undefined) next.doneAt = toIso(patch.doneAt, 'doneAt')

      await db.reminders.put(next)
      return next
    },

    async deleteReminder(id) {
      assertId(id, 'id')
      await db.reminders.delete(id)
    },

    async listReminders(babyId) {
      assertId(babyId, 'babyId')
      const rows = await db.reminders.where('babyId').equals(babyId).toArray()
      return rows.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
    },

    close() {
      db.close()
    },

    async destroy() {
      db.close()
      await db.delete()
    },
  }
}

// ---------------------------------------------------------------------------
// Default repository bound to the app database (`beyeu`)
// ---------------------------------------------------------------------------

let defaultRepo: Repo | undefined

function getDefaultRepo(): Repo {
  defaultRepo ??= createRepo()
  return defaultRepo
}

/** Shared repository bound to the app database; use in app code, not tests. */
export function getRepo(): Repo {
  return getDefaultRepo()
}

export function createBaby(input: NewBaby): Promise<Baby> {
  return getDefaultRepo().createBaby(input)
}

export function addLog(input: NewLogEntry): Promise<LogEntry> {
  return getDefaultRepo().addLog(input)
}

export function listLogs(babyId: string, from: Date, to: Date): Promise<LogEntry[]> {
  return getDefaultRepo().listLogs(babyId, from, to)
}

export function deleteLog(id: string): Promise<void> {
  return getDefaultRepo().deleteLog(id)
}

export function addMeasurement(input: NewMeasurement): Promise<Measurement> {
  return getDefaultRepo().addMeasurement(input)
}
