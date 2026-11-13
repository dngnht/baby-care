// Backup / restore of the whole local-first database as a single JSON file.
//
// Why: IndexedDB is the only copy of the baby's health data (local-first) and
// the browser may evict it. The user can export a file and import it on a new
// device / after a cache wipe.
//
// SECURITY TODO (M4 / T045): the backup is PLAINTEXT. It contains the baby's
// name, birth date and health measurements - sensitive personal data. Until
// key management exists (passphrase-derived key + AES-GCM via WebCrypto), the
// file must not be uploaded anywhere automatically, and the UI must warn the
// user to store it safely. Encryption of this format belongs to T045; bumping
// `BACKUP_FORMAT_VERSION` will let `parseBackup` keep reading old files.
import {
  BeyeuDatabase,
  DEFAULT_DB_NAME,
  type Baby,
  type LogEntry,
  type LogType,
  type Measurement,
  type MilestoneCheck,
  type Reminder,
  type VaccineDose,
} from './schema'
import { downloadFile } from '../platform/share'

/** Version of the on-disk backup format (not the Dexie schema version). */
export const BACKUP_FORMAT_VERSION = 2

/** v1 files (five tables) are still accepted; `reminders` defaults to []. */
export const BACKUP_COMPATIBLE_VERSIONS: readonly number[] = [1, 2]

/** Value written to `BackupFile.app`; guards against importing random JSON. */
export const BACKUP_APP_ID = 'beyeu'

/** Table names, in a stable order used by counts and the import transaction. */
export const BACKUP_TABLES = [
  'babies',
  'logs',
  'measurements',
  'vaccineDoses',
  'milestoneChecks',
  'reminders',
] as const

export type BackupTableName = (typeof BACKUP_TABLES)[number]

/** Every table, each exported as a plain array of records. */
export interface BackupTables {
  babies: Baby[]
  logs: LogEntry[]
  measurements: Measurement[]
  vaccineDoses: VaccineDose[]
  milestoneChecks: MilestoneCheck[]
  reminders: Reminder[]
}

/** Row count per table, so a file can be sanity-checked without parsing rows. */
export type BackupCounts = Record<BackupTableName, number>

/** A complete, validated backup. Always a plain object (never a JSON string). */
export interface BackupFile {
  formatVersion: typeof BACKUP_FORMAT_VERSION
  app: typeof BACKUP_APP_ID
  /** ISO 8601 UTC timestamp of the export. */
  exportedAt: string
  /** Dexie schema version the export was produced from. */
  dbVersion: number
  counts: BackupCounts
  tables: BackupTables
}

export type ImportMode = 'merge' | 'replace'

export interface ImportOptions {
  /**
   * `replace` wipes the five tables first (true restore).
   * `merge` upserts by primary key and keeps everything else.
   */
  mode: ImportMode
  /** Target database; defaults to the app database (`beyeu`). */
  db?: BeyeuDatabase
}

export interface ImportSummary {
  mode: ImportMode
  imported: BackupCounts
  /**
   * Records dropped because the backup itself contained duplicate primary
   * keys (last occurrence wins). Duplicates already in the database are
   * overwritten, not skipped.
   */
  skipped: number
}

/** Thrown when a file is not a valid BéYêu backup. Messages are diagnostic. */
export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackupValidationError'
  }
}

// ---------------------------------------------------------------------------
// Database handle
// ---------------------------------------------------------------------------

let defaultDb: BeyeuDatabase | undefined

