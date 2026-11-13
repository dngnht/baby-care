import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { classify, correctedAgeDays, zFromLMS, type LMS } from '../zscore'

/**
 * WHO LMS z-score engine tests.
 *
 * Every expected number comes from data that `scripts/fetch_who_lms.py`
 * extracted from WHO:
 *  - `knowledge/growth/who_lms_<indicator>_<sex>.json` (LMS, committed),
 *  - `knowledge/growth/who_sd_anchors.json` (the published SD columns for a few
 *    anchor rows, committed so the SD comparison always runs), and
 *  - `scripts/.cache/who/<indicator>_<sex>.xlsx` (the original WHO "expanded
 *    tables" workbooks, gitignored, optional cross-check only).
 *
 * Nothing is typed in by hand. The anchor fixture is mandatory: if it is
 * missing the SD tests FAIL rather than skip (regenerate it with
 * `python3 scripts/fetch_who_lms.py --anchors`).
 */

// src/core/standards/__tests__ -> repo root is six levels up, always resolved
// relative to this module (never an absolute path). Vite rewrites
// `new URL('<literal>', import.meta.url)` (and bare `import.meta.url` used as a
// URL base) into an http asset URL, so the file location is taken via
// fileURLToPath and the hops are pure node:path arithmetic.
const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(TEST_DIR, '../../../../../../')
const growthJsonPath = (name: string): string =>
  join(REPO_ROOT, 'knowledge', 'growth', `who_lms_${name}.json`)
const whoXlsxPath = (name: string): string =>
  join(REPO_ROOT, 'scripts', '.cache', 'who', `${name}.xlsx`)

interface LmsRecord extends LMS {
  day?: number
  lengthCm?: number
  heightCm?: number
}

interface LmsDataset {
  indicator: string
  sex: string
  dimension: 'day' | 'length_cm' | 'height_cm'
  data: LmsRecord[]
}

/** One row of a WHO expanded table: LMS plus the published SD columns. */
interface SdRow extends LMS {
  SD4neg: number
  SD3neg: number
  SD2neg: number
  SD1neg: number
  SD0: number
  SD1: number
  SD2: number
  SD3: number
  SD4: number
}

const ALL_DATASETS = [
  'wfa_boys',
  'wfa_girls',
  'lhfa_boys',
  'lhfa_girls',
  'hcfa_boys',
  'hcfa_girls',
  'wfl_boys',
  'wfl_girls',
  'wfh_boys',
  'wfh_girls',
] as const

const jsonCache = new Map<string, LmsDataset>()

const loadDataset = (name: string): LmsDataset => {
  const cached = jsonCache.get(name)
  if (cached) return cached
  const parsed = JSON.parse(readFileSync(growthJsonPath(name), 'utf8')) as LmsDataset
  jsonCache.set(name, parsed)
  return parsed
}

const dimensionKey = (dimension: LmsDataset['dimension']): 'day' | 'lengthCm' | 'heightCm' =>
  dimension === 'day' ? 'day' : dimension === 'length_cm' ? 'lengthCm' : 'heightCm'

const findRecord = (dataset: LmsDataset, value: number): LmsRecord | undefined => {
  const key = dimensionKey(dataset.dimension)
  return dataset.data.find((record) => record[key] === value)
}

const DIMENSION_COLUMN = { day: 'Day', length_cm: 'Length', height_cm: 'Height' } as const

const sheetCache = new Map<string, Map<number, SdRow>>()

