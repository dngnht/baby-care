import { describe, expect, it } from 'vitest'
import {
  MAX_HEAD_CM,
  MAX_LENGTH_CM,
  MAX_WEIGHT_G,
  MIN_HEAD_CM,
  MIN_LENGTH_CM,
  MIN_WEIGHT_G,
  bandPresentation,
  formatZ,
  parseMeasurementInput,
  type MeasurementInput,
} from '../measurementForm'

/** Local-time fixtures, so the assertions do not depend on the machine TZ. */
const BIRTH = new Date(2026, 0, 1, 9, 0, 0)
const NOW = new Date(2026, 5, 15, 10, 30, 0)

const BASE: MeasurementInput = {
  babyId: 'baby-1',
  birthDate: BIRTH,
  date: '2026-06-15',
  weightG: '',
  lengthCm: '',
  headCm: '',
}

function input(overrides: Partial<MeasurementInput>): MeasurementInput {
  return { ...BASE, ...overrides }
}

describe('parseMeasurementInput', () => {
  it('rejects a form with no measurement at all', () => {
    expect(parseMeasurementInput(input({}), NOW)).toEqual({ ok: false, error: 'empty' })
  })

  it('accepts a weight-only measurement and stores local midnight', () => {
    const result = parseMeasurementInput(input({ weightG: '7500' }), NOW)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.babyId).toBe('baby-1')
    expect(result.value.weightG).toBe(7500)
    expect(result.value.lengthCm).toBeUndefined()
    expect(result.value.headCm).toBeUndefined()
    expect(result.value.date.getFullYear()).toBe(2026)
    expect(result.value.date.getMonth()).toBe(5)
    expect(result.value.date.getDate()).toBe(15)
    expect(result.value.date.getHours()).toBe(0)
  })

  it('accepts a length-only measurement and does not invent other fields', () => {
    const result = parseMeasurementInput(input({ lengthCm: '62.5' }), NOW)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.lengthCm).toBe(62.5)
    expect(result.value.weightG).toBeUndefined()
    expect(result.value.headCm).toBeUndefined()
  })

  it('accepts the Vietnamese comma as decimal separator', () => {
    const result = parseMeasurementInput(input({ headCm: '40,5' }), NOW)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.headCm).toBe(40.5)
  })

  it('rejects a future date', () => {
    expect(parseMeasurementInput(input({ date: '2026-06-16', weightG: '7000' }), NOW)).toEqual({
      ok: false,
      error: 'date',
    })
  })

  it('accepts today (the whole local day, not just the current instant)', () => {
    const result = parseMeasurementInput(input({ date: '2026-06-15', weightG: '7000' }), NOW)
    expect(result.ok).toBe(true)
  })

  it('rejects a date before the baby was born', () => {
    expect(parseMeasurementInput(input({ date: '2025-12-31', weightG: '3000' }), NOW)).toEqual({
      ok: false,
      error: 'date',
    })
  })

  it('accepts the birth day itself', () => {
    const result = parseMeasurementInput(input({ date: '2026-01-01', weightG: '3200' }), NOW)
    expect(result.ok).toBe(true)
  })

  it('rejects impossible or misformatted dates', () => {
    expect(parseMeasurementInput(input({ date: '2026-02-30', weightG: '7000' }), NOW)).toEqual({
      ok: false,
      error: 'date',
    })
    expect(parseMeasurementInput(input({ date: '15/06/2026', weightG: '7000' }), NOW)).toEqual({
      ok: false,
      error: 'date',
    })
    expect(parseMeasurementInput(input({ date: '', weightG: '7000' }), NOW)).toEqual({
      ok: false,
      error: 'date',
    })
  })

  it('checks the date before the emptiness of the form', () => {
    expect(parseMeasurementInput(input({ date: '2027-01-01' }), NOW)).toEqual({
      ok: false,
      error: 'date',
    })
  })

  it('accepts the weight boundaries', () => {
    for (const grams of [MIN_WEIGHT_G, MAX_WEIGHT_G]) {
      const result = parseMeasurementInput(input({ weightG: String(grams) }), NOW)
      expect(result.ok, String(grams)).toBe(true)
    }
  })

  it('rejects weights below 500 g and above 30 000 g', () => {
    expect(parseMeasurementInput(input({ weightG: '499' }), NOW)).toEqual({
      ok: false,
      error: 'range',
    })
    expect(parseMeasurementInput(input({ weightG: '30001' }), NOW)).toEqual({
      ok: false,
      error: 'range',
    })
  })

  it('rejects a non-integer or non-numeric weight', () => {
    expect(parseMeasurementInput(input({ weightG: '7500.5' }), NOW)).toEqual({
      ok: false,
      error: 'range',
    })
    expect(parseMeasurementInput(input({ weightG: 'abc' }), NOW)).toEqual({
      ok: false,
      error: 'range',
    })
    expect(parseMeasurementInput(input({ weightG: '-500' }), NOW)).toEqual({
      ok: false,
      error: 'range',
    })
  })

  it('accepts the length boundaries and rejects 120.1 cm', () => {
    expect(parseMeasurementInput(input({ lengthCm: String(MIN_LENGTH_CM) }), NOW).ok).toBe(true)
    expect(parseMeasurementInput(input({ lengthCm: String(MAX_LENGTH_CM) }), NOW).ok).toBe(true)
    expect(parseMeasurementInput(input({ lengthCm: '120.1' }), NOW)).toEqual({
      ok: false,
      error: 'range',
    })
    expect(parseMeasurementInput(input({ lengthCm: '24.9' }), NOW)).toEqual({
      ok: false,
      error: 'range',
    })
  })

  it('accepts the head boundaries and rejects values outside 20–70 cm', () => {
    expect(parseMeasurementInput(input({ headCm: String(MIN_HEAD_CM) }), NOW).ok).toBe(true)
    expect(parseMeasurementInput(input({ headCm: String(MAX_HEAD_CM) }), NOW).ok).toBe(true)
    expect(parseMeasurementInput(input({ headCm: '19.9' }), NOW)).toEqual({
      ok: false,
      error: 'range',
    })
    expect(parseMeasurementInput(input({ headCm: '70.1' }), NOW)).toEqual({
      ok: false,
      error: 'range',
    })
  })

  it('rejects more than one decimal place', () => {
    expect(parseMeasurementInput(input({ lengthCm: '60.55' }), NOW)).toEqual({
      ok: false,
      error: 'range',
    })
  })

  it('validates every filled box, keeping the blanks blank', () => {
    const result = parseMeasurementInput(
      input({ weightG: '7200', lengthCm: '64', headCm: '' }),
      NOW,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({ weightG: 7200, lengthCm: 64 })
    expect(result.value.headCm).toBeUndefined()
  })
})