function resolveDb(db: BeyeuDatabase | undefined): BeyeuDatabase {
  if (db !== undefined) return db
  defaultDb ??= new BeyeuDatabase(DEFAULT_DB_NAME)
  return defaultDb
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function compareStrings(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

function compareBy<T>(...keys: Array<(row: T) => string>): (a: T, b: T) => number {
  return (a, b) => {
    for (const key of keys) {
      const result = compareStrings(key(a), key(b))
      if (result !== 0) return result
    }
    return 0
  }
}

// Stable ordering keeps two exports of the same data byte-identical, which
// makes the files diffable and easy to review before sharing.
const compareLogs = compareBy<LogEntry>((row) => row.startAt, (row) => row.id)
const compareMeasurements = compareBy<Measurement>((row) => row.date, (row) => row.id)
const compareVaccineDoses = compareBy<VaccineDose>((row) => row.dueDate, (row) => row.id)
const compareMilestoneChecks = compareBy<MilestoneCheck>(
  (row) => row.babyId,
  (row) => row.milestoneId,
)

function countTables(tables: BackupTables): BackupCounts {
  return {
    babies: tables.babies.length,
    logs: tables.logs.length,
    measurements: tables.measurements.length,
    vaccineDoses: tables.vaccineDoses.length,
    milestoneChecks: tables.milestoneChecks.length,
    reminders: tables.reminders.length,
  }
}

/**
 * Read every table into a plain, stably sorted object.
 * Pass an isolated `BeyeuDatabase` in tests; defaults to the `beyeu` database.
 */
export async function exportBackup(db?: BeyeuDatabase): Promise<BackupFile> {
  const database = resolveDb(db)

  const [babies, logs, measurements, vaccineDoses, milestoneChecks, reminders] = await Promise.all([
    database.babies.toArray(),
    database.logs.toArray(),
    database.measurements.toArray(),
    database.vaccineDoses.toArray(),
    database.milestoneChecks.toArray(),
    database.reminders.toArray(),
  ])

  const tables: BackupTables = {
    babies: [...babies].sort(compareBy<Baby>((row) => row.id)),
    logs: [...logs].sort(compareLogs),
    measurements: [...measurements].sort(compareMeasurements),
    vaccineDoses: [...vaccineDoses].sort(compareVaccineDoses),
    milestoneChecks: [...milestoneChecks].sort(compareMilestoneChecks),
    reminders: [...reminders].sort(compareBy<Reminder>((row) => row.at, (row) => row.id)),
  }

  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    app: BACKUP_APP_ID,
    exportedAt: new Date().toISOString(),
    dbVersion: database.verno,
    counts: countTables(tables),
    tables,
  }
}

/** Pretty-print a backup for a human-readable, diffable `.json` file. */
export function serializeBackup(file: BackupFile): string {
  return JSON.stringify(file, null, 2)
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new BackupValidationError(`${path} must be an object`)
  return value
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new BackupValidationError(`${path} must be an array`)
  return value
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new BackupValidationError(`${path} must be a non-empty string`)
  }
  return value
}

function requireNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BackupValidationError(`${path} must be a finite number`)
  }
  return value
}

const ISO_DATE_PART = /^\d{4}-\d{2}-\d{2}$/
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/

function requireIsoDate(value: unknown, path: string): string {
  const text = requireString(value, path)
  const [datePart] = text.split('T')

  if (datePart === undefined || !ISO_DATE_PART.test(datePart)) {
    throw new BackupValidationError(`${path} must be an ISO 8601 date or timestamp`)
  }
  if (text.includes('T') && !ISO_TIMESTAMP.test(text)) {
    throw new BackupValidationError(`${path} must be an ISO 8601 date or timestamp`)
  }

  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) {
    throw new BackupValidationError(`${path} is not a valid date`)
  }

  // `Date.parse` silently rolls over invalid calendar dates (2026-02-30 ->
  // 2026-03-02); round-trip the date part to reject them.
  const roundTrip = new Date(`${datePart}T00:00:00.000Z`)
  if (Number.isNaN(roundTrip.getTime()) || roundTrip.toISOString().slice(0, 10) !== datePart) {
    throw new BackupValidationError(`${path} is not a valid calendar date`)
  }

  return text
}

function optionalIsoDate(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : requireIsoDate(value, path)
}

function optionalNumber(value: unknown, path: string): number | undefined {
  return value === undefined ? undefined : requireNumber(value, path)
}

function optionalString(value: unknown, path: string): string | undefined {
  return value === undefined ? undefined : requireString(value, path)
}

