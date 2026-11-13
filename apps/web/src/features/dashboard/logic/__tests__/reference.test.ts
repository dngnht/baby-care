import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DAYS_PER_MONTH,
  formatRange,
  groupForAgeDays,
  parseAgeBandDays,
  parseRangeCell,
  parseReference,
} from '../reference'

/**
 * Read the real knowledge file from disk rather than importing it: vitest
 * runs modules through Vite's dev server, which denies `?raw` ids outside the
 * project root (`apps/web`). The app wires that import in `../referenceData`;
 * the parser is exercised here against the very same markdown.
 */
function readReferenceMarkdown(): string {
  const relative = join('knowledge', 'care', 'feeding_sleep_reference.md')
  let dir = process.cwd()

  for (;;) {
    const candidate = join(dir, relative)
    if (existsSync(candidate)) return readFileSync(candidate, 'utf-8')

    const parent = dirname(dir)
    if (parent === dir) {
      throw new Error(`Cannot find ${relative} above ${process.cwd()}`)
    }
    dir = parent
  }
}

const FEEDING_SLEEP_REFERENCE = parseReference(readReferenceMarkdown())

/** A tiny document shaped like the knowledge file, for parser edge cases. */
function fixture(body: string, frontmatter = 'verified: false'): string {
  return `---\n${frontmatter}\n---\n# Title\n\n${body}\n`
}

const TABLE_HEAD = ['| Tuổi | Cữ bú/24h | Ngủ tổng/24h | Tã ướt/24h |', '|---|---|---|---|']

describe('the bundled knowledge file', () => {
  const table = FEEDING_SLEEP_REFERENCE

  it('is read from knowledge/care and is still pending review', () => {
    expect(table.verified).toBe(false)
    expect(table.groups).toHaveLength(4)
  })

  it('parses the 0–1 month row exactly as written', () => {
    const first = table.groups[0]

    expect(first?.label).toBe('0–1 tháng')
    expect(first?.minDays).toBe(0)
    expect(first?.maxDays).toBe(1 * DAYS_PER_MONTH)
    expect(first?.feeds).toEqual({ min: 8, max: 12 })
    expect(first?.sleepHours).toEqual({ min: 14, max: 17 })
    expect(first?.wetDiapers).toEqual({ min: 6 })
  })

  it('reads the feed range of "4–6 + ăn dặm (từ 6m)" as 4–6', () => {
    const group = table.groups.find((entry) => entry.label === '4–11 tháng')

    expect(group?.feeds).toEqual({ min: 4, max: 6 })
  })

  it('leaves the free-form 12–24 month values undefined instead of inventing numbers', () => {
    const group = table.groups.find((entry) => entry.label === '12–24 tháng')

    expect(group).toBeDefined()
    expect(group?.feeds).toBeUndefined()
    expect(group?.wetDiapers).toBeUndefined()
    expect(group?.sleepHours).toEqual({ min: 11, max: 14 })
  })

  it('maps ages to the expected band', () => {
    expect(groupForAgeDays(table, 0)?.label).toBe('0–1 tháng')
    expect(groupForAgeDays(table, 45)?.label).toBe('1–3 tháng')
    expect(groupForAgeDays(table, 200)?.label).toBe('4–11 tháng')
    expect(groupForAgeDays(table, 400)?.label).toBe('12–24 tháng')
  })
})

describe('parseRangeCell', () => {
  it('parses closed intervals, with or without a trailing unit', () => {
    expect(parseRangeCell('8–12')).toEqual({ min: 8, max: 12 })
    expect(parseRangeCell('14–17h')).toEqual({ min: 14, max: 17 })
    expect(parseRangeCell('8-12')).toEqual({ min: 8, max: 12 })
  })

  it('parses an open-ended lower bound', () => {
    expect(parseRangeCell('≥ 6')).toEqual({ min: 6 })
    expect(parseRangeCell('≥ 6 (từ ngày 5)')).toEqual({ min: 6 })
  })

  it('keeps the leading interval and ignores trailing prose', () => {
    expect(parseRangeCell('4–6 + ăn dặm (từ 6m)')).toEqual({ min: 4, max: 6 })
  })

  it('returns undefined for a dash or free-form text', () => {
    expect(parseRangeCell('–')).toBeUndefined()
    expect(parseRangeCell('-')).toBeUndefined()
    expect(parseRangeCell('')).toBeUndefined()
    expect(parseRangeCell('3 bữa chính + 2 phụ + sữa')).toBeUndefined()
    expect(parseRangeCell('chưa rõ')).toBeUndefined()
    expect(parseRangeCell('≥')).toBeUndefined()
  })

  it('never turns a negative-looking separator into a range', () => {
    expect(parseRangeCell('– 6')).toBeUndefined()
  })
})

