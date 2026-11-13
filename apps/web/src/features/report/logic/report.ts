/**
 * Report data assembly (T043).
 *
 * Pure: no React, no IndexedDB, no clock read — `now` is always injected, so a
 * printed report is reproducible in tests.
 *
 * No clinical number is computed here: z-scores come from
 * `core/standards/growth` (WHO LMS tables) and vaccine names from
 * `knowledge/vaccines/vn_schedule.json` (AGENTS rule 2). This module only
 * picks, sorts and shapes what those sources already provide.
 */
import type { Baby, LogEntry, Measurement, Sex, VaccineDose } from '../../../core/db/schema'
import { zForMeasurement, type GrowthIndicator } from '../../../core/standards/growth'
import type { Band } from '../../../core/standards/zscore'
import { MS_PER_DAY, formatTime, minutesBetween } from '../../../core/time/day'
import { readDiaperKind, readTempC } from '../../logs/describeLog'
import { FEED_TYPES } from '../../logs/logMeta'
import { describeAge } from '../../profile/logic/age'
import { VN_SCHEDULE, doseKey, generateSchedule } from '../../vaccines/logic/schedule'

/** Width of the "recent" window, in days (T043: 48 hours). */
export const RECENT_WINDOW_DAYS = 2

/** How many un-given doses the "upcoming" list keeps. */
export const UPCOMING_DOSE_LIMIT = 3

/** Indicators shown in the growth block, in report order. */
const GROWTH_INDICATORS: readonly GrowthIndicator[] = ['wfa', 'lhfa', 'hcfa']

export interface ReportProfile {
  /** Stored name; may be empty (the page falls back to `profile.defaultName`). */
  name: string
  ageDays: number
  /** Age after the premature-birth correction; equals `ageDays` when term. */
  correctedDays: number
  sex: Sex
}

export interface ReportScore {
  indicator: GrowthIndicator
  z: number
  band: Band
  /** False while the matching WHO table still awaits the medical review. */
  verified: boolean
}

export interface ReportGrowth {
  /** ISO 8601 UTC of the newest measurement. */
  date: string
  weightKg?: number
  lengthCm?: number
  headCm?: number
  /** One entry per computable indicator; skipped ones are left out. */
  scores: ReportScore[]
}

export interface ReportGivenDose {
  /** Name from the bundled schedule, or the vaccine code as a fallback. */
  name: string
  doseNo: number
  /** ISO 8601 UTC */
  givenDate: string
}

export interface ReportNextDose {
  name: string
  doseNo: number
  /** ISO 8601 UTC */
  dueDate: string
}

export interface ReportVaccines {
  given: ReportGivenDose[]
  /** Earliest un-given doses, at most `UPCOMING_DOSE_LIMIT`. */
  next: ReportNextDose[]
  givenCount: number
  totalCount: number
}

export interface ReportRecent {
  /** Every log that started inside the window, newest first. */
  logs: LogEntry[]
  /** Breast + bottle feeds; solid meals are not feeds here. */
  feedCount: number
  /** Finished sleeps plus any running one, up to `now`. */
  sleepMinutes: number
  /** Diapers whose kind is `wet` or `both`. */
  diaperWet: number
  /** Highest recorded temperature in the window, when one was logged. */
  tempMax?: number
}

export interface ReportData {
  profile: ReportProfile
  growth: ReportGrowth | null
  vaccines: ReportVaccines
  recent: ReportRecent
  /** ISO 8601 UTC */
  generatedAt: string
}

export interface ReportInput {
  baby: Baby
  measurements: readonly Measurement[]
  doses: readonly VaccineDose[]
  logs: readonly LogEntry[]
  now: Date
}

/** Timestamp for sorting; unparseable values go last instead of returning NaN. */
function parseTime(iso: string): number {
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms
}

/** Newest measurement by `date`; ties keep the last row seen. */
function latestMeasurement(measurements: readonly Measurement[]): Measurement | undefined {
  let latest: Measurement | undefined
  let latestMs = Number.NEGATIVE_INFINITY

  for (const measurement of measurements) {
    const ms = Date.parse(measurement.date)
    if (Number.isNaN(ms) || ms < latestMs) continue
    latest = measurement
    latestMs = ms
  }

  return latest
}