const LOG_TYPES: ReadonlySet<string> = new Set<LogType>([
  'feed_breast',
  'feed_bottle',
  'solid',
  'diaper',
  'sleep',
  'temp',
  'med',
  'symptom',
  'note',
])

function parseBaby(value: unknown, path: string): Baby {
  const record = requireRecord(value, path)
  const sex = requireString(record.sex, `${path}.sex`)
  if (sex !== 'M' && sex !== 'F') {
    throw new BackupValidationError(`${path}.sex must be "M" or "F"`)
  }

  const baby: Baby = {
    id: requireString(record.id, `${path}.id`),
    name: requireString(record.name, `${path}.name`),
    sex,
    birthDate: requireIsoDate(record.birthDate, `${path}.birthDate`),
    gestationalWeeks: requireNumber(record.gestationalWeeks, `${path}.gestationalWeeks`),
  }

  // Optional since T010: onboarding only asks for 4 fields.
  const birthWeightG = optionalNumber(record.birthWeightG, `${path}.birthWeightG`)
  const birthLengthCm = optionalNumber(record.birthLengthCm, `${path}.birthLengthCm`)
  if (birthWeightG !== undefined) baby.birthWeightG = birthWeightG
  if (birthLengthCm !== undefined) baby.birthLengthCm = birthLengthCm

  return baby
}

function parseLog(value: unknown, path: string): LogEntry {
  const record = requireRecord(value, path)

  const type = requireString(record.type, `${path}.type`)
  if (!LOG_TYPES.has(type)) throw new BackupValidationError(`${path}.type is not a known log type`)

  const entry: LogEntry = {
    id: requireString(record.id, `${path}.id`),
    babyId: requireString(record.babyId, `${path}.babyId`),
    type: type as LogType,
    startAt: requireIsoDate(record.startAt, `${path}.startAt`),
    payload: requireRecord(record.payload, `${path}.payload`),
    createdBy: requireString(record.createdBy, `${path}.createdBy`),
  }

  const endAt = optionalIsoDate(record.endAt, `${path}.endAt`)
  if (endAt !== undefined) entry.endAt = endAt

  return entry
}

function parseMeasurement(value: unknown, path: string): Measurement {
  const record = requireRecord(value, path)

  const measurement: Measurement = {
    id: requireString(record.id, `${path}.id`),
    babyId: requireString(record.babyId, `${path}.babyId`),
    date: requireIsoDate(record.date, `${path}.date`),
  }

  const weightG = optionalNumber(record.weightG, `${path}.weightG`)
  const lengthCm = optionalNumber(record.lengthCm, `${path}.lengthCm`)
  const headCm = optionalNumber(record.headCm, `${path}.headCm`)
  if (weightG !== undefined) measurement.weightG = weightG
  if (lengthCm !== undefined) measurement.lengthCm = lengthCm
  if (headCm !== undefined) measurement.headCm = headCm

  return measurement
}

function parseVaccineDose(value: unknown, path: string): VaccineDose {
  const record = requireRecord(value, path)

  const dose: VaccineDose = {
    id: requireString(record.id, `${path}.id`),
    babyId: requireString(record.babyId, `${path}.babyId`),
    vaccineCode: requireString(record.vaccineCode, `${path}.vaccineCode`),
    doseNo: requireNumber(record.doseNo, `${path}.doseNo`),
    dueDate: requireIsoDate(record.dueDate, `${path}.dueDate`),
  }

  const givenDate = optionalIsoDate(record.givenDate, `${path}.givenDate`)
  const lot = optionalString(record.lot, `${path}.lot`)
  const place = optionalString(record.place, `${path}.place`)
  if (givenDate !== undefined) dose.givenDate = givenDate
  if (lot !== undefined) dose.lot = lot
  if (place !== undefined) dose.place = place

  return dose
}

