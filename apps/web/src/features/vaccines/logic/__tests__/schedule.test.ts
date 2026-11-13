import { describe, expect, it } from 'vitest'
import {
  VN_SCHEDULE,
  addCalendarMonths,
  daysBetween,
  doseStatus,
  generateSchedule,
  mergeWithStored,
  type PlannedDose,
  type StoredDoseRef,
} from '../schedule'

/** Local date (month is 0-based) so assertions never depend on the test TZ. */
const localDate = (year: number, month: number, day: number): Date => new Date(year, month, day)

const BIRTH = localDate(2025, 0, 15)

function findDose(doses: readonly PlannedDose[], code: string, doseNo: number): PlannedDose {
  const match = doses.find((dose) => dose.code === code && dose.doseNo === doseNo)
  if (match === undefined) throw new Error(`missing ${code} dose ${doseNo}`)
  return match
}

const ymd = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

describe('generateSchedule', () => {
  const planned = generateSchedule(BIRTH, VN_SCHEDULE)

  it('dates all 18 TCMR doses from the knowledge file', () => {
    expect(planned).toHaveLength(18)
    expect(planned.every((dose) => dose.source === 'tcmr')).toBe(true)
  })

  it('puts the birth-dose vaccines on the birthday', () => {
    expect(ymd(findDose(planned, 'VGB_SS', 1).dueDate)).toBe('2025-01-15')
    expect(ymd(findDose(planned, 'BCG', 1).dueDate)).toBe('2025-01-15')
  })

  it('puts DPT-VGB-Hib dose 1 two calendar months after birth', () => {
    expect(ymd(findDose(planned, 'DPT_VGB_HIB', 1).dueDate)).toBe('2025-03-15')
    expect(ymd(findDose(planned, 'OPV', 1).dueDate)).toBe('2025-03-15')
  })

  it('chains JE dose 3 one year after JE dose 2', () => {
    const second = findDose(planned, 'JE', 2)
    const third = findDose(planned, 'JE', 3)

    // dose 2 = dose 1 + 7 days (afterPrevDaysMin, anchored at 12 months)
    expect(ymd(findDose(planned, 'JE', 1).dueDate)).toBe('2026-01-15')
    expect(ymd(second.dueDate)).toBe('2026-01-22')
    expect(daysBetween(second.dueDate, third.dueDate)).toBe(365)
  })

  it('keeps the schedule sorted by due date, then code and dose', () => {
    const sorted = [...planned].sort(
      (a, b) =>
        a.dueDate.getTime() - b.dueDate.getTime() ||
        a.code.localeCompare(b.code) ||
        a.doseNo - b.doseNo,
    )
    expect(planned.map((dose) => doseKeyOf(dose))).toEqual(sorted.map((dose) => doseKeyOf(dose)))
  })

  it('inherits the name from the first dose of the same code', () => {
    expect(findDose(planned, 'DPT_VGB_HIB', 2).name).toBe(findDose(planned, 'DPT_VGB_HIB', 1).name)
    expect(findDose(planned, 'DPT_VGB_HIB', 3).name).toBe(findDose(planned, 'DPT_VGB_HIB', 1).name)
    expect(findDose(planned, 'IPV', 2).name).toBe('Bại liệt tiêm (IPV)')
    expect(findDose(planned, 'JE', 3).name).toBe('Viêm não Nhật Bản B')
  })

  it('carries the window hint from the file', () => {
    expect(findDose(planned, 'VGB_SS', 1).window).toBe('trong vòng 24 giờ sau sinh')
    expect(findDose(planned, 'JE', 3).window).toBe('1 năm sau mũi 2')
  })

  it('does not pick up the service vaccines', () => {
    const codes = new Set(planned.map((dose) => dose.code))
    expect(codes.has('ROTA_SV')).toBe(false)
    expect(codes.has('PCV')).toBe(false)
    // Rota is part of the 2025 TCMR file, so it IS scheduled.
    expect(codes.has('ROTA')).toBe(true)
  })
})

