import { webcrypto } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { hashPin, isValidPin, randomSalt, verifyPin } from '../pin'

// jsdom ships a `crypto` without `subtle`; the pin helpers need WebCrypto.
if (globalThis.crypto?.subtle === undefined) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
}

describe('isValidPin', () => {
  it('accepts 4 to 6 digits only', () => {
    expect(isValidPin('1234')).toBe(true)
    expect(isValidPin('123456')).toBe(true)
    expect(isValidPin('123')).toBe(false)
    expect(isValidPin('1234567')).toBe(false)
    expect(isValidPin('12a4')).toBe(false)
    expect(isValidPin('')).toBe(false)
  })
})

describe('hashPin / verifyPin', () => {
  it('verifies the right PIN and rejects others', async () => {
    const stored = await hashPin('4821')
    expect(stored.hash).not.toContain('4821')
    expect(stored.hash.length).toBeGreaterThan(20)
    expect(await verifyPin('4821', stored)).toBe(true)
    expect(await verifyPin('4822', stored)).toBe(false)
  })

  it('uses a fresh salt every time', async () => {
    const first = await hashPin('4821')
    const second = await hashPin('4821')
    expect(first.salt).not.toBe(second.salt)
    expect(first.hash).not.toBe(second.hash)
  })

  it('rejects malformed PINs without hashing', async () => {
    await expect(hashPin('12')).rejects.toThrow(/4-6 digits/)
    await expect(hashPin('abcd')).rejects.toThrow()
    const stored = await hashPin('4821')
    expect(await verifyPin('nope', stored)).toBe(false)
  })

  it('produces a base64 salt', () => {
    expect(randomSalt()).toMatch(/^[A-Za-z0-9+/]+={0,2}$/)
  })
})
