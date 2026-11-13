import { afterEach, describe, expect, it } from 'vitest'
import {
  CONSENT_KEY,
  DELETE_CONFIRM_WORD,
  canImport,
  hasConsent,
  isDeleteConfirmed,
  setConsent,
} from '../consent'

interface FakeStorage {
  data: Map<string, string>
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

function createStorage(initial: Record<string, string> = {}): FakeStorage {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    },
  }
}

const throwingStorage = {
  getItem: () => {
    throw new Error('storage disabled')
  },
  setItem: () => {
    throw new Error('storage disabled')
  },
  removeItem: () => {
    throw new Error('storage disabled')
  },
}

afterEach(() => {
  window.localStorage.clear()
})

describe('CONSENT_KEY', () => {
  it('is the versioned app key', () => {
    expect(CONSENT_KEY).toBe('beyeu.consent.v1')
  })
})

describe('hasConsent', () => {
  it('is false by default (no stored value)', () => {
    expect(hasConsent(createStorage())).toBe(false)
  })

  it('is true only when the stored value is "1"', () => {
    expect(hasConsent(createStorage({ [CONSENT_KEY]: '1' }))).toBe(true)
    expect(hasConsent(createStorage({ [CONSENT_KEY]: '0' }))).toBe(false)
    expect(hasConsent(createStorage({ [CONSENT_KEY]: 'true' }))).toBe(false)
  })

  it('falls back to window.localStorage when no storage is passed', () => {
    expect(hasConsent()).toBe(false)
    setConsent(true)
    expect(hasConsent()).toBe(true)
  })

  it('returns false when storage throws', () => {
    expect(hasConsent(throwingStorage)).toBe(false)
  })

  it('returns false when storage is unavailable', () => {
    expect(hasConsent(undefined)).toBe(false)
  })
})

describe('setConsent', () => {
  it('stores "1" when consent is granted', () => {
    const storage = createStorage()
    setConsent(true, storage)
    expect(storage.data.get(CONSENT_KEY)).toBe('1')
    expect(hasConsent(storage)).toBe(true)
  })

  it('removes the key when consent is withdrawn', () => {
    const storage = createStorage({ [CONSENT_KEY]: '1' })
    setConsent(false, storage)
    expect(storage.data.has(CONSENT_KEY)).toBe(false)
    expect(hasConsent(storage)).toBe(false)
  })

  it('round-trips through the default storage', () => {
    setConsent(true)
    expect(window.localStorage.getItem(CONSENT_KEY)).toBe('1')
    setConsent(false)
    expect(window.localStorage.getItem(CONSENT_KEY)).toBeNull()
  })

  it('never throws when storage fails', () => {
    expect(() => {
      setConsent(true, throwingStorage)
    }).not.toThrow()
    expect(() => {
      setConsent(false, throwingStorage)
    }).not.toThrow()
  })
})

describe('isDeleteConfirmed', () => {
  it('accepts the word with any casing and surrounding spaces', () => {
    expect(DELETE_CONFIRM_WORD).toBe('XOA')
    expect(isDeleteConfirmed('XOA')).toBe(true)
    expect(isDeleteConfirmed(' xoa ')).toBe(true)
    expect(isDeleteConfirmed('Xoa ')).toBe(true)
    expect(isDeleteConfirmed('\txOa\n')).toBe(true)
  })

  it('rejects wrong words, accents and partial input', () => {
    expect(isDeleteConfirmed('XOÁ')).toBe(false)
    expect(isDeleteConfirmed('x')).toBe(false)
    expect(isDeleteConfirmed('')).toBe(false)
    expect(isDeleteConfirmed('   ')).toBe(false)
    expect(isDeleteConfirmed('XOA XOA')).toBe(false)
    expect(isDeleteConfirmed('DELETE')).toBe(false)
  })
})

describe('canImport', () => {
  it('is ok with consent and a file', () => {
    expect(canImport(true, true)).toEqual({ ok: true })
  })

  it('blocks without consent, even with a file', () => {
    expect(canImport(false, true)).toEqual({ ok: false, reason: 'consent' })
    expect(canImport(false, false)).toEqual({ ok: false, reason: 'consent' })
  })

  it('asks for a file when consent is given', () => {
    expect(canImport(true, false)).toEqual({ ok: false, reason: 'file' })
  })
})