function parseReminder(value: unknown, path: string): Reminder {
  const record = requireRecord(value, path)
  const repeat = requireString(record.repeat, `${path}.repeat`)
  if (repeat !== 'none' && repeat !== 'daily' && repeat !== 'weekly') {
    throw new BackupValidationError(`${path}.repeat is not a known value`)
  }

  const reminder: Reminder = {
    id: requireString(record.id, `${path}.id`),
    babyId: requireString(record.babyId, `${path}.babyId`),
    title: requireString(record.title, `${path}.title`),
    at: requireIsoDate(record.at, `${path}.at`),
    repeat,
    createdAt: requireIsoDate(record.createdAt, `${path}.createdAt`),
  }

  const note = optionalString(record.note, `${path}.note`)
  const doneAt = optionalIsoDate(record.doneAt, `${path}.doneAt`)
  if (note !== undefined) reminder.note = note
  if (doneAt !== undefined) reminder.doneAt = doneAt

  return reminder
}

function parseMilestoneCheck(value: unknown, path: string): MilestoneCheck {
  const record = requireRecord(value, path)

  const check: MilestoneCheck = {
    babyId: requireString(record.babyId, `${path}.babyId`),
    milestoneId: requireString(record.milestoneId, `${path}.milestoneId`),
  }

  const achievedAt = optionalIsoDate(record.achievedAt, `${path}.achievedAt`)
  if (achievedAt !== undefined) check.achievedAt = achievedAt

  return check
}

function parseTables(value: unknown, version: number): BackupTables {
  const record = requireRecord(value, 'backup.tables')

  // Required up front so a missing table fails with a clear message instead of
  // silently restoring an incomplete database.
  const babies = requireArray(record.babies, 'backup.tables.babies')
  const logs = requireArray(record.logs, 'backup.tables.logs')
  const measurements = requireArray(record.measurements, 'backup.tables.measurements')
  const vaccineDoses = requireArray(record.vaccineDoses, 'backup.tables.vaccineDoses')
  const milestoneChecks = requireArray(record.milestoneChecks, 'backup.tables.milestoneChecks')
  // v1 backups predate reminders: treat the table as empty, not as an error.
  const reminders =
    version >= 2 ? requireArray(record.reminders, 'backup.tables.reminders') : []

  return {
    babies: babies.map((row, index) => parseBaby(row, `backup.tables.babies[${index}]`)),
    logs: logs.map((row, index) => parseLog(row, `backup.tables.logs[${index}]`)),
    measurements: measurements.map((row, index) =>
      parseMeasurement(row, `backup.tables.measurements[${index}]`),
    ),
    vaccineDoses: vaccineDoses.map((row, index) =>
      parseVaccineDose(row, `backup.tables.vaccineDoses[${index}]`),
    ),
    milestoneChecks: milestoneChecks.map((row, index) =>
      parseMilestoneCheck(row, `backup.tables.milestoneChecks[${index}]`),
    ),
    reminders: reminders.map((row, index) =>
      parseReminder(row, `backup.tables.reminders[${index}]`),
    ),
  }
}

/**
 * Validate an already-parsed value and return a normalised `BackupFile`.
 *
 * Strict on purpose: wrong `app`, unsupported `formatVersion`, missing tables,
 * missing keys and broken timestamps all throw `BackupValidationError`.
 * `counts` is recomputed from the rows so a tampered counter cannot mislead
 * the UI.
 */
function validateBackup(raw: unknown): BackupFile {
  const root = requireRecord(raw, 'backup')

  if (root.app !== BACKUP_APP_ID) {
    throw new BackupValidationError(`backup.app must be "${BACKUP_APP_ID}"`)
  }
  const version = requireNumber(root.formatVersion, 'backup.formatVersion')
  if (!BACKUP_COMPATIBLE_VERSIONS.includes(version)) {
    throw new BackupValidationError(
      `Unsupported backup.formatVersion: expected ${BACKUP_COMPATIBLE_VERSIONS.join(' or ')}, got ${String(root.formatVersion)}`,
    )
  }

  const exportedAt = requireIsoDate(root.exportedAt, 'backup.exportedAt')
  const dbVersion = requireNumber(root.dbVersion, 'backup.dbVersion')
  const tables = parseTables(root.tables, version)

  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    app: BACKUP_APP_ID,
    exportedAt,
    dbVersion,
    counts: countTables(tables),
    tables,
  }
}

