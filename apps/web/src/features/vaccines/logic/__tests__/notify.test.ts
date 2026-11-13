import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requestPermission, show } from '../../../../core/platform'
import { dosesWithinDays, notifyUpcoming } from '../notify'
import type { PlannedDose, StoredDoseRef } from '../schedule'

vi.mock('../../../../core/platform', () => ({
  requestPermission: vi.fn(),
  show: vi.fn(),
}))

const requestPermissionMock = vi.mocked(requestPermission)
const showMock = vi.mocked(show)

const localDate = (year: number, month: number, day: number): Date => new Date(year, month, day)
const NOW = localDate(2026, 2, 10)

function dose(code: string, dueDate: Date, doseNo = 1, name = code): PlannedDose {
  return { code, name, doseNo, dueDate, source: 'tcmr' }
}

function storedDose(code: string, givenDate: string, doseNo = 1): StoredDoseRef {
  return {
    id: `id-${code}`,
    vaccineCode: code,
    doseNo,
    dueDate: NOW.toISOString(),
    givenDate,
  }
}

const schedule: PlannedDose[] = [
  dose('MEASLES', localDate(2026, 2, 10), 1, 'Sởi'),
  dose('JE', localDate(2026, 2, 12), 1, 'Viêm não Nhật Bản'),
  dose('JE', localDate(2026, 2, 13), 2, 'Viêm não Nhật Bản'),
  dose('DPT', localDate(2026, 2, 20), 4, 'Bạch hầu-Ho gà-Uốn ván'),
]

describe('dosesWithinDays', () => {
  it('keeps doses from today through the end of the window', () => {
    const upcoming = dosesWithinDays(schedule, [], NOW)

    expect(upcoming.map((entry) => `${entry.code}#${entry.doseNo}`)).toEqual([
      'MEASLES#1',
      'JE#1',
      'JE#2',
    ])
  })

  it('excludes doses past the window and overdue doses', () => {
    const withOverdue = [...schedule, dose('BCG', localDate(2026, 2, 9), 1)]
    const upcoming = dosesWithinDays(withOverdue, [], NOW)

    expect(upcoming.some((entry) => entry.code === 'BCG')).toBe(false)
    expect(upcoming.some((entry) => entry.code === 'DPT')).toBe(false)
  })

  it('excludes doses that were already given', () => {
    const upcoming = dosesWithinDays(schedule, [storedDose('JE', NOW.toISOString())], NOW)
    expect(upcoming.map((entry) => `${entry.code}#${entry.doseNo}`)).toEqual(['MEASLES#1', 'JE#2'])
  })

  it('accepts a custom window', () => {
    expect(dosesWithinDays(schedule, [], NOW, 10)).toHaveLength(4)
  })
})

describe('notifyUpcoming', () => {
  beforeEach(() => {
    requestPermissionMock.mockResolvedValue('granted')
    showMock.mockResolvedValue(true)
  })

  it('returns "empty" without asking for permission when nothing is due', async () => {
    const result = await notifyUpcoming([], [], NOW)

    expect(result).toBe('empty')
    expect(requestPermissionMock).not.toHaveBeenCalled()
    expect(showMock).not.toHaveBeenCalled()
  })

  it('returns "blocked" when permission is denied', async () => {
    requestPermissionMock.mockResolvedValue('denied')

    expect(await notifyUpcoming(schedule, [], NOW)).toBe('blocked')
    expect(showMock).not.toHaveBeenCalled()
  })

  it('returns "unsupported" when the device has no notification API', async () => {
    requestPermissionMock.mockResolvedValue('unsupported')

    expect(await notifyUpcoming(schedule, [], NOW)).toBe('unsupported')
    expect(showMock).not.toHaveBeenCalled()
  })

  it('shows the closest upcoming dose and returns "shown"', async () => {
    expect(await notifyUpcoming(schedule, [], NOW)).toBe('shown')

    expect(showMock).toHaveBeenCalledTimes(1)
    expect(showMock).toHaveBeenCalledWith({
      title: 'Nhắc lịch tiêm',
      body: 'Còn 3 ngày: Sởi',
      tag: 'MEASLES-1@beyeu',
    })
  })

  it('returns "blocked" when the platform could not display it', async () => {
    showMock.mockResolvedValue(false)
    expect(await notifyUpcoming(schedule, [], NOW)).toBe('blocked')
  })
})