/** Latest measurement plus its z-scores; null when nothing was measured yet. */
function buildGrowth(baby: Baby, measurements: readonly Measurement[]): ReportGrowth | null {
  const latest = latestMeasurement(measurements)
  if (latest === undefined) return null

  const growth: ReportGrowth = { date: latest.date, scores: [] }
  if (latest.weightG !== undefined) growth.weightKg = latest.weightG / 1000
  if (latest.lengthCm !== undefined) growth.lengthCm = latest.lengthCm
  if (latest.headCm !== undefined) growth.headCm = latest.headCm

  for (const indicator of GROWTH_INDICATORS) {
    const result = zForMeasurement(latest, baby, indicator)
    if (result === null) continue
    growth.scores.push({
      indicator,
      z: result.z,
      band: result.band,
      verified: result.verified,
    })
  }

  return growth
}

/**
 * Code + dose -> vaccine name, read from the bundled schedule for this baby.
 * A malformed knowledge file must not break the report, so a failure falls back
 * to the stored vaccine code.
 */
function vaccineNames(baby: Baby): ReadonlyMap<string, string> {
  const names = new Map<string, string>()
  try {
    for (const dose of generateSchedule(new Date(baby.birthDate), VN_SCHEDULE)) {
      names.set(doseKey(dose.code, dose.doseNo), dose.name)
    }
  } catch {
    // Fall back to codes below; the schedule file is static and tested.
  }
  return names
}

function doseName(names: ReadonlyMap<string, string>, dose: VaccineDose): string {
  return names.get(doseKey(dose.vaccineCode, dose.doseNo)) ?? dose.vaccineCode
}

function buildVaccines(baby: Baby, doses: readonly VaccineDose[]): ReportVaccines {
  const names = vaccineNames(baby)
  const given: ReportGivenDose[] = []
  const pending: VaccineDose[] = []

  for (const dose of doses) {
    if (dose.givenDate === undefined) {
      pending.push(dose)
      continue
    }
    given.push({ name: doseName(names, dose), doseNo: dose.doseNo, givenDate: dose.givenDate })
  }

  given.sort((a, b) => parseTime(a.givenDate) - parseTime(b.givenDate))
  pending.sort((a, b) => parseTime(a.dueDate) - parseTime(b.dueDate))

  const next = pending.slice(0, UPCOMING_DOSE_LIMIT).map((dose) => ({
    name: doseName(names, dose),
    doseNo: dose.doseNo,
    dueDate: dose.dueDate,
  }))

  return { given, next, givenCount: given.length, totalCount: doses.length }
}

/** 48-hour summary: feeds, sleep, wet diapers, peak temperature, newest logs. */
function buildRecent(logs: readonly LogEntry[], now: Date): ReportRecent {
  const nowMs = now.getTime()
  const cutoffMs = nowMs - RECENT_WINDOW_DAYS * MS_PER_DAY

  const inWindow: LogEntry[] = []
  let feedCount = 0
  let sleepMinutes = 0
  let diaperWet = 0
  let tempMax: number | undefined

  for (const entry of logs) {
    const startMs = Date.parse(entry.startAt)
    if (Number.isNaN(startMs) || startMs < cutoffMs || startMs > nowMs) continue
    inWindow.push(entry)

    if (FEED_TYPES.includes(entry.type)) feedCount += 1

    if (entry.type === 'sleep') {
      sleepMinutes +=
        entry.endAt === undefined
          ? minutesBetween(entry.startAt, now)
          : minutesBetween(entry.startAt, entry.endAt)
    }

    if (entry.type === 'diaper') {
      const kind = readDiaperKind(entry.payload)
      if (kind === 'wet' || kind === 'both') diaperWet += 1
    }

    if (entry.type === 'temp') {
      const temp = readTempC(entry.payload)
      if (temp !== undefined && (tempMax === undefined || temp > tempMax)) tempMax = temp
    }
  }

  inWindow.sort((a, b) => parseTime(b.startAt) - parseTime(a.startAt))

  const recent: ReportRecent = { logs: inWindow, feedCount, sleepMinutes, diaperWet }
  if (tempMax !== undefined) recent.tempMax = tempMax
  return recent
}

/**
 * Everything the printed report shows, for one point in time.
 * A missing section is an empty list / `null`, never a fabricated value.
 */
export function buildReportData({ baby, measurements, doses, logs, now }: ReportInput): ReportData {
  const age = describeAge(baby, now)

  return {
    profile: {
      name: baby.name,
      ageDays: age.days,
      correctedDays: age.correctedDays,
      sex: baby.sex,
    },
    growth: buildGrowth(baby, measurements),
    vaccines: buildVaccines(baby, doses),
    recent: buildRecent(logs, now),
    generatedAt: now.toISOString(),
  }
}

/** "dd/MM/yyyy" in the device timezone; empty for an unparseable timestamp. */
export function formatReportDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`
}

/** "HH:mm" in the device timezone (same rule as the log screens). */
export function formatReportTime(iso: string): string {
  return formatTime(iso)
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}