/** Parse and validate a backup JSON string. Throws `BackupValidationError`. */
export function parseBackup(text: string): BackupFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new BackupValidationError('Backup is not valid JSON')
  }
  return validateBackup(raw)
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

interface DedupeResult<T> {
  rows: T[]
  skipped: number
}

/** Collapse duplicate primary keys within one backup (last occurrence wins). */
function dedupe<T>(rows: readonly T[], keyOf: (row: T) => string): DedupeResult<T> {
  const byKey = new Map<string, T>()
  for (const row of rows) byKey.set(keyOf(row), row)
  return { rows: [...byKey.values()], skipped: rows.length - byKey.size }
}

/**
 * Restore a backup.
 *
 * The whole restore runs in one Dexie read-write transaction over every
 * table, so a failure halfway leaves the database untouched.
 *
 * - `replace`: clears the tables, then writes the backup.
 * - `merge`: `bulkPut` (upsert) by primary key and keeps existing rows.
 */
export async function importBackup(
  input: string | BackupFile,
  options: ImportOptions,
): Promise<ImportSummary> {
  // Validating objects too keeps callers honest and strips unknown keys.
  const file = typeof input === 'string' ? parseBackup(input) : validateBackup(input)

  const { mode } = options
  if (mode !== 'merge' && mode !== 'replace') {
    throw new BackupValidationError(`Unsupported import mode: ${String(mode)}`)
  }

  const database = resolveDb(options.db)

  const babies = dedupe(file.tables.babies, (row) => row.id)
  const logs = dedupe(file.tables.logs, (row) => row.id)
  const measurements = dedupe(file.tables.measurements, (row) => row.id)
  const vaccineDoses = dedupe(file.tables.vaccineDoses, (row) => row.id)
  const milestoneChecks = dedupe(
    file.tables.milestoneChecks,
    (row) => `${row.babyId}\u0000${row.milestoneId}`,
  )
  const reminders = dedupe(file.tables.reminders, (row) => row.id)

  await database.transaction(
    'rw',
    [
      database.babies,
      database.logs,
      database.measurements,
      database.vaccineDoses,
      database.milestoneChecks,
      database.reminders,
    ],
    async () => {
      if (mode === 'replace') {
        await database.babies.clear()
        await database.logs.clear()
        await database.measurements.clear()
        await database.vaccineDoses.clear()
        await database.milestoneChecks.clear()
        await database.reminders.clear()
      }

      await database.babies.bulkPut(babies.rows)
      await database.logs.bulkPut(logs.rows)
      await database.measurements.bulkPut(measurements.rows)
      await database.vaccineDoses.bulkPut(vaccineDoses.rows)
      await database.milestoneChecks.bulkPut(milestoneChecks.rows)
      await database.reminders.bulkPut(reminders.rows)
    },
  )

  return {
    mode,
    imported: {
      babies: babies.rows.length,
      logs: logs.rows.length,
      measurements: measurements.rows.length,
      vaccineDoses: vaccineDoses.rows.length,
      milestoneChecks: milestoneChecks.rows.length,
      reminders: reminders.rows.length,
    },
    skipped:
      babies.skipped +
      logs.skipped +
      measurements.skipped +
      vaccineDoses.skipped +
      milestoneChecks.skipped +
      reminders.skipped,
  }
}

// ---------------------------------------------------------------------------
// Download helper
// ---------------------------------------------------------------------------

/** `beyeu-backup-YYYY-MM-DD.json`, using the UTC calendar day. */
export function suggestBackupFilename(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new TypeError('date must be a valid Date')

  const year = String(date.getUTCFullYear()).padStart(4, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `beyeu-backup-${year}-${month}-${day}.json`
}

/**
 * Serialise and save a backup through the platform download fallback.
 *
 * REMINDER (T045): the file is plaintext and contains PII + health data.
 */
export async function downloadBackup(file: BackupFile): Promise<void> {
  const text = serializeBackup(file)
  const name = suggestBackupFilename(new Date(file.exportedAt))
  downloadFile(new File([text], name, { type: 'application/json' }))
}
