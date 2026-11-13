import { afterEach, describe, expect, it, vi } from 'vitest'
import { getLocale, setLocale, t } from './index'
import type { TranslationKey } from './index'
import messages from './vi.json'

describe('i18n', () => {
  afterEach(() => {
    setLocale('vi')
    vi.restoreAllMocks()
  })

  it('returns Vietnamese copy for a known key', () => {
    expect(t('home.feed')).toBe('Bú')
    expect(t('app.name')).toBe('BéYêu')
    expect(t('disclaimer')).toBe(
      'Thông tin chỉ mang tính tham khảo, không thay thế tư vấn của bác sĩ.',
    )
  })

  it('falls back to the key itself and warns in development when the key is missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(t('missing.key' as TranslationKey)).toBe('missing.key')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[i18n] Missing key'))
  })

  it('interpolates values into {placeholder} slots', () => {
    expect(t('common.greeting', { name: 'An' })).toBe('Chào An')
    expect(t('common.greeting', { name: 2 })).toBe('Chào 2')
  })

  it('keeps placeholders intact when a value is not supplied', () => {
    expect(t('common.greeting')).toBe('Chào {name}')
    expect(t('common.greeting', { other: 'An' })).toBe('Chào {name}')
  })

  it('defaults to the Vietnamese locale and exposes the locale setter', () => {
    expect(getLocale()).toBe('vi')
    setLocale('vi')
    expect(getLocale()).toBe('vi')
  })

  it('has no empty values in the dictionary', () => {
    const entries = Object.entries(messages)
    expect(entries.length).toBeGreaterThan(0)

    for (const [key, value] of entries) {
      expect(typeof value, key).toBe('string')
      expect(value.trim(), key).not.toBe('')
    }
  })

  it('has a key for every grouped namespace used by the UI', () => {
    for (const prefix of ['app.', 'common.', 'welcome.', 'home.', 'band.']) {
      expect(Object.keys(messages).some((key) => key.startsWith(prefix)), prefix).toBe(true)
    }
    expect(messages).toHaveProperty('disclaimer')
  })
})
