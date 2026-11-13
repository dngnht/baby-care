import { afterEach, describe, expect, it, vi } from 'vitest'
import { estimate, isPersistSupported, isPersisted, persist } from '../storage'

const originalStorage = Object.getOwnPropertyDescriptor(navigator, 'storage')

function stubStorage(value: unknown): void {
  Object.defineProperty(navigator, 'storage', { configurable: true, value })
}

afterEach(() => {
  if (originalStorage === undefined) {
    Reflect.deleteProperty(navigator, 'storage')
  } else {
    Object.defineProperty(navigator, 'storage', originalStorage)
  }
})

describe('storage', () => {
  it('degrades safely when navigator.storage is missing (old Safari)', async () => {
    stubStorage(undefined)

    expect(isPersistSupported()).toBe(false)
    await expect(persist()).resolves.toBe(false)
    await expect(isPersisted()).resolves.toBe(false)
    await expect(estimate()).resolves.toBeNull()
  })

  it('degrades safely when the individual methods are missing', async () => {
    stubStorage({})

    expect(isPersistSupported()).toBe(false)
    await expect(persist()).resolves.toBe(false)
    await expect(isPersisted()).resolves.toBe(false)
    await expect(estimate()).resolves.toBeNull()
  })

  it('reports persistence support and forwards the browser decision', async () => {
    stubStorage({ persist: vi.fn(async () => true) })
    expect(isPersistSupported()).toBe(true)
    await expect(persist()).resolves.toBe(true)

    stubStorage({ persist: vi.fn(async () => false) })
    await expect(persist()).resolves.toBe(false)
  })

  it('returns false instead of throwing when persist() rejects', async () => {
    stubStorage({
      persist: vi.fn(async () => {
        throw new Error('denied')
      }),
    })

    await expect(persist()).resolves.toBe(false)
  })

  it('reports whether the origin is already persisted', async () => {
    stubStorage({ persisted: vi.fn(async () => true) })
    await expect(isPersisted()).resolves.toBe(true)

    stubStorage({ persisted: vi.fn(async () => false) })
    await expect(isPersisted()).resolves.toBe(false)

    stubStorage({
      persisted: vi.fn(async () => {
        throw new Error('oops')
      }),
    })
    await expect(isPersisted()).resolves.toBe(false)
  })

  it('normalises the quota estimate and fills missing fields with 0', async () => {
    stubStorage({ estimate: vi.fn(async () => ({ usage: 1024, quota: 4096 })) })
    await expect(estimate()).resolves.toEqual({ usage: 1024, quota: 4096 })

    stubStorage({ estimate: vi.fn(async () => ({})) })
    await expect(estimate()).resolves.toEqual({ usage: 0, quota: 0 })

    stubStorage({ estimate: vi.fn(async () => ({ usage: 512 })) })
    await expect(estimate()).resolves.toEqual({ usage: 512, quota: 0 })
  })

  it('returns null when estimate() rejects', async () => {
    stubStorage({
      estimate: vi.fn(async () => {
        throw new Error('unsupported')
      }),
    })

    await expect(estimate()).resolves.toBeNull()
  })
})