/** Reads `scripts/.cache/who/<name>.xlsx` (SheetJS) into rows keyed by age/length/height. */
const loadWhoTable = (name: string, dimension: LmsDataset['dimension']): Map<number, SdRow> => {
  const cached = sheetCache.get(name)
  if (cached) return cached

  const workbook = XLSX.read(readFileSync(whoXlsxPath(name)), { type: 'buffer' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error(`WHO workbook ${name}.xlsx has no sheet`)
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) throw new Error(`WHO workbook ${name}.xlsx is missing sheet ${sheetName}`)

  const matrix = XLSX.utils.sheet_to_json<Array<string | number>>(sheet, {
    header: 1,
    blankrows: false,
  })
  const header = matrix[0]
  if (!header) throw new Error(`WHO workbook ${name}.xlsx has no header row`)

  const column = (columnName: string): number => {
    const index = header.indexOf(columnName)
    if (index < 0) throw new Error(`WHO workbook ${name}.xlsx is missing column "${columnName}"`)
    return index
  }

  const keyColumn = column(DIMENSION_COLUMN[dimension])
  const columns = {
    L: column('L'),
    M: column('M'),
    S: column('S'),
    SD4neg: column('SD4neg'),
    SD3neg: column('SD3neg'),
    SD2neg: column('SD2neg'),
    SD1neg: column('SD1neg'),
    SD0: column('SD0'),
    SD1: column('SD1'),
    SD2: column('SD2'),
    SD3: column('SD3'),
    SD4: column('SD4'),
  } as const

  const numberAt = (record: Array<string | number>, index: number): number => {
    const cell = record[index]
    const value = typeof cell === 'number' ? cell : Number.NaN
    if (!Number.isFinite(value)) {
      throw new Error(`WHO workbook ${name}.xlsx has a non-numeric cell at column ${index}`)
    }
    return value
  }

  const rows = new Map<number, SdRow>()
  for (const record of matrix.slice(1)) {
    const key = numberAt(record, keyColumn)
    rows.set(key, {
      L: numberAt(record, columns.L),
      M: numberAt(record, columns.M),
      S: numberAt(record, columns.S),
      SD4neg: numberAt(record, columns.SD4neg),
      SD3neg: numberAt(record, columns.SD3neg),
      SD2neg: numberAt(record, columns.SD2neg),
      SD1neg: numberAt(record, columns.SD1neg),
      SD0: numberAt(record, columns.SD0),
      SD1: numberAt(record, columns.SD1),
      SD2: numberAt(record, columns.SD2),
      SD3: numberAt(record, columns.SD3),
      SD4: numberAt(record, columns.SD4),
    })
  }

  sheetCache.set(name, rows)
  return rows
}

const rowAt = (table: Map<number, SdRow>, key: number, label: string): SdRow => {
  const row = table.get(key)
  if (!row) throw new Error(`WHO table ${label} has no row for ${key}`)
  return row
}

/** AC for T004b: the published SD columns must round-trip to their z within 0.01 SD. */
const expectWithin = (actual: number, expected: number, tolerance = 0.01): void => {
  expect(
    Math.abs(actual - expected),
    `expected z=${expected} ± ${tolerance}, got ${actual}`,
  ).toBeLessThanOrEqual(tolerance)
}

describe('zFromLMS', () => {
  it('returns 0 when x equals M for every row of all 10 WHO datasets', () => {
    let checked = 0
    for (const name of ALL_DATASETS) {
      const dataset = loadDataset(name)
      expect(dataset.data.length).toBeGreaterThan(0)
      for (const row of dataset.data) {
        expect(zFromLMS(row.M, row)).toBeCloseTo(0, 12)
        checked += 1
      }
    }
    // 732 × 6 (wfa/lhfa/hcfa) + 651 × 2 (wfl) + 551 × 2 (wfh) = 6796 rows.
    expect(checked).toBe(6796)
  })

  it('returns 0 for real rows with positive, negative and near-zero L', () => {
    const dataset = loadDataset('wfa_boys')
    const sorted = [...dataset.data].sort((a, b) => a.L - b.L)
    const lowest = sorted[0]
    const highest = sorted[sorted.length - 1]
    if (!lowest || !highest) throw new Error('wfa_boys dataset is empty')
    const nearestZero = dataset.data.reduce((best, row) =>
      Math.abs(row.L) < Math.abs(best.L) ? row : best,
    )

    // Real WHO weight-for-age spans both signs of L and passes very close to 0.
    expect(lowest.L).toBeLessThan(0)
    expect(highest.L).toBeGreaterThan(0)
    expect(Math.abs(nearestZero.L)).toBeLessThan(0.01)

    for (const row of [lowest, highest, nearestZero]) {
      expect(zFromLMS(row.M, row)).toBeCloseTo(0, 12)
    }
  })

  it('uses the log branch when L = 0', () => {
    const row: LMS = { L: 0, M: 10, S: 0.1 }
    // z = ln(x / M) / S  <=>  x = M * exp(S * z)
    expect(zFromLMS(row.M, row)).toBeCloseTo(0, 12)
    expect(zFromLMS(10 * Math.exp(0.1 * 1.5), row)).toBeCloseTo(1.5, 10)
    expect(zFromLMS(10 * Math.exp(0.1 * -2), row)).toBeCloseTo(-2, 10)
  })

  // KNOWN ENGINE GAP (logged in tasks/QUESTIONS.md): the restricted adjustment
  // computes SD(k) = M * (1 + L*S*k) ** (1 / L). With L = 0 that is
  // Math.pow(1, Infinity) === NaN, so any |z| > 3 returns NaN instead of the
  // mathematical limit SD(k) = M * exp(S * k). No WHO table shipped today has a
  // row with L exactly 0 (weight-for-age only gets as close as 0.0001, which is
  // handled correctly), so this stays a documented expected failure.
  it.fails('returns a finite restricted-adjusted z beyond ±3 SD when L = 0', () => {
    const row: LMS = { L: 0, M: 10, S: 0.1 }
    expect(Number.isNaN(zFromLMS(10 * Math.exp(0.4), row))).toBe(false)
  })
})

/**
 * One anchor row of `knowledge/growth/who_sd_anchors.json`: LMS plus all nine
 * SD columns exactly as published in the WHO workbook.
 */
interface SdAnchor extends LMS {
  key: string
  indicator: string
  sex: string
  dimension: LmsDataset['dimension']
  day?: number
  lengthCm?: number
  heightCm?: number
  sd4neg: number
  sd3neg: number
  sd2neg: number
  sd1neg: number
  sd0: number
  sd1: number
  sd2: number
  sd3: number
  sd4: number
}

interface AnchorDocument {
  source: string
  generated_by: string
  generated_at: string
  verified: boolean
  anchors: SdAnchor[]
}

const anchorPath = join(REPO_ROOT, 'knowledge', 'growth', 'who_sd_anchors.json')

const ANCHOR_POINTS_BY_KEY: ReadonlyArray<{
  key: (typeof ALL_DATASETS)[number]
  points: readonly number[]
}> = [
  { key: 'wfa_boys', points: [0, 365, 730] },
  { key: 'lhfa_boys', points: [0, 365, 730] },
  { key: 'wfl_girls', points: [45, 65, 110] },
  { key: 'wfh_boys', points: [65, 90, 120] },
]

const EXPECTED_ANCHORS: ReadonlyArray<{ key: (typeof ALL_DATASETS)[number]; value: number }> =
  ANCHOR_POINTS_BY_KEY.flatMap(({ key, points }) => points.map((value) => ({ key, value })))

let anchorDocument: AnchorDocument | undefined

/**
 * Loads the committed anchor fixture. A missing file is a hard failure: this
 * file is part of the repo, so CI must never silently skip the SD comparison.
 */
const loadAnchors = (): AnchorDocument => {
  if (anchorDocument) return anchorDocument
  if (!existsSync(anchorPath)) {
    throw new Error(
      `missing ${anchorPath} — knowledge/growth/who_sd_anchors.json is committed; ` +
        'regenerate it with `python3 scripts/fetch_who_lms.py --anchors`',
    )
  }
  anchorDocument = JSON.parse(readFileSync(anchorPath, 'utf8')) as AnchorDocument
  return anchorDocument
}

const dimensionValue = (anchor: SdAnchor): number => {
  const key = dimensionKey(anchor.dimension)
  const value = anchor[key]
  if (value === undefined) {
    throw new Error(`anchor ${anchor.key} (${anchor.dimension}) has no ${key} value`)
  }
  return value
}

const findAnchor = (key: string, value: number): SdAnchor => {
  const anchor = loadAnchors().anchors.find(
    (candidate) => candidate.key === key && dimensionValue(candidate) === value,
  )
  if (!anchor) throw new Error(`who_sd_anchors.json has no ${key} row for ${value}`)
  return anchor
}

const anchorSdLadder = (anchor: SdAnchor): number[] => [
  anchor.sd4neg,
  anchor.sd3neg,
  anchor.sd2neg,
  anchor.sd0,
  anchor.sd2,
  anchor.sd3,
  anchor.sd4,
]

/**
 * AC for T004b, run against the committed fixture on every machine (including
 * a clean CI checkout with no `.xlsx` cache): WHO's published SD columns must
 * round-trip through `zFromLMS` to their nominal z within 0.01 SD.
 */
describe('zFromLMS vs WHO published SD columns (committed anchors)', () => {
  it('ships the expected anchors, extracted from WHO and still unverified', () => {
    const document = loadAnchors()

    expect(document.source).toBe('WHO Child Growth Standards (2006) expanded tables')
    expect(document.generated_by).toBe('scripts/fetch_who_lms.py --anchors')
    expect(document.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    expect(document.verified).toBe(false)
    expect(document.anchors).toHaveLength(EXPECTED_ANCHORS.length)

    // The fixture's LMS and metadata must be the same rows as the committed
    // LMS datasets — the fixture never becomes a second source of truth.
    for (const datasetKey of ANCHOR_POINTS_BY_KEY) {
      const dataset = loadDataset(datasetKey.key)
      const anchors = document.anchors.filter((anchor) => anchor.key === datasetKey.key)
      expect(anchors).toHaveLength(datasetKey.points.length)

      for (const anchor of anchors) {
        const value = dimensionValue(anchor)
        expect(anchor.indicator).toBe(dataset.indicator)
        expect(anchor.sex).toBe(dataset.sex)
        expect(anchor.dimension).toBe(dataset.dimension)

        const record = findRecord(dataset, value)
        if (!record) throw new Error(`${datasetKey.key} JSON has no row for ${value}`)
        expect(anchor.L).toBeCloseTo(record.L, 10)
        expect(anchor.M).toBeCloseTo(record.M, 10)
        expect(anchor.S).toBeCloseTo(record.S, 10)
      }
    }
  })

  for (const { key, value } of EXPECTED_ANCHORS) {
    it(`${key} at ${value}: z(SD3neg/SD2neg/SD0/SD2/SD3) = -3/-2/0/2/3`, () => {
      const anchor = findAnchor(key, value)
      const dataset = loadDataset(key)
      const record = findRecord(dataset, value)
      if (!record) throw new Error(`${key} JSON has no row for ${value}`)

      // Stored LMS must be exactly what the anchor fixture (WHO workbook) has.
      expect(record.L).toBeCloseTo(anchor.L, 10)
      expect(record.M).toBeCloseTo(anchor.M, 10)
      expect(record.S).toBeCloseTo(anchor.S, 10)

      const expected: ReadonlyArray<readonly [number, number]> = [
        [anchor.sd3neg, -3],
        [anchor.sd2neg, -2],
        [anchor.sd0, 0],
        [anchor.sd2, 2],
        [anchor.sd3, 3],
      ]
      for (const [x, z] of expected) {
        expectWithin(zFromLMS(x, record), z)
      }
    })

    it(`${key} at ${value}: restricted adjustment beyond ±3 SD is linear and monotonic`, () => {
      const anchor = findAnchor(key, value)
      const dataset = loadDataset(key)
      const record = findRecord(dataset, value)
      if (!record) throw new Error(`${key} JSON has no row for ${value}`)

      const z3neg = zFromLMS(anchor.sd3neg, record)
      const z3pos = zFromLMS(anchor.sd3, record)
      const z4neg = zFromLMS(anchor.sd4neg, record)
      const z4pos = zFromLMS(anchor.sd4, record)

      // Exactly at the cut-off: ±3, and beyond it the published SD4 = ∓4.
      expectWithin(z3neg, -3)
      expectWithin(z3pos, 3)
      expectWithin(z4neg, -4)
      expectWithin(z4pos, 4)
      expect(z4neg).toBeLessThan(-3)
      expect(z4pos).toBeGreaterThan(3)

      // Continuity: the restricted region is a straight line anchored at SD2/SD3,
      // so the SD3..SD4 midpoint must map to 3.5 SD (no jump at ±3).
      expectWithin(zFromLMS((anchor.sd3neg + anchor.sd4neg) / 2, record), -3.5)
      expectWithin(zFromLMS((anchor.sd3 + anchor.sd4) / 2, record), 3.5)

      // Monotonic increase across the whole published ladder.
      const ladder = anchorSdLadder(anchor).map((x) => zFromLMS(x, record))
      for (let i = 1; i < ladder.length; i += 1) {
        const previous = ladder[i - 1]
        const current = ladder[i]
        if (previous === undefined || current === undefined) {
          throw new Error('unreachable: ladder index out of range')
        }
        expect(current).toBeGreaterThan(previous)
      }
    })
  }
})

const hasWhoCache = ANCHOR_POINTS_BY_KEY.every(({ key }) => existsSync(whoXlsxPath(key)))

/**
 * Optional extra check, only on machines that ran the fetch script: the
 * committed fixture must still equal the cached WHO workbooks cell-for-cell.
 * Skipped on a clean checkout — the block above is the authoritative one.
 */
describe.skipIf(!hasWhoCache)('extra: committed anchors vs cached WHO workbooks', () => {
  for (const { key, value } of EXPECTED_ANCHORS) {
    it(`${key} at ${value} matches every cell in the .xlsx`, () => {
      const anchor = findAnchor(key, value)
      const dataset = loadDataset(key)
      const sd = rowAt(loadWhoTable(key, dataset.dimension), value, key)

      expect(anchor.L).toBeCloseTo(sd.L, 12)
      expect(anchor.M).toBeCloseTo(sd.M, 12)
      expect(anchor.S).toBeCloseTo(sd.S, 12)
      expect(anchor.sd4neg).toBeCloseTo(sd.SD4neg, 12)
      expect(anchor.sd3neg).toBeCloseTo(sd.SD3neg, 12)
      expect(anchor.sd2neg).toBeCloseTo(sd.SD2neg, 12)
      expect(anchor.sd1neg).toBeCloseTo(sd.SD1neg, 12)
      expect(anchor.sd0).toBeCloseTo(sd.SD0, 12)
      expect(anchor.sd1).toBeCloseTo(sd.SD1, 12)
      expect(anchor.sd2).toBeCloseTo(sd.SD2, 12)
      expect(anchor.sd3).toBeCloseTo(sd.SD3, 12)
      expect(anchor.sd4).toBeCloseTo(sd.SD4, 12)
    })
  }
})

/**
 * Band semantics currently implemented by `classify` (asserted as-is):
 *   z < -3            -> severe_low
 *   -3 <= z < -2      -> low
 *   -2 <= z <= +2     -> normal
 *   +2 < z <= +3      -> high
 *   z > +3            -> severe_high
 *
 * So a child sitting exactly at ±3 SD is "low"/"high", not "severe": severity is
 * `|z| > 3`, consistent with the ±3 SD cut-off of the restricted LMS adjustment.
 * Some WHO/clinical material writes the severe band as `z <= -3` / `z >= +3`;
 * that boundary question is logged in tasks/QUESTIONS.md for the medical review
 * (T005) — the engine must not change before that review.
 */
describe('classify', () => {
  const boundaries: ReadonlyArray<readonly [number, string]> = [
    [-3.01, 'severe_low'],
    [-3, 'low'],
    [-2.5, 'low'],
    [-2, 'normal'],
    [0, 'normal'],
    [2, 'normal'],
    [2.5, 'high'],
    [3, 'high'],
    [3.01, 'severe_high'],
  ]

  it.each(boundaries)('z = %s -> %s', (z, band) => {
    expect(classify(z)).toBe(band)
  })

  it.todo(
    'T005: confirm whether the severe band should include the cut-off (z <= -3 / z >= +3) instead of |z| > 3',
  )
})

const utc = (isoDate: string): Date => new Date(`${isoDate}T00:00:00.000Z`)
const plusDays = (date: Date, days: number): Date => new Date(date.getTime() + days * 86_400_000)

describe('correctedAgeDays', () => {
  const birth = utc('2026-01-01')

  it('subtracts the remaining weeks for a baby born at 32 weeks', () => {
    // 100 days old, (40 - 32) * 7 = 56 days of correction.
    expect(correctedAgeDays(birth, plusDays(birth, 100), 32)).toBe(44)
  })

  it('does not correct a baby born at 38 weeks', () => {
    expect(correctedAgeDays(birth, plusDays(birth, 100), 38)).toBe(100)
  })

  it('does not correct a baby born at 40 weeks', () => {
    expect(correctedAgeDays(birth, plusDays(birth, 100), 40)).toBe(100)
  })

  it('does not correct at the 37-week cut-off', () => {
    expect(correctedAgeDays(birth, plusDays(birth, 100), 37)).toBe(100)
  })

  it('corrects at 36 weeks (one week before the cut-off)', () => {
    // (40 - 36) * 7 = 28 days of correction.
    expect(correctedAgeDays(birth, plusDays(birth, 100), 36)).toBe(72)
  })

  it('clamps to 0 when the baby is younger than the correction', () => {
    expect(correctedAgeDays(birth, plusDays(birth, 55), 32)).toBe(0) // 55 - 56 = -1
    expect(correctedAgeDays(birth, plusDays(birth, 10), 28)).toBe(0) // 10 - 84 < 0
  })

  it('defaults to 40 weeks when gestational age is omitted', () => {
    expect(correctedAgeDays(birth, plusDays(birth, 10))).toBe(10)
  })
})
