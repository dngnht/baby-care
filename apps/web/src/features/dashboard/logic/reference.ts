/**
 * Reference ranges for the 24-hour dashboard.
 *
 * The numbers are medical guidance, so they are NOT written here: this module
 * only knows the *shape* of `knowledge/care/feeding_sleep_reference.md` (a
 * frontmatter block and one markdown table) and turns it into day bands.
 * `./referenceData` wires the real file in at build time (`?raw`); keeping the
 * parser free of that import lets the tests read the knowledge file directly,
 * and keeps adding a row to the knowledge file enough to change the UI.
 *
 * The frontmatter flag `verified: false` travels with the table so the UI can
 * label it as "pending review" and keep its colours neutral.
 */

/**
 * Month -> day conversion used to turn "1–3 tháng" into a day interval.
 *
 * Convention: a flat 30-day month (no calendar months, no leap years), so the
 * bands stay stable and reproducible across years:
 * "0–1 tháng" = 0–30 days, "1–3 tháng" = 30–90 days,
 * "4–11 tháng" = 120–330 days, "12–24 tháng" = 360–720 days.
 * Like the source table, this leaves the 3–4 and 11–12 month gaps uncovered.
 */
export const DAYS_PER_MONTH = 30

/** A numeric reference interval. `max` is absent for open-ended cells ("≥ 6"). */
export interface ValueRange {
  min: number
  /** Inclusive upper bound; `undefined` means "min or more". */
  max?: number
}

/** One row of the reference table, in the day units the app counts in. */
export interface AgeGroupReference {
  /** Age band exactly as written in the table, e.g. "0–1 tháng". */
  label: string
  /** Lower bound in days, inclusive. */
  minDays: number
  /** Upper bound in days, inclusive. */
  maxDays: number
  feeds?: ValueRange
  sleepHours?: ValueRange
  wetDiapers?: ValueRange
}

export interface ReferenceTable {
  /** `false` until a clinician has reviewed the numbers. */
  verified: boolean
  groups: AgeGroupReference[]
}

// ---------------------------------------------------------------------------
// Markdown helpers
// ---------------------------------------------------------------------------

/** En dash, em dash and the minus sign all read as a range separator. */
const DASHES = /[\u2013\u2014\u2212]/g

/** Integer or decimal, dot or comma separated. */
const NUMBER = String.raw`\d+(?:[.,]\d+)?`

const FENCE = '---'

const SEPARATOR_CELL = /^:?-{3,}:?$/

/** `"0–1 tháng"` -> `"0-1 tháng"` (single ASCII hyphen). */
function normalizeDashes(text: string): string {
  return text.replace(DASHES, '-')
}

function toNumber(raw: string): number | undefined {
  const value = Number(raw.replace(',', '.'))
  return Number.isFinite(value) ? value : undefined
}

