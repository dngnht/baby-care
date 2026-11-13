/**
 * "Ghi bù" — logging a feed / diaper / sleep that the parent forgot to record.
 *
 * The form is pre-filled (a time a couple of hours back and the last bottle
 * volume) because the whole point is speed for a distracted parent; every
 * value stays editable. Nothing is invented silently: the amount is only
 * pre-filled when a previous bottle actually had one.
 */
import type { LogPayload } from '../../../core/db/schema'
import type { DiaperKind, FeedSide } from '../../logs/describeLog'

/** Default "when" suggestion: two hours ago, rounded down to 5 minutes. */
export const BACKFILL_OFFSET_MINUTES = 120

/** Only the event types that make sense to write after the fact. */
export type BackfillType = 'feed_breast' | 'feed_bottle' | 'diaper' | 'sleep'

export const BACKFILL_TYPES: readonly BackfillType[] = [
  'feed_breast',
  'feed_bottle',
  'diaper',
  'sleep',
]

export interface BackfillInput {
  type: BackfillType
  /** `datetime-local` value, e.g. "2026-11-09T09:30". */
  at: string
  amountMl?: string
  side?: FeedSide
  diaperKind?: DiaperKind
  /** Sleep length in minutes; the end time is derived from `at`. */
  durationMinutes?: string
}

export interface BackfillResult {
  type: BackfillType
  startAt: Date
  endAt?: Date
  payload: LogPayload
}

export type BackfillError = 'time' | 'value'

export type BackfillParse =
  | { ok: true; value: BackfillResult }
  | { ok: false; error: BackfillError }

/** Round down to the last 5 minutes so the suggested time reads naturally. */
function roundDownToFive(date: Date): Date {
  const next = new Date(date)
  next.setSeconds(0, 0)
  next.setMinutes(Math.floor(next.getMinutes() / 5) * 5)
  return next
}

export function suggestBackfillAt(now: Date, offsetMinutes = BACKFILL_OFFSET_MINUTES): Date {
  return roundDownToFive(new Date(now.getTime() - offsetMinutes * 60_000))
}

const pad2 = (value: number): string => String(value).padStart(2, '0')

/** `Date` -> the `YYYY-MM-DDTHH:mm` string a `datetime-local` input expects. */
export function toDateTimeLocal(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

export function parseDateTimeLocal(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim())
  if (match === null) return null
  const [, year, month, day, hour, minute] = match
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0,
    0,
  )
  if (Number.isNaN(date.getTime())) return null
  // Reject impossible dates that `Date` would roll over (31 February).
  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day)
  ) {
    return null
  }
  return date
}

function parsePositiveInt(raw: string | undefined, min: number, max: number): number | null {
  if (raw === undefined) return null
  const trimmed = raw.trim().replace(',', '.')
  if (trimmed === '') return null
  const value = Number(trimmed)
  if (!Number.isFinite(value)) return null
  const rounded = Math.round(value)
  return rounded >= min && rounded <= max ? rounded : null
}

/**
 * Validate a back-fill form.
 *
 * `at` must be in the past (a future feed has not happened yet); the amount,
 * sleep duration and diaper/side choices are optional where the type allows
 * them.
 */
export function parseBackfill(input: BackfillInput, now: Date = new Date()): BackfillParse {
  if (!BACKFILL_TYPES.includes(input.type)) return { ok: false, error: 'value' }

  const startAt = parseDateTimeLocal(input.at)
  if (startAt === null) return { ok: false, error: 'time' }
  if (startAt.getTime() > now.getTime()) return { ok: false, error: 'time' }

  const payload: LogPayload = {}
  let endAt: Date | undefined

  switch (input.type) {
    case 'feed_bottle': {
      if (input.amountMl !== undefined && input.amountMl.trim() !== '') {
        const amount = parsePositiveInt(input.amountMl, 1, 1000)
        if (amount === null) return { ok: false, error: 'value' }
        payload.amountMl = amount
      }
      break
    }
    case 'feed_breast': {
      if (input.side !== undefined) payload.side = input.side
      break
    }
    case 'diaper': {
      if (input.diaperKind !== undefined) payload.diaperKind = input.diaperKind
      break
    }
    case 'sleep': {
      const duration = parsePositiveInt(input.durationMinutes, 1, 720)
      if (duration === null) return { ok: false, error: 'value' }
      endAt = new Date(startAt.getTime() + duration * 60_000)
      if (endAt.getTime() > now.getTime()) return { ok: false, error: 'time' }
      break
    }
    default:
      return { ok: false, error: 'value' }
  }

  const result: BackfillResult = { type: input.type, startAt, payload }
  if (endAt !== undefined) result.endAt = endAt
  return { ok: true, value: result }
}

/** Validated sleep length for the live preview line, or null. */
export function previewDuration(durationMinutes: string): number | null {
  return parsePositiveInt(durationMinutes, 1, 720)
}
