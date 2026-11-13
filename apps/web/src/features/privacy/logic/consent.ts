// Consent + destructive-action rules for the privacy screen (T045).
//
// Pure helpers (no React, no repository) so they can be unit tested and reused
// by the page. Storage access is injected and every call is guarded: private
// mode / disabled storage must never crash the screen.

/** LocalStorage key holding the parent's data-handling acknowledgement. */
export const CONSENT_KEY = 'beyeu.consent.v1'

/** Stored value when consent is given; the key is removed otherwise. */
export const CONSENT_VALUE = '1'

/** Word the parent must type to confirm deleting all local data. */
export const DELETE_CONFIRM_WORD = 'XOA'

export type ConsentReader = Pick<Storage, 'getItem'>
export type ConsentWriter = Pick<Storage, 'setItem' | 'removeItem'>

/** The browser storage, or `undefined` when access itself throws. */
function defaultStorage(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

/** True when the parent has explicitly acknowledged the local-only storage. */
export function hasConsent(storage: ConsentReader | undefined = defaultStorage()): boolean {
  if (storage === undefined) return false
  try {
    return storage.getItem(CONSENT_KEY) === CONSENT_VALUE
  } catch {
    return false
  }
}

/** Grant (`true`) or withdraw (`false`) consent; failures are non-fatal. */
export function setConsent(value: boolean, storage: ConsentWriter | undefined = defaultStorage()): void {
  if (storage === undefined) return
  try {
    if (value) storage.setItem(CONSENT_KEY, CONSENT_VALUE)
    else storage.removeItem(CONSENT_KEY)
  } catch {
    // Private mode / quota errors: the checkbox still works for this session.
  }
}

/**
 * Whether the typed confirmation matches the delete word.
 *
 * Trims and upper-cases, so " xoa ", "XOA" and "Xoa " all pass, while "XOÁ"
 * (wrong letter) and partial words fail.
 */
export function isDeleteConfirmed(input: string): boolean {
  return input.trim().toUpperCase() === DELETE_CONFIRM_WORD
}

export type CanImportReason = 'consent' | 'file'

export interface CanImportResult {
  ok: boolean
  reason?: CanImportReason
}

/** Import needs both an acknowledgement and a chosen file, in that order. */
export function canImport(consent: boolean, hasFile: boolean): CanImportResult {
  if (!consent) return { ok: false, reason: 'consent' }
  if (!hasFile) return { ok: false, reason: 'file' }
  return { ok: true }
}
