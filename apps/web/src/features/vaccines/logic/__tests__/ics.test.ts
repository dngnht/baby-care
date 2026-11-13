import { describe, expect, it } from 'vitest'
import { buildIcs, eventUid, icsFilename } from '../ics'
import type { PlannedDose } from '../schedule'

const localDate = (year: number, month: number, day: number): Date => new Date(year, month, day)

const NOW = new Date(Date.UTC(2026, 0, 2, 3, 4, 5))

function dose(overrides: Partial<PlannedDose> = {}): PlannedDose {
  return {
    code: 'BCG',
    name: 'Lao (BCG)',
    doseNo: 1,
    dueDate: localDate(2025, 0, 15),
    source: 'tcmr',
    ...overrides,
  }
}

/** Physical lines of the document (CRLF is the only line break). */
const physicalLines = (ics: string): string[] => ics.split('\r\n')

describe('buildIcs', () => {
  it('wraps the calendar in VCALENDAR 2.0', () => {
    const ics = buildIcs([dose()], { now: NOW })
    const lines = physicalLines(ics)

    expect(lines[0]).toBe('BEGIN:VCALENDAR')
    expect(lines[1]).toBe('VERSION:2.0')
    expect(lines).toContain('END:VCALENDAR')
    expect(ics.endsWith('\r\n')).toBe(true)
  })

  it('writes one VEVENT per dose', () => {
    const ics = buildIcs(
      [
        dose(),
        dose({ code: 'DPT_VGB_HIB', name: 'Bạch hầu-Ho gà', doseNo: 1 }),
        dose({ code: 'DPT_VGB_HIB', name: 'Bạch hầu-Ho gà', doseNo: 2 }),
      ],
      { now: NOW },
    )
    const lines = physicalLines(ics)

    expect(lines.filter((line) => line === 'BEGIN:VEVENT')).toHaveLength(3)
    expect(lines.filter((line) => line === 'END:VEVENT')).toHaveLength(3)
  })

  it('adds two DISPLAY alarms (3 days and 1 day before) to every event', () => {
    const ics = buildIcs([dose(), dose({ code: 'OPV', doseNo: 1 })], { now: NOW })
    const lines = physicalLines(ics)

    expect(lines.filter((line) => line === 'BEGIN:VALARM')).toHaveLength(4)
    expect(lines.filter((line) => line === 'ACTION:DISPLAY')).toHaveLength(4)
    expect(lines.filter((line) => line === 'TRIGGER:-P3D')).toHaveLength(2)
    expect(lines.filter((line) => line === 'TRIGGER:-P1D')).toHaveLength(2)
  })

  it('uses an all-day DTSTART and a DTEND one day later', () => {
    const lines = physicalLines(buildIcs([dose()], { now: NOW }))

    expect(lines).toContain('DTSTART;VALUE=DATE:20250115')
    expect(lines).toContain('DTEND;VALUE=DATE:20250116')
  })

  it('stamps DTSTAMP in UTC and keeps a stable UID', () => {
    const lines = physicalLines(buildIcs([dose()], { now: NOW }))

    expect(lines).toContain('DTSTAMP:20260102T030405Z')
    expect(lines).toContain('UID:BCG-1@beyeu')
    expect(eventUid(dose())).toBe('BCG-1@beyeu')
  })

  it('writes the Vietnamese summary', () => {
    const lines = physicalLines(buildIcs([dose()], { now: NOW }))
    expect(lines).toContain('SUMMARY:Tiêm: Lao (BCG) (mũi 1)')
    expect(lines).toContain('DESCRIPTION:Tiêm: Lao (BCG) (mũi 1)')
  })

  it('escapes commas and semicolons in text values', () => {
    const ics = buildIcs([dose({ name: 'Sởi, quai bị; Rubella' })], { now: NOW })
    expect(ics).toContain('SUMMARY:Tiêm: Sởi\\, quai bị\\; Rubella (mũi 1)')
  })

  it('escapes newlines inside a text value', () => {
    const ics = buildIcs([dose({ name: 'Dòng 1\nDòng 2' })], { now: NOW })
    expect(ics).toContain('Dòng 1\\nDòng 2')
  })

  it('uses CRLF only, never a bare LF', () => {
    const ics = buildIcs([dose(), dose({ code: 'OPV', doseNo: 1 })], { now: NOW })
    expect(ics).not.toMatch(/[^\r]\n/)
  })

  it('folds lines longer than 75 octets with a leading space', () => {
    const longName = 'Vắc xin phối hợp phòng nhiều bệnh rất dài tên để kiểm tra việc xuống dòng'
    const ics = buildIcs([dose({ name: longName })], { now: NOW })
    const lines = physicalLines(ics)

    // Nothing exceeds the RFC limit, counted in UTF-8 octets.
    for (const line of lines) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    }

    // The SUMMARY really was split, and the continuation starts with a space.
    expect(ics).toContain('\r\n ')
    const summaryIndex = lines.findIndex((line) => line.startsWith('SUMMARY:'))
    expect(summaryIndex).toBeGreaterThanOrEqual(0)
    const continuation = lines[summaryIndex + 1] ?? ''
    expect(continuation.startsWith(' ')).toBe(true)
    expect(continuation.length).toBeGreaterThan(1)
  })

  it('produces a valid (empty) calendar when there is nothing to export', () => {
    const ics = buildIcs([], { now: NOW })
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics).not.toContain('BEGIN:VEVENT')
  })
})

describe('icsFilename', () => {
  it('is a dated .ics filename', () => {
    expect(icsFilename(localDate(2026, 2, 9))).toBe('beyeu-tiem-chung-2026-03-09.ics')
  })
})