describe('addCalendarMonths', () => {
  it('clamps 31 January + 1 month to the end of February', () => {
    expect(ymd(addCalendarMonths(localDate(2025, 0, 31), 1))).toBe('2025-02-28')
  })

  it('clamps to 29 February in a leap year', () => {
    expect(ymd(addCalendarMonths(localDate(2024, 0, 31), 1))).toBe('2024-02-29')
  })

  it('keeps the day when the target month is long enough', () => {
    expect(ymd(addCalendarMonths(localDate(2025, 0, 15), 2))).toBe('2025-03-15')
    expect(ymd(addCalendarMonths(localDate(2025, 10, 30), 3))).toBe('2026-02-28')
  })
})

describe('doseStatus', () => {
  const now = new Date(2026, 2, 10, 9, 30)

  it('is "given" as soon as a given date is stored', () => {
    const status = doseStatus(
      { dueDate: new Date(2026, 2, 1) },
      { givenDate: new Date(2026, 2, 2).toISOString() },
      now,
    )
    expect(status).toEqual({ kind: 'given', daysOverdue: 0 })
  })

  it('is "today" on the due day regardless of the time of day', () => {
    expect(doseStatus({ dueDate: new Date(2026, 2, 10) }, undefined, now)).toEqual({
      kind: 'today',
      daysOverdue: 0,
    })
  })

  it('is "overdue" with the exact day count', () => {
    expect(doseStatus({ dueDate: new Date(2026, 2, 7) }, undefined, now)).toEqual({
      kind: 'overdue',
      daysOverdue: 3,
    })
  })

  it('is "upcoming" before the due day', () => {
    expect(doseStatus({ dueDate: new Date(2026, 2, 11) }, undefined, now)).toEqual({
      kind: 'upcoming',
      daysOverdue: 0,
    })
  })
})

describe('mergeWithStored', () => {
  const planned = generateSchedule(BIRTH, VN_SCHEDULE)

  function store(
    dose: PlannedDose,
    overrides: Partial<StoredDoseRef> = {},
  ): StoredDoseRef {
    return {
      id: `id-${dose.code}-${dose.doseNo}`,
      vaccineCode: dose.code,
      doseNo: dose.doseNo,
      dueDate: dose.dueDate.toISOString(),
      ...overrides,
    }
  }

  it('creates every dose on an empty database', () => {
    const { toCreate, toUpdate } = mergeWithStored(planned, [])
    expect(toCreate).toHaveLength(18)
    expect(toUpdate).toHaveLength(0)
  })

  it('creates no duplicate when the dose is already stored', () => {
    const stored = planned.map((dose) => store(dose))
    const { toCreate, toUpdate } = mergeWithStored(planned, stored)
    expect(toCreate).toHaveLength(0)
    expect(toUpdate).toHaveLength(0)
  })

  it('only updates the due date, so givenDate / lot / place survive', () => {
    const target = findDose(planned, 'MEASLES', 1)
    const stored = [
      store(target, {
        id: 'kept-id',
        dueDate: new Date(2026, 0, 1).toISOString(),
        givenDate: new Date(2025, 9, 20).toISOString(),
      }),
    ]

    const { toUpdate } = mergeWithStored(planned, stored)

    expect(toUpdate).toEqual([{ id: 'kept-id', dueDate: target.dueDate }])
    // The patch carries nothing but the id and the new due date.
    expect(Object.keys(toUpdate[0] ?? {}).sort()).toEqual(['dueDate', 'id'])
  })

  it('does not rewrite a due date that only differs by time of day', () => {
    const target = findDose(planned, 'BCG', 1)
    const sameDayLater = new Date(target.dueDate)
    sameDayLater.setHours(18, 45, 0, 0)

    const { toUpdate } = mergeWithStored(planned, [store(target, { dueDate: sameDayLater.toISOString() })])

    expect(toUpdate).toHaveLength(0)
  })

  it('adds the missing doses from a partially seeded database', () => {
    const stored = [store(findDose(planned, 'BCG', 1))]
    const { toCreate } = mergeWithStored(planned, stored)
    expect(toCreate).toHaveLength(17)
    expect(toCreate.some((dose) => dose.code === 'BCG')).toBe(false)
  })
})

function doseKeyOf(dose: PlannedDose): string {
  return `${dose.code}#${dose.doseNo}`
}
