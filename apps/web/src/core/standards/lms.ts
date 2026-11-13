import hcfaBoys from '../../../../../knowledge/growth/who_lms_hcfa_boys.json'
import hcfaGirls from '../../../../../knowledge/growth/who_lms_hcfa_girls.json'
import lhfaBoys from '../../../../../knowledge/growth/who_lms_lhfa_boys.json'
import lhfaGirls from '../../../../../knowledge/growth/who_lms_lhfa_girls.json'
import wfaBoys from '../../../../../knowledge/growth/who_lms_wfa_boys.json'
import wfaGirls from '../../../../../knowledge/growth/who_lms_wfa_girls.json'
import wflBoys from '../../../../../knowledge/growth/who_lms_wfl_boys.json'
import wflGirls from '../../../../../knowledge/growth/who_lms_wfl_girls.json'
import type { LMS } from './zscore'

/** Indicator codes shipped in `knowledge/growth/who_lms_*.json`. */
export type Indicator = 'wfa' | 'lhfa' | 'hcfa' | 'wfl'

/** Baby sex as used by the WHO tables. */
export type LmsSex = 'boys' | 'girls'

export type LmsDimension = 'day' | 'length_cm' | 'height_cm'

export interface LmsRow extends LMS {
  day?: number
  lengthCm?: number
  heightCm?: number
}

export interface LmsTable {
  indicator: Indicator
  indicator_name: string
  sex: LmsSex
  dimension: LmsDimension
  unit: string
  /** False until the medical review (T005) flips it. */
  verified: boolean
  data: LmsRow[]
}

const TABLES: Readonly<Record<Indicator, Readonly<Record<LmsSex, LmsTable>>>> = {
  wfa: { boys: wfaBoys as unknown as LmsTable, girls: wfaGirls as unknown as LmsTable },
  lhfa: { boys: lhfaBoys as unknown as LmsTable, girls: lhfaGirls as unknown as LmsTable },
  hcfa: { boys: hcfaBoys as unknown as LmsTable, girls: hcfaGirls as unknown as LmsTable },
  wfl: { boys: wflBoys as unknown as LmsTable, girls: wflGirls as unknown as LmsTable },
}

/** Map the app's `M`/`F` sex to the WHO table folder. */
export function lmsSex(sex: 'M' | 'F'): LmsSex {
  return sex === 'M' ? 'boys' : 'girls'
}

export function lmsTable(indicator: Indicator, sex: 'M' | 'F'): LmsTable {
  return TABLES[indicator][lmsSex(sex)]
}

/** True only when every table used by an indicator is medically verified. */
export function isIndicatorVerified(indicator: Indicator): boolean {
  return TABLES[indicator].boys.verified && TABLES[indicator].girls.verified
}

/** Exact day lookup (tables are contiguous 0..731), binary search. */
export function lmsForDay(table: LmsTable, day: number): LmsRow | undefined {
  if (table.dimension !== 'day') return undefined
  const target = Math.round(day)
  if (target < 0) return undefined
  let low = 0
  let high = table.data.length - 1
  while (low <= high) {
    const mid = (low + high) >> 1
    const row = table.data[mid]
    if (row === undefined) return undefined
    const value = row.day ?? 0
    if (value === target) return row
    if (value < target) low = mid + 1
    else high = mid - 1
  }
  return undefined
}

/** Nearest 0.1 cm row for weight-for-length tables. */
export function lmsForLengthCm(table: LmsTable, lengthCm: number): LmsRow | undefined {
  const key = table.dimension === 'length_cm' ? 'lengthCm' : 'heightCm'
  if (table.dimension === 'day') return undefined
  const target = Math.round(lengthCm * 10) / 10
  let best: LmsRow | undefined
  let bestDistance = Number.POSITIVE_INFINITY
  for (const row of table.data) {
    const value = key === 'lengthCm' ? row.lengthCm : row.heightCm
    if (value === undefined) continue
    const distance = Math.abs(value - target)
    if (distance < bestDistance) {
      best = row
      bestDistance = distance
    }
  }
  return bestDistance <= 0.05 ? best : undefined
}

/** Last day covered by a day-based table (used by the chart axis). */
export function maxDay(table: LmsTable): number {
  const last = table.data[table.data.length - 1]
  return last?.day ?? 0
}
