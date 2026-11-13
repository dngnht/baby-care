import type { LogType } from '../../core/db/schema'
import type { TranslationKey } from '../../core/i18n'

export type LogGroup = 'feed' | 'solid' | 'diaper' | 'sleep' | 'temp' | 'other'

export interface LogTypeMeta {
  type: LogType
  labelKey: TranslationKey
  group: LogGroup
  /** Whether this log type is normally tracked with a running timer. */
  timer: boolean
  /** Tailwind text colour token used for the dot / accent. */
  accent: string
}

export const LOG_TYPE_META: Readonly<Record<LogType, LogTypeMeta>> = {
  feed_breast: { type: 'feed_breast', labelKey: 'logs.type.feed_breast', group: 'feed', timer: true, accent: 'text-honey' },
  feed_bottle: { type: 'feed_bottle', labelKey: 'logs.type.feed_bottle', group: 'feed', timer: false, accent: 'text-honey' },
  solid: { type: 'solid', labelKey: 'logs.type.solid', group: 'solid', timer: false, accent: 'text-honey' },
  diaper: { type: 'diaper', labelKey: 'logs.type.diaper', group: 'diaper', timer: false, accent: 'text-[#8fb8a8]' },
  sleep: { type: 'sleep', labelKey: 'logs.type.sleep', group: 'sleep', timer: true, accent: 'text-[#9c9cd8]' },
  temp: { type: 'temp', labelKey: 'logs.type.temp', group: 'temp', timer: false, accent: 'text-ember' },
  med: { type: 'med', labelKey: 'logs.type.med', group: 'other', timer: false, accent: 'text-mist' },
  symptom: { type: 'symptom', labelKey: 'logs.type.symptom', group: 'other', timer: false, accent: 'text-ember' },
  note: { type: 'note', labelKey: 'logs.type.note', group: 'other', timer: false, accent: 'text-mist' },
}

export const LOG_TYPES: readonly LogType[] = Object.keys(LOG_TYPE_META) as LogType[]

export function logMeta(type: LogType): LogTypeMeta {
  return LOG_TYPE_META[type]
}

/** Feed types counted as "cữ bú" (bottle included, solid excluded). */
export const FEED_TYPES: readonly LogType[] = ['feed_breast', 'feed_bottle']
