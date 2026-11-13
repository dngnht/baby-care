import { create } from 'zustand'
import { getRepo } from '../db/repo'
import type { Baby } from '../db/schema'

/** LocalStorage key holding the id of the baby the app is currently showing. */
export const ACTIVE_BABY_STORAGE_KEY = 'beyeu.activeBabyId'

export type BabyStatus = 'loading' | 'ready' | 'missing'

interface ActiveBabyState {
  baby: Baby | null
  status: BabyStatus
  /** Load the active baby from IndexedDB (falls back to the first profile). */
  load: () => Promise<void>
  /** Persist a baby as the active one (used right after onboarding). */
  setBaby: (baby: Baby) => void
  /** Forget the active baby in memory and in local storage. */
  clear: () => void
}

function readStoredId(): string | null {
  try {
    return globalThis.localStorage?.getItem(ACTIVE_BABY_STORAGE_KEY) ?? null
  } catch {
    return null
  }
}

function writeStoredId(id: string | null): void {
  try {
    if (id === null) globalThis.localStorage?.removeItem(ACTIVE_BABY_STORAGE_KEY)
    else globalThis.localStorage?.setItem(ACTIVE_BABY_STORAGE_KEY, id)
  } catch {
    // Private mode / disabled storage: the app still works for the session.
  }
}

/**
 * Single active-baby store. M1 supports one baby profile; the multi-baby
 * family case is M4 (Supabase sync), so "last used profile wins" is enough.
 */
export const useActiveBaby = create<ActiveBabyState>((set) => ({
  baby: null,
  status: 'loading',

  async load() {
    try {
      const repo = getRepo()
      const babies = await repo.listBabies()
      const storedId = readStoredId()
      const active = babies.find((entry) => entry.id === storedId) ?? babies[0]
      if (active === undefined) {
        set({ baby: null, status: 'missing' })
        return
      }
      writeStoredId(active.id)
      set({ baby: active, status: 'ready' })
    } catch {
      set({ baby: null, status: 'missing' })
    }
  },

  setBaby(baby) {
    writeStoredId(baby.id)
    set({ baby, status: 'ready' })
  },

  clear() {
    writeStoredId(null)
    set({ baby: null, status: 'missing' })
  },
}))
