import { create } from 'zustand'
import {
  checkCaregiverPin,
  clearSession,
  createCaregiver,
  emptyRoster,
  findCaregiver,
  loadRoster,
  readSession,
  saveRoster,
  writeSession,
  type AuthError,
  type Caregiver,
  type Roster,
} from './logic/caregivers'

export type AuthResult = 'ok' | AuthError | 'bad-pin'

interface AuthState {
  ready: boolean
  roster: Roster
  unlocked: boolean
  active: Caregiver | null
  /** Load the roster and restore a remembered session (sync). */
  init: () => void
  signUp: (name: string, pin: string, pinConfirm: string, remember: boolean) => Promise<AuthResult>
  signIn: (caregiverId: string, pin: string) => Promise<AuthResult>
  lock: () => void
  addCaregiver: (name: string, pin: string, pinConfirm: string) => Promise<AuthResult>
  removeCaregiver: (caregiverId: string) => AuthResult
  setRemember: (remember: boolean) => void
  setActive: (caregiverId: string) => void
}

/**
 * Caregiver session for a single device.
 *
 * `ready` gates the UI: before `init()` runs we cannot know whether this is a
 * first run (roster empty) or a locked app.
 */
export const useAuth = create<AuthState>((set, get) => ({
  ready: false,
  roster: emptyRoster(),
  unlocked: false,
  active: null,

  init() {
    const roster = loadRoster()
    const sessionId = readSession()
    const active = findCaregiver(roster, sessionId) ?? findCaregiver(roster, roster.activeId)
    const unlocked = active !== undefined && sessionId !== null && sessionId === active.id
    const nextRoster = active === undefined ? roster : { ...roster, activeId: active.id }
    set({ ready: true, roster: nextRoster, active: unlocked ? active : null, unlocked })
  },

  async signUp(name, pin, pinConfirm, remember) {
    const result = await createCaregiver(get().roster, name, pin, pinConfirm)
    if ('error' in result) return result.error

    const roster: Roster = { ...result.roster, remember }
    saveRoster(roster)
    writeSession(result.caregiver.id, remember)
    set({ roster, active: result.caregiver, unlocked: true })
    return 'ok'
  },

  async signIn(caregiverId, pin) {
    const { roster } = get()
    const caregiver = findCaregiver(roster, caregiverId)
    if (caregiver === undefined) return 'bad-pin'
    if (!(await checkCaregiverPin(caregiver, pin))) return 'bad-pin'

    const nextRoster: Roster = { ...roster, activeId: caregiver.id }
    saveRoster(nextRoster)
    writeSession(caregiver.id, nextRoster.remember)
    set({ roster: nextRoster, active: caregiver, unlocked: true })
    return 'ok'
  },

  lock() {
    clearSession()
    set({ unlocked: false, active: null })
  },

  async addCaregiver(name, pin, pinConfirm) {
    const result = await createCaregiver(get().roster, name, pin, pinConfirm)
    if ('error' in result) return result.error

    saveRoster(result.roster)
    set({ roster: result.roster })
    return 'ok'
  },

  removeCaregiver(caregiverId) {
    const { roster } = get()
    if (roster.caregivers.length <= 1) return 'name'
    const caregivers = roster.caregivers.filter((entry) => entry.id !== caregiverId)
    const activeId = roster.activeId === caregiverId ? (caregivers[0]?.id ?? null) : roster.activeId
    const nextRoster: Roster = { ...roster, caregivers, activeId }
    saveRoster(nextRoster)

    const active = findCaregiver(nextRoster, activeId)
    if (active === undefined) {
      clearSession()
      set({ roster: nextRoster, active: null, unlocked: false })
    } else {
      set({ roster: nextRoster, active: get().unlocked ? active : null })
    }
    return 'ok'
  },

  setRemember(remember) {
    const roster: Roster = { ...get().roster, remember }
    saveRoster(roster)
    const active = get().active
    if (active !== null && get().unlocked) writeSession(active.id, remember)
    set({ roster })
  },

  setActive(caregiverId) {
    const { roster } = get()
    const active = findCaregiver(roster, caregiverId)
    if (active === undefined) return
    saveRoster({ ...roster, activeId: active.id })
    set({ roster: { ...roster, activeId: active.id } })
  },
}))

/** Author written into every log created right now. */
export function currentAuthor(): string {
  const active = useAuth.getState().active
  return active?.name ?? 'parent'
}