describe('parseAgeBandDays', () => {
  it('converts month bands with the documented 30-day month', () => {
    expect(parseAgeBandDays('0–1 tháng')).toEqual({ minDays: 0, maxDays: 30 })
    expect(parseAgeBandDays('1-3 tháng')).toEqual({ minDays: 30, maxDays: 90 })
    expect(parseAgeBandDays('12–24 tháng')).toEqual({ minDays: 360, maxDays: 720 })
  })

  it('rejects bands it cannot convert', () => {
    expect(parseAgeBandDays('trên 2 tuổi')).toBeUndefined()
    expect(parseAgeBandDays('–')).toBeUndefined()
  })
})

describe('parseReference', () => {
  it('reads verified: true from the frontmatter', () => {
    const markdown = fixture(`${TABLE_HEAD.join('\n')}\n| 0–1 tháng | 8–12 | 14–17h | ≥ 6 |`, 'verified: true')
    expect(parseReference(markdown).verified).toBe(true)
  })

  it('defaults to unverified when the flag is missing or malformed', () => {
    const body = `${TABLE_HEAD.join('\n')}\n| 0–1 tháng | 8–12 | 14–17h | ≥ 6 |`

    expect(parseReference(fixture(body, 'review_by: "Bác sĩ"')).verified).toBe(false)
    expect(parseReference(fixture(body, 'verified: maybe')).verified).toBe(false)
    expect(parseReference(body).verified).toBe(false)
  })

  it('parses every row with hyphen or en-dash bands', () => {
    const markdown = fixture(
      [
        ...TABLE_HEAD,
        '| 0-1 tháng | 4–6 + ăn dặm (từ 6m) | 12–15h | ≥ 5 |',
        '| 12–24 tháng | 3 bữa chính + 2 phụ + sữa | 11–14h | – |',
      ].join('\n'),
    )

    const { groups } = parseReference(markdown)

    expect(groups).toHaveLength(2)
    expect(groups[0]?.label).toBe('0-1 tháng')
    expect(groups[0]?.minDays).toBe(0)
    expect(groups[0]?.maxDays).toBe(30)
    expect(groups[0]?.feeds).toEqual({ min: 4, max: 6 })
    expect(groups[0]?.sleepHours).toEqual({ min: 12, max: 15 })
    expect(groups[0]?.wetDiapers).toEqual({ min: 5 })
    expect(groups[1]?.feeds).toBeUndefined()
    expect(groups[1]?.wetDiapers).toBeUndefined()
    expect(groups[1]?.sleepHours).toEqual({ min: 11, max: 14 })
  })

  it('handles CRLF line endings', () => {
    const markdown = fixture(`${TABLE_HEAD.join('\n')}\n| 0–1 tháng | 8–12 | 14–17h | ≥ 6 |`).replace(
      /\n/g,
      '\r\n',
    )
    const { groups } = parseReference(markdown)

    expect(groups).toHaveLength(1)
    expect(groups[0]?.feeds).toEqual({ min: 8, max: 12 })
  })

  it('stops at the end of the table and ignores later pipes in prose', () => {
    const markdown = fixture(
      [
        ...TABLE_HEAD,
        '| 0–1 tháng | 8–12 | 14–17h | ≥ 6 |',
        '',
        'Ghi chú | không phải bảng',
      ].join('\n'),
    )

    expect(parseReference(markdown).groups).toHaveLength(1)
  })

  it('skips rows whose age band cannot be read', () => {
    const markdown = fixture(
      [...TABLE_HEAD, '| sơ sinh | 8–12 | 14–17h | ≥ 6 |', '| 1–3 tháng | 7–9 | 14–17h | ≥ 6 |'].join('\n'),
    )
    const { groups } = parseReference(markdown)

    expect(groups).toHaveLength(1)
    expect(groups[0]?.label).toBe('1–3 tháng')
  })

  it('returns no groups when the table is missing', () => {
    expect(parseReference(fixture('Không có bảng nào ở đây.')).groups).toEqual([])
  })
})

describe('groupForAgeDays', () => {
  const table = parseReference(
    fixture(
      [
        ...TABLE_HEAD,
        '| 0–1 tháng | 8–12 | 14–17h | ≥ 6 |',
        '| 1–3 tháng | 7–9 | 14–17h | ≥ 6 |',
      ].join('\n'),
    ),
  )

  it('does not borrow a neighbouring band for an age outside the table', () => {
    expect(groupForAgeDays(table, 365)).toBeUndefined()
    expect(groupForAgeDays(table, -1)).toBeUndefined()
    expect(groupForAgeDays(table, Number.NaN)).toBeUndefined()
  })

  it('keeps the upper bound inclusive', () => {
    expect(groupForAgeDays(table, 30)?.label).toBe('0–1 tháng')
    expect(groupForAgeDays(table, 90)?.label).toBe('1–3 tháng')
  })
})

describe('formatRange', () => {
  it('formats closed, open-ended and unit-suffixed ranges', () => {
    expect(formatRange({ min: 8, max: 12 })).toBe('8–12')
    expect(formatRange({ min: 14, max: 17 }, 'h')).toBe('14–17h')
    expect(formatRange({ min: 6 })).toBe('≥ 6')
  })
})