describe('bandPresentation', () => {
  it('never uses the severe tone while the table is unverified', () => {
    expect(bandPresentation('severe_low', false)).toEqual({
      labelKey: 'band.severe_low',
      tone: 'neutral',
    })
    expect(bandPresentation('severe_high', false)).toEqual({
      labelKey: 'band.severe_high',
      tone: 'neutral',
    })
  })

  it('keeps the band label correct when unverified', () => {
    expect(bandPresentation('low', false).labelKey).toBe('band.low')
    expect(bandPresentation('high', false).labelKey).toBe('band.high')
    expect(bandPresentation('normal', false).labelKey).toBe('band.normal')
  })

  it('maps verified bands to their tones', () => {
    expect(bandPresentation('severe_low', true).tone).toBe('severe')
    expect(bandPresentation('severe_high', true).tone).toBe('severe')
    expect(bandPresentation('low', true).tone).toBe('low')
    expect(bandPresentation('high', true).tone).toBe('high')
    expect(bandPresentation('normal', true).tone).toBe('neutral')
  })
})

describe('formatZ', () => {
  it('renders one decimal with a minus sign', () => {
    expect(formatZ(-1.8)).toBe('-1.8')
    expect(formatZ(1.234)).toBe('1.2')
    expect(formatZ(2)).toBe('2.0')
  })

  it('rounds half away from zero and never shows -0.0', () => {
    expect(formatZ(1.25)).toBe('1.3')
    expect(formatZ(-0.01)).toBe('0.0')
  })

  it('does not fabricate a number for a non-finite input', () => {
    expect(formatZ(Number.NaN)).toBe('\u2014')
  })
})
