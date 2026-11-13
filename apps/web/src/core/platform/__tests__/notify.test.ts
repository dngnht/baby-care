import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPermission, isSupported, requestPermission, show } from '../notify'

interface ShownNotification {
  title: string
  options?: NotificationOptions
}

/**
 * Minimal `Notification` stand-in. `permission` and the static mock are
 * mutable so a single helper covers granted / denied / default.
 */
function fakeNotificationClass(permission: NotificationPermission) {
  return class FakeNotification {
    static permission: NotificationPermission = permission
    static shown: ShownNotification[] = []
    static requestPermission = vi.fn(
      async (): Promise<NotificationPermission> => FakeNotification.permission,
    )

    constructor(title: string, options?: NotificationOptions) {
      FakeNotification.shown.push(options === undefined ? { title } : { title, options })
    }

    close(): void {
      // No-op: the browser closes tag-replaced notifications itself.
    }
  }
}

const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker')

function stubServiceWorker(value: unknown): void {
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value })
}

afterEach(() => {
  if (originalServiceWorker === undefined) {
    Reflect.deleteProperty(navigator, 'serviceWorker')
  } else {
    Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker)
  }
  vi.unstubAllGlobals()
})

describe('notify', () => {
  it('reports unsupported and degrades gracefully when the API is missing', async () => {
    vi.stubGlobal('Notification', undefined)

    expect(isSupported()).toBe(false)
    expect(getPermission()).toBe('unsupported')
    expect(await requestPermission()).toBe('unsupported')
    expect(await show({ title: 'Hello', body: 'World' })).toBe(false)
  })

  it('reads the current permission', () => {
    vi.stubGlobal('Notification', fakeNotificationClass('granted'))
    expect(isSupported()).toBe(true)
    expect(getPermission()).toBe('granted')

    vi.stubGlobal('Notification', fakeNotificationClass('denied'))
    expect(getPermission()).toBe('denied')

    vi.stubGlobal('Notification', fakeNotificationClass('default'))
    expect(getPermission()).toBe('default')
  })

  it('requests permission and returns the browser answer', async () => {
    const FakeNotification = fakeNotificationClass('default')
    FakeNotification.requestPermission.mockResolvedValueOnce('granted')
    vi.stubGlobal('Notification', FakeNotification)

    await expect(requestPermission()).resolves.toBe('granted')
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1)
  })

  it('does not re-prompt when permission is already granted', async () => {
    const FakeNotification = fakeNotificationClass('granted')
    vi.stubGlobal('Notification', FakeNotification)

    await expect(requestPermission()).resolves.toBe('granted')
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled()
  })

  it('never throws when the permission request is rejected', async () => {
    const FakeNotification = fakeNotificationClass('denied')
    FakeNotification.requestPermission.mockRejectedValueOnce(new Error('blocked by policy'))
    vi.stubGlobal('Notification', FakeNotification)

    await expect(requestPermission()).resolves.toBe('denied')
  })

  it('shows a notification through the Notification constructor when granted', async () => {
    const FakeNotification = fakeNotificationClass('granted')
    vi.stubGlobal('Notification', FakeNotification)

    const ok = await show({ title: 'Vaccine due', body: 'BCG at 9 months', tag: 'vax', data: { id: 7 } })

    expect(ok).toBe(true)
    expect(FakeNotification.shown).toEqual([
      {
        title: 'Vaccine due',
        options: { body: 'BCG at 9 months', tag: 'vax', data: { id: 7 } },
      },
    ])
  })

  it('prefers the service worker registration when one is available', async () => {
    const FakeNotification = fakeNotificationClass('granted')
    vi.stubGlobal('Notification', FakeNotification)
    const showNotification = vi.fn(async () => undefined)
    stubServiceWorker({ getRegistration: vi.fn(async () => ({ showNotification })) })

    const ok = await show({ title: 'Nap reminder', body: 'Time to sleep' })

    expect(ok).toBe(true)
    expect(showNotification).toHaveBeenCalledWith('Nap reminder', { body: 'Time to sleep' })
    expect(FakeNotification.shown).toHaveLength(0)
  })

  it('returns false without showing anything when permission is denied', async () => {
    const FakeNotification = fakeNotificationClass('denied')
    vi.stubGlobal('Notification', FakeNotification)

    await expect(show({ title: 'Hi', body: 'There' })).resolves.toBe(false)
    expect(FakeNotification.shown).toHaveLength(0)
  })

  it('returns false when the constructor throws (e.g. blocked at runtime)', async () => {
    class ThrowingNotification {
      static permission: NotificationPermission = 'granted'
      static requestPermission = vi.fn(async (): Promise<NotificationPermission> => 'granted')

      constructor() {
        throw new Error('not allowed')
      }
    }
    vi.stubGlobal('Notification', ThrowingNotification)

    await expect(show({ title: 'Hi', body: 'There' })).resolves.toBe(false)
  })

  it('falls back to the constructor when the service worker path fails', async () => {
    const FakeNotification = fakeNotificationClass('granted')
    vi.stubGlobal('Notification', FakeNotification)
    stubServiceWorker({
      getRegistration: vi.fn(async () => ({
        showNotification: vi.fn(async () => {
          throw new Error('no active worker')
        }),
      })),
    })

    await expect(show({ title: 'Hi', body: 'There' })).resolves.toBe(true)
    expect(FakeNotification.shown).toHaveLength(1)
  })
})
