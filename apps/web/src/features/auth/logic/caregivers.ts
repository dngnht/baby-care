/**
 * On-device caregiver roster + session.
 *
 * There is no server account: this is a local lock that lets several people
 * sharing one phone (mẹ, bố, ông bà, người giúp việc) sign in with a PIN so
 * every log records who entered it. Data stays in IndexedDB on the device.
 */
import { hashPin, isValidPin, verifyPin, type PinHash } from './pin'

export interface Caregiver extends PinHash {
  id: string
  name: string
  createdAt: string
}

export interface Roster {
  version: 1
  caregivers: Caregiver[]
  /** Last signed-in caregiver, shown first on the lock screen. */
  activeId: string | null
  /** Keep the session across app restarts (30 days). */
  remember: boolean
}

export const ROSTER_KEY = 'beyeu' + '.' + 'caregivers' + '.v1'
export const SESSION_KEY = 'beyeu.session.v1'
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const NAME_MAX_LENGTH = 24

export type AuthError = 'name' | 'pin' | 'pin-mismatch' | 'duplicate'

export interface Storages {
  local?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined
  session?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined
}

function readLocal(): Storage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}

function readSessionStore(): Storage | undefined {
  try {
    return globalThis.sessionStorage
  } catch {
    return undefined
  }
}

function defaultStorages(): Storages {
  return { local: readLocal(), session: readSessionStore() }
}

export function emptyRoster(): Roster {
  return { version: 1, caregivers: [], activeId: null, remember: true }
}

function isCaregiver(value: unknown): value is Caregiver {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    typeof record.name === 'string' &&
    typeof record.salt === 'string' &&
    typeof record.hash === 'string' &&
    typeof record.iterations === 'number' &&
    typeof record.createdAt === 'string'
  )
}

export function loadRoster(storages: Storages = defaultStorages()): Roster {
  const storage = storages.local ?? readLocal()
  try {
    const text = storage?.getItem(ROSTER_KEY)
    if (text === undefined || text === null) return emptyRoster()
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null) return emptyRoster()
    const record = parsed as Record<string, unknown>
    const caregivers = Array.isArray(record.caregivers) ? record.caregivers.filter(isCaregiver) : []
    return {
      version: 1,
      caregivers,
      activeId: typeof record.activeId === 'string' ? record.activeId : null,
      remember: record.remember !== false,
    }
  } catch {
    return emptyRoster()
  }
}

export function saveRoster(roster: Roster, storages: Storages = defaultStorages()): void {
  const storage = storages.local ?? readLocal()
  try {
    storage?.setItem(ROSTER_KEY, JSON.stringify(roster))
  } catch {
    // Quota / private mode: the roster just does not persist.
  }
}

export function normalizeName(name: string): string {
  return name.trim().slice(0, NAME_MAX_LENGTH)
}

export interface CreateCaregiverResult {
  roster: Roster
  caregiver: Caregiver
}

/** Add a caregiver; the caller supplies the PIN confirmation check. */
export async function createCaregiver(
  roster: Roster,
  name: string,
  pin: string,
  pinConfirm: string,
): Promise<CreateCaregiverResult | { error: AuthError }> {
  const clean = normalizeName(name)
  if (clean.length === 0) return { error: 'name' }
  if (!isValidPin(pin)) return { error: 'pin' }
  if (pin !== pinConfirm) return { error: 'pin-mismatch' }
  if (roster.caregivers.some((entry) => entry.name.toLowerCase() === clean.toLowerCase())) {
    return { error: 'duplicate' }
  }

  const hashed = await hashPin(pin)
  const caregiver: Caregiver = {
    id: crypto.randomUUID(),
    name: clean,
    createdAt: new Date().toISOString(),
    ...hashed,
  }
  return {
    roster: {
      ...roster,
      caregivers: [...roster.caregivers, caregiver],
      activeId: roster.activeId ?? caregiver.id,
    },
    caregiver,
  }
}

export async function checkCaregiverPin(caregiver: Caregiver, pin: string): Promise<boolean> {
  return verifyPin(pin, { salt: caregiver.salt, hash: caregiver.hash, iterations: caregiver.iterations })
}

export function findCaregiver(roster: Roster, id: string | null): Caregiver | undefined {
  if (id === null) return undefined
  return roster.caregivers.find((entry) => entry.id === id)
}

interface StoredSession {
  caregiverId: string
  /** Epoch ms; omitted for a tab-only session. */
  until?: number
}

/** Read the signed-in caregiver id, honouring the remember-device TTL. */
export function readSession(storages: Storages = defaultStorages()): string | null {
  const now = Date.now()
  const tab = storages.session ?? readSessionStore()
  try {
    const text = tab?.getItem(SESSION_KEY)
    if (text !== undefined && text !== null) {
      const parsed = JSON.parse(text) as StoredSession
      if (typeof parsed.caregiverId === 'string') return parsed.caregiverId
    }
  } catch {
    // ignore malformed session
  }

  const local = storages.local ?? readLocal()
  try {
    const text = local?.getItem(SESSION_KEY)
    if (text === undefined || text === null) return null
    const parsed = JSON.parse(text) as StoredSession
    if (typeof parsed.caregiverId !== 'string') return null
    if (parsed.until === undefined || parsed.until < now) {
      local?.removeItem(SESSION_KEY)
      return null
    }
    return parsed.caregiverId
  } catch {
    return null
  }
}

export function writeSession(
  caregiverId: string,
  remember: boolean,
  storages: Storages = defaultStorages(),
): void {
  const payload: StoredSession = remember
    ? { caregiverId, until: Date.now() + SESSION_TTL_MS }
    : { caregiverId }
  const tab = storages.session ?? readSessionStore()
  const local = storages.local ?? readLocal()
  try {
    tab?.setItem(SESSION_KEY, JSON.stringify(payload))
    if (remember) local?.setItem(SESSION_KEY, JSON.stringify(payload))
    else local?.removeItem(SESSION_KEY)
  } catch {
    // Session stays in memory for this page load only.
  }
}

export function clearSession(storages: Storages = defaultStorages()): void {
  const tab = storages.session ?? readSessionStore()
  const local = storages.local ?? readLocal()
  try {
    tab?.removeItem(SESSION_KEY)
    local?.removeItem(SESSION_KEY)
  } catch {
    // ignore
  }
}
