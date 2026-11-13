/**
 * RFC 5545 (iCalendar 2.0) export of the vaccination schedule.
 *
 * One all-day VEVENT per dose with two DISPLAY alarms (3 days and 1 day
 * before). Pure string building: no DOM, no platform API — the page turns the
 * result into a `File` and hands it to `core/platform`'s `downloadFile`.
 */
import { addDays } from '../../../core/time/day'
import type { PlannedDose } from './schedule'

const CRLF = '\r\n'
/** RFC 5545 §3.1: content lines are limited to 75 octets, continuation = space. */
const MAX_LINE_OCTETS = 75
const CONTINUATION = ' '
const ENCODER = new TextEncoder()

/** Escape a TEXT value: backslash first, then `;`, `,` and newlines. */
function escapeText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replace(/\r?\n/g, '\\n')
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** `YYYYMMDD` in the device timezone (all-day values are floating dates). */
function formatDate(date: Date): string {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`
}

/** `YYYYMMDDTHHMMSSZ` (DTSTAMP is always UTC). */
function formatStamp(date: Date): string {
  const iso = date.toISOString()
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`
}

/**
 * Fold one content line at 75 octets (UTF-8 aware: a multibyte character is
 * never split). Continuation lines are prefixed with a single space.
 */
function foldLine(line: string): string {
  if (ENCODER.encode(line).length <= MAX_LINE_OCTETS) return line

  const chunks: string[] = []
  let current = ''
  let currentOctets = 0
  let budget = MAX_LINE_OCTETS

  for (const char of line) {
    const size = ENCODER.encode(char).length
    if (currentOctets + size > budget && current !== '') {
      chunks.push(current)
      // The leading space of a continuation counts toward its 75 octets.
      current = char
      currentOctets = size
      budget = MAX_LINE_OCTETS - CONTINUATION.length
    } else {
      current += char
      currentOctets += size
    }
  }
  chunks.push(current)

  return chunks.join(`${CRLF}${CONTINUATION}`)
}

export interface IcsOptions {
  /** Value of DTSTAMP; injectable so the output is deterministic in tests. */
  now?: Date
}

/** Stable UID per dose so re-importing the file updates instead of duplicating. */
export function eventUid(dose: PlannedDose): string {
  return `${dose.code}-${dose.doseNo}@beyeu`
}

function alarmLines(summary: string): string[] {
  // DISPLAY alarms require DESCRIPTION; two reminders, 3 days and 1 day ahead.
  return ['-P3D', '-P1D'].flatMap((trigger) => [
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(summary)}`,
    `TRIGGER:${trigger}`,
    'END:VALARM',
  ])
}

function eventLines(dose: PlannedDose, stamp: string): string[] {
  const summary = `Tiêm: ${dose.name} (mũi ${dose.doseNo})`
  return [
    'BEGIN:VEVENT',
    `UID:${eventUid(dose)}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${formatDate(dose.dueDate)}`,
    `DTEND;VALUE=DATE:${formatDate(addDays(dose.dueDate, 1))}`,
    `SUMMARY:${escapeText(summary)}`,
    ...alarmLines(summary),
    'END:VEVENT',
  ]
}

/** Build a complete VCALENDAR document with CRLF line endings. */
export function buildIcs(doses: readonly PlannedDose[], options: IcsOptions = {}): string {
  const stamp = formatStamp(options.now ?? new Date())
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Beyeu//Vaccination schedule//VI',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...doses.flatMap((dose) => eventLines(dose, stamp)),
    'END:VCALENDAR',
  ]

  return `${lines.map(foldLine).join(CRLF)}${CRLF}`
}

/** `beyeu-tiem-chung-YYYY-MM-DD.ics` for the export date. */
export function icsFilename(date: Date): string {
  return `beyeu-tiem-chung-${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}.ics`
}
