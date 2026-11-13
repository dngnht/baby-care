// Platform abstraction for local notifications (Web first, Capacitor later).
//
// Feature code must never touch `Notification`, `navigator.serviceWorker` or
// any other native notification API directly: this file is the single seam.
// When the app is wrapped with Capacitor (T050) only this module changes, to
// `@capacitor/local-notifications`.
//
// Scope: local, in-page notifications only. No Web Push, no server, no
// subscription endpoints - the app is local-first and has no backend for this.

/** Normalised permission state, including the "no API at all" case. */
export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported'

/** Content of one notification. `data` is opaque to the platform layer. */
export interface ShowNotificationInput {
  title: string
  body: string
  /** Replaces a previous notification with the same tag instead of stacking. */
  tag?: string
  /** Handed back to the service worker `notificationclick` handler. */
  data?: unknown
}

/**
 * Read the Notification constructor, or `undefined` when the browser has no
 * Notification API (old Safari, some WebViews).
 *
 * `typeof ... === 'function'` is used instead of `'Notification' in window`
 * because the property can exist with an undefined value.
 */
function notificationApi(): typeof Notification | undefined {
  if (typeof window === 'undefined') return undefined
  const api: typeof Notification | undefined = window.Notification
  return typeof api === 'function' ? api : undefined
}

/** True when this browser exposes the Notification API at all. */
export function isSupported(): boolean {
  return notificationApi() !== undefined
}

/**
 * Current permission. Returns `'unsupported'` when the API is missing so
 * callers never need a separate `isSupported()` check.
 */
export function getPermission(): NotificationPermissionState {
  const api = notificationApi()
  if (api === undefined) return 'unsupported'

  // Read through `string`: some browsers return vendor values.
  const permission: string = api.permission
  if (permission === 'granted' || permission === 'denied' || permission === 'default') {
    return permission
  }
  return 'default'
}

/**
 * Ask the user for permission.
 *
 * Never throws: a rejected promise (no user gesture, prompt dismissed, policy
 * blocked) resolves to the current permission instead.
 */
export async function requestPermission(): Promise<NotificationPermissionState> {
  const api = notificationApi()
  if (api === undefined) return 'unsupported'
  if (getPermission() === 'granted') return 'granted'

  try {
    // Legacy Safari returns `undefined` and takes a callback; awaiting
    // `undefined` simply resolves, and we fall back to re-reading permission.
    const result: NotificationPermission | undefined = await api.requestPermission()
    if (result === 'granted' || result === 'denied' || result === 'default') return result
    return getPermission()
  } catch {
    return getPermission()
  }
}

/**
 * The service worker registration that can display notifications, if any.
 * `navigator.serviceWorker.ready` is deliberately not used: it never settles
 * when no worker is registered.
 */
async function activeRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  if (typeof navigator === 'undefined' || typeof navigator.serviceWorker === 'undefined') {
    return undefined
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration()
    if (registration === undefined) return undefined
    return typeof registration.showNotification === 'function' ? registration : undefined
  } catch {
    return undefined
  }
}

/**
 * Display a notification.
 *
 * Returns `false` (and does nothing) when the API is missing or permission was
 * not granted. Prefers `ServiceWorkerRegistration.showNotification` so the
 * notification also works while the PWA is in the background, then falls back
 * to the page-scoped `new Notification(...)` constructor.
 */
export async function show(input: ShowNotificationInput): Promise<boolean> {
  const api = notificationApi()
  if (api === undefined || getPermission() !== 'granted') return false

  const options: NotificationOptions = { body: input.body }
  if (input.tag !== undefined) options.tag = input.tag
  if (input.data !== undefined) options.data = input.data

  const registration = await activeRegistration()
  if (registration !== undefined) {
    try {
      await registration.showNotification(input.title, options)
      return true
    } catch {
      // Some browsers require an active service worker; fall through.
    }
  }

  try {
    // The instance is intentionally not kept: `tag` handles replacement.
    new api(input.title, options)
    return true
  } catch {
    return false
  }
}
