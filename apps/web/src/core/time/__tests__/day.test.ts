import { describe, expect, it } from 'vitest'
import {
  addDays,
  ageInDays,
  endOfDay,
  formatDuration,
  formatTime,
  fromDayKey,
  last24Hours,
  minutesBetween,
  startOfDay,
  toDayKey,
} from '../day'

describe('day helpers', () => {
  it('normalises a local day to its first and last millisecond', () => {
    const noon = new Date(2026, 2, 6, 12, 30, 15, 500)
    expect(startOfDay(noon).getHours()).toBe(0)
    expect(startOfDay(noon).getMinutes()).toBe(0)
    expect(endOfDay(noon).getHours()).toBe(23)
    expect(endOfDay(noon).getMinutes()).toBe(59)
    expect(endOfDay(noon).getMilliseconds()).toBe(999)
    // The same calendar day on both ends.
    expect(toDayKey(startOfDay(noon))).toBe(toDayKey(endOfDay(noon)))
  })

  it('adds days across month boundaries without mutating the input', () => {
    const march1 = new Date(2026, 2, 1, 8, 0, 0)
    expect(toDayKey(addDays(march1, -1))).toBe('2026-02-28')
    expect(toDayKey(addDays(march1, 31))).toBe('2026-04-01')
    expect(toDayKey(march1)).toBe('2026-03-01')
  })

  it('builds an inclusive 24-hour window ending now', () => {
    const now = new Date(2026, 2, 6, 9, 0, 0)
    const { from, to } = last24Hours(now)
    expect(to.getTime() - from.getTime()).toBe(86_400_000)
    expect(to.getTime()).toBe(now.getTime())
  })

  it('computes minutes between ISO timestamps and clamps negatives', () => {
    const start = new Date(2026, 2, 6, 9, 0, 0).toISOString()
    expect(minutesBetween(start, new Date(2026, 2, 6, 10, 35, 0))).toBe(95)
    expect(minutesBetween(start, new Date(2026, 2, 6, 8, 0, 0))).toBe(0)
    expect(minutesBetween('not-a-date', new Date())).toBe(0)
  })

  it('counts whole days of age and never goes negative', () => {
    const birth = new Date(2026, 0, 1, 15, 0, 0)
    expect(ageInDays(birth, new Date(2026, 0, 11, 14, 0, 0))).toBe(9)
    expect(ageInDays(birth, new Date(2026, 0, 11, 16, 0, 0))).toBe(10)
    expect(ageInDays(birth, new Date(2025, 11, 1))).toBe(0)
  })

  it('formats a time as zero-padded HH:mm in local time', () => {
    const iso = new Date(2026, 2, 6, 7, 5, 0).toISOString()
    expect(formatTime(iso)).toBe('07:05')
    expect(formatTime('nope')).toBe('--:--')
  })

  it('round-trips a local day key', () => {
    const date = new Date(2026, 11, 31, 23, 0, 0)
    expect(toDayKey(fromDayKey(toDayKey(date)))).toBe('2026-12-31')
  })

  it('formats durations compactly', () => {
    expect(formatDuration(20)).toBe('20p')
    expect(formatDuration(60)).toBe('1h')
    expect(formatDuration(95)).toBe('1h35')
    expect(formatDuration(-5)).toBe('0p')
  })
})
