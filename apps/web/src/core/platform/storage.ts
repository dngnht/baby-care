// Platform abstraction for the Storage API (persistence + quota estimate).
//
// Why it matters: IndexedDB can be evicted by the browser, especially Safari
// after a period of inactivity. `navigator.storage.persist()` asks for
// "persistent" storage so the local-first database survives.
//
// NOTE: this module only exposes the primitives. Reminding the parent to back
// up weekly (`db/backup.ts`) is the responsibility of the UI (T041 / settings),
// not of this file.
//
// Every function is safe when the API is missing (old Safari, WebViews):
// it returns `false` / `null` and never throws.

/** Normalised storage quota information. Missing browser fields become 0. */
export interface StorageEstimate {
  /** Bytes currently used by this origin. */
  usage: number
  /** Bytes the origin may use before eviction / quota errors. */
  quota: number
}

function storageManager(): StorageManager | undefined {
  if (typeof navigator === 'undefined') return undefined
  if (typeof navigator.storage === 'undefined') return undefined
  return navigator.storage
}

/** True when `navigator.storage.persist()` exists. */
export function isPersistSupported(): boolean {
  const storage = storageManager()
  return storage !== undefined && typeof storage.persist === 'function'
}

/**
 * Ask the browser for persistent storage.
 *
 * Resolves `false` when unsupported, denied, or the request fails.
 */
export async function persist(): Promise<boolean> {
  const storage = storageManager()
  if (storage === undefined || typeof storage.persist !== 'function') return false

  try {
    return await storage.persist()
  } catch {
    return false
  }
}

/** Whether the origin is already persisted (granted earlier or by install). */
export async function isPersisted(): Promise<boolean> {
  const storage = storageManager()
  if (storage === undefined || typeof storage.persisted !== 'function') return false

  try {
    return await storage.persisted()
  } catch {
    return false
  }
}

/**
 * Current usage / quota in bytes, or `null` when the API is unavailable.
 * Browsers may omit `usage` or `quota`; those become 0 rather than `undefined`
 * so callers can do arithmetic without null checks.
 */
export async function estimate(): Promise<StorageEstimate | null> {
  const storage = storageManager()
  if (storage === undefined || typeof storage.estimate !== 'function') return null

  try {
    const result = await storage.estimate()
    return { usage: result.usage ?? 0, quota: result.quota ?? 0 }
  } catch {
    return null
  }
}