/** Drop a clarification in parentheses: "≥ 6 (từ ngày 5)" -> "≥ 6". */
function stripParenthetical(text: string): string {
  return text.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Split a `| a | b |` row into trimmed cells. */
function splitRow(line: string): string[] {
  let body = line.trim()
  if (body.startsWith('|')) body = body.slice(1)
  if (body.endsWith('|')) body = body.slice(0, -1)
  return body.split('|').map((cell) => cell.trim())
}

function isSeparatorRow(cells: readonly string[]): boolean {
  return cells.length > 0 && cells.every((cell) => SEPARATOR_CELL.test(cell))
}

/**
 * Read `verified` from the YAML frontmatter.
 *
 * Defaults to `false` when the flag is missing or malformed: an unreviewed
 * table must never be treated as reviewed.
 */
function readVerified(markdown: string): boolean {
  const lines = markdown.split(/\r?\n/)
  if (lines[0]?.trim() !== FENCE) return false

  for (let index = 1; index < lines.length; index += 1) {
    const line = (lines[index] ?? '').trim()
    if (line === FENCE) break

    const match = /^verified\s*:\s*(true|false)\s*$/i.exec(line)
    if (match !== null) return (match[1] ?? '').toLowerCase() === 'true'
  }

  return false
}

// ---------------------------------------------------------------------------
// Cell / band parsers (pure, exported for tests)
// ---------------------------------------------------------------------------

/**
 * Parse a value cell into a range. Returns `undefined` for "–", empty cells
 * and free-form text, so a missing figure never becomes a made-up zero.
 *
 * The numeric interval must be at the START of the cell; trailing prose is not
 * scanned, which keeps "3 bữa chính + 2 phụ + sữa" undefined instead of
 * inventing a 3–2 feed range.
 */
export function parseRangeCell(raw: string): ValueRange | undefined {
  const text = normalizeDashes(stripParenthetical(raw))
  if (text === '' || text === '-') return undefined

  const openEnded = new RegExp(`^(?:>=|\u2265)\\s*(${NUMBER})`).exec(text)
  if (openEnded !== null) {
    const min = toNumber(openEnded[1] ?? '')
    return min === undefined ? undefined : { min }
  }

  const interval = new RegExp(`^(${NUMBER})\\s*-\\s*(${NUMBER})`).exec(text)
  if (interval !== null) {
    const first = toNumber(interval[1] ?? '')
    const second = toNumber(interval[2] ?? '')
    if (first === undefined || second === undefined) return undefined
    return { min: Math.min(first, second), max: Math.max(first, second) }
  }

  // A bare number is a single-point value ("12", "12h"); a sentence starting
  // with a number ("3 bữa chính + 2 phụ") is NOT, so the whole cell must match.
  const single = new RegExp(`^(${NUMBER})\\s*[a-zA-Z%\u00b0]*$`).exec(text)
  if (single !== null) {
    const value = toNumber(single[1] ?? '')
    return value === undefined ? undefined : { min: value, max: value }
  }

  return undefined
}

/** `"0–1 tháng"` / `"4-11 tháng"` -> day bounds (see `DAYS_PER_MONTH`). */
export function parseAgeBandDays(raw: string): { minDays: number; maxDays: number } | undefined {
  const text = normalizeDashes(raw).replace(/\s+/g, ' ').trim()
  const match = new RegExp(`^(${NUMBER})\\s*-\\s*(${NUMBER})\\s*tháng`, 'i').exec(text)
  if (match === null) return undefined

  const first = toNumber(match[1] ?? '')
  const second = toNumber(match[2] ?? '')
  if (first === undefined || second === undefined) return undefined

  return {
    minDays: Math.min(first, second) * DAYS_PER_MONTH,
    maxDays: Math.max(first, second) * DAYS_PER_MONTH,
  }
}

// ---------------------------------------------------------------------------
// Table parser
// ---------------------------------------------------------------------------

interface Columns {
  age: number
  feeds: number
  sleep: number
  wet: number
}

/** Locate the four expected columns from the table header. */
function findColumns(header: readonly string[]): Columns | null {
  const find = (needle: string): number =>
    header.findIndex((cell) => cell.toLowerCase().includes(needle))

  const age = find('tuổi')
  const feeds = find('bú')
  const sleep = find('ngủ')
  const wet = find('tã')
  if (age < 0 || feeds < 0 || sleep < 0 || wet < 0) return null

  return { age, feeds, sleep, wet }
}

function parseGroupRow(cells: readonly string[], columns: Columns): AgeGroupReference | undefined {
  const label = (cells[columns.age] ?? '').trim()
  if (label === '') return undefined

  const band = parseAgeBandDays(label)
  if (band === undefined) return undefined

  const group: AgeGroupReference = { label, minDays: band.minDays, maxDays: band.maxDays }

  const feeds = parseRangeCell(cells[columns.feeds] ?? '')
  if (feeds !== undefined) group.feeds = feeds

  const sleep = parseRangeCell(cells[columns.sleep] ?? '')
  if (sleep !== undefined) group.sleepHours = sleep

  const wet = parseRangeCell(cells[columns.wet] ?? '')
  if (wet !== undefined) group.wetDiapers = wet

  return group
}

/**
 * Parse the reference markdown: frontmatter flag + the first table that has
 * the `Tuổi | Cữ bú | Ngủ | Tã` header. Rows whose age band cannot be read are
 * skipped rather than guessed.
 */
export function parseReference(markdown: string): ReferenceTable {
  const verified = readVerified(markdown)
  const lines = markdown.split(/\r?\n/)

  const groups: AgeGroupReference[] = []
  let columns: Columns | null = null

  for (const line of lines) {
    const isTableRow = line.trim().startsWith('|')
    if (!isTableRow) {
      // The table ends at the first non-table line once its header was found.
      if (columns !== null) break
      continue
    }

    const cells = splitRow(line)
    if (columns === null) {
      columns = findColumns(cells)
      continue
    }
    if (isSeparatorRow(cells)) continue

    const group = parseGroupRow(cells, columns)
    if (group !== undefined) groups.push(group)
  }

  return { verified, groups }
}

/**
 * Age band covering `days`, or `undefined` when the table has no row for that
 * age (including the gaps the source table leaves open) — the dashboard then
 * says "no reference" instead of borrowing a neighbouring band.
 */
export function groupForAgeDays(
  table: ReferenceTable,
  days: number,
): AgeGroupReference | undefined {
  if (!Number.isFinite(days) || days < 0) return undefined
  return table.groups.find((group) => days >= group.minDays && days <= group.maxDays)
}

/**
 * Human-readable interval: "8–12", "14–17h", "≥ 6".
 * `unit` is a symbol ("h"), never translatable prose.
 */
export function formatRange(range: ValueRange, unit = ''): string {
  if (range.max === undefined) return `\u2265 ${range.min}${unit}`
  return `${range.min}\u2013${range.max}${unit}`
}
