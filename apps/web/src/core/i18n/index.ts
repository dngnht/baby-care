import vi from './vi.json'

/**
 * The key set is derived from `vi.json`, which is the single source of truth.
 * A typo in a `t('...')` call therefore fails `tsc` instead of shipping a
 * missing label.
 */
export type TranslationKey = keyof typeof vi

/** Shape every locale dictionary must implement. */
export type Messages = Readonly<Record<TranslationKey, string>>

/**
 * Values interpolated into `{placeholder}` slots of a message,
 * e.g. `t('common.greeting', { name: 'An' })` -> "Chào An".
 */
export type TranslationValues = Readonly<Record<string, string | number>>

/**
 * Locales bundled with the app. Only Vietnamese ships today, but the shape is
 * already `Record<Locale, Messages>`, so adding a locale is a one-line change
 * (add the dictionary here and widen `Locale`).
 */
const dictionaries = { vi } as const satisfies Readonly<Record<string, Messages>>

export type Locale = keyof typeof dictionaries

const FALLBACK_LOCALE: Locale = 'vi'

let currentLocale: Locale = FALLBACK_LOCALE

export function getLocale(): Locale {
  return currentLocale
}

export function setLocale(locale: Locale): void {
  currentLocale = locale
}

const PLACEHOLDER = /\{(\w+)\}/g

/** Replace `{name}` slots with the supplied values; keep unknown slots intact. */
function interpolate(template: string, values?: TranslationValues): string {
  if (values === undefined) return template

  return template.replace(PLACEHOLDER, (match: string, name: string) => {
    const value = values[name]
    return value === undefined ? match : String(value)
  })
}

function lookup(locale: Locale, key: TranslationKey): string | undefined {
  const dictionary: Readonly<Record<string, string>> = dictionaries[locale]
  return dictionary[key]
}

/**
 * Look up a Vietnamese UI string, optionally interpolating `{placeholder}`s.
 *
 * At runtime an unknown key falls back to the key itself (so a missing
 * translation is obvious on screen rather than silently blank) and warns in
 * development.
 */
export function t(key: TranslationKey, values?: TranslationValues): string {
  const template = lookup(currentLocale, key)

  if (template === undefined) {
    if (import.meta.env.DEV) {
      console.warn(`[i18n] Missing key "${key}" for locale "${currentLocale}"`)
    }
    return key
  }

  return interpolate(template, values)
}
