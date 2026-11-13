import type { LogEntry, LogPayload } from '../../core/db/schema'
import { formatDuration, minutesBetween } from '../../core/time/day'
import { t } from '../../core/i18n'

export type FeedSide = 'left' | 'right' | 'both'
export type DiaperKind = 'wet' | 'dirty' | 'both'

/** Payload key holding the running-timer marker. */
export const TIMER_PAYLOAD_KEY = 'timer'
export const TIMER_RUNNING = 'running'

function readValue(payload: LogPayload, key: string): unknown {
  return payload[key]
}

export function readString(payload: LogPayload, key: string): string | undefined {
  const value = readValue(payload, key)
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function readNumber(payload: LogPayload, key: string): number | undefined {
  const value = readValue(payload, key)
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function readSide(payload: LogPayload): FeedSide | undefined {
  const value = readString(payload, 'side')
  return value === 'left' || value === 'right' || value === 'both' ? value : undefined
}

export function readDiaperKind(payload: LogPayload): DiaperKind | undefined {
  const value = readString(payload, 'diaperKind')
  return value === 'wet' || value === 'dirty' || value === 'both' ? value : undefined
}

export function readAmountMl(payload: LogPayload): number | undefined {
  return readNumber(payload, 'amountMl')
}

export function readTempC(payload: LogPayload): number | undefined {
  return readNumber(payload, 'tempC')
}

export function isTimerRunning(entry: Pick<LogEntry, 'payload'>): boolean {
  return entry.payload[TIMER_PAYLOAD_KEY] === TIMER_RUNNING
}

export function timerMarker(): LogPayload {
  return { [TIMER_PAYLOAD_KEY]: TIMER_RUNNING }
}

/** One-line detail for a log, e.g. "120 ml · Trái" or "1h35". */
export function describeLog(entry: LogEntry, now: Date = new Date()): string {
  const payload = entry.payload
  const parts: string[] = []

  switch (entry.type) {
    case 'feed_breast': {
      const side = readSide(payload)
      if (side !== undefined) parts.push(t(side === 'left' ? 'logs.sideLeft' : side === 'right' ? 'logs.sideRight' : 'logs.sideBoth'))
      break
    }
    case 'feed_bottle': {
      const amount = readAmountMl(payload)
      if (amount !== undefined) parts.push(`${amount} ml`)
      break
    }
    case 'diaper': {
      const kind = readDiaperKind(payload)
      if (kind !== undefined) {
        parts.push(t(kind === 'wet' ? 'logs.diaperWet' : kind === 'dirty' ? 'logs.diaperDirty' : 'logs.diaperBoth'))
      }
      break
    }
    case 'sleep': {
      const end = entry.endAt
      const minutes = end === undefined ? minutesBetween(entry.startAt, now) : minutesBetween(entry.startAt, end)
      parts.push(formatDuration(minutes))
      break
    }
    case 'temp': {
      const temp = readTempC(payload)
      if (temp !== undefined) parts.push(`${temp}°C`)
      break
    }
    default:
      break
  }

  const note = readString(payload, 'note')
  if (note !== undefined) parts.push(note)

  return parts.join(' · ')
}
