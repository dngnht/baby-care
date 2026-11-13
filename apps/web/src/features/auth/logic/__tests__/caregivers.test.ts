import { webcrypto } from 'node:crypto'
import { describe, expect, it } from 'vitest'
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
  type Storages,
} from '../caregivers'

if (globalThis.crypto?.subtle === undefined) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
}

function fakeStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & {
  dump: () => Record<string, string>
} {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
    dump: () => Object.fromEntries(data),
  }
}

function storages(): Required<Storages> & { local: ReturnType<typeof fakeStorage>; session: ReturnType<typeof fakeStorage> } {
  const local = fakeStorage()
  const session = fakeStorage()
  return { local, session }
}

describe('roster', () => {
  it('creates the first caregiver and makes it active', async () => {
    const result = await createCaregiver(emptyRoster(), '  Mẹ Lan  ', '1234', '1234')
    expect('error' in result).toBe(false)
    if ('error' in result) return

    expect(result.caregiver.name).toBe('Mẹ Lan')
    expect(result.roster.caregivers).toHaveLength(1)
    expect(result.roster.activeId).toBe(result.caregiver.id)
    expect(await checkCaregiverPin(result.caregiver, '1234')).toBe(true)
    expect(await checkCaregiverPin(result.caregiver, '9999')).toBe(false)
  })

  it('rejects invalid names, PINs, mismatches and duplicate names', async () => {
    const first = await createCaregiver(emptyRoster(), 'Mẹ', '1234', '1234')
    if ('error' in first) throw new Error('setup failed')

    expect(await createCaregiver(emptyRoster(), '   ', '1234', '1234')).toEqual({ error: 'name' })
    expect(await createCaregiver(emptyRoster(), 'Bố', '12', '12')).toEqual({ error: 'pin' })
    expect(await createCaregiver(emptyRoster(), 'Bố', '1234', '4321')).toEqual({
      error: 'pin-mismatch',
    })
    expect(await createCaregiver(first.roster, 'mẹ', '5555', '5555')).toEqual({ error: 'duplicate' })
  })

  it('round-trips through storage and tolerates bad data', () => {
    const store = storages()
    const roster = { ...emptyRoster(), remember: false, activeId: 'abc' }
    saveRoster(roster, store)
    expect(loadRoster(store)).toEqual(roster)

    store.local.setItem('beyeu.caregivers.v1', '{not json')
    expect(loadRoster(store)).toEqual(emptyRoster())

    store.local.setItem('beyeu.caregivers.v1', JSON.stringify({ caregivers: [{ id: 1 }] }))
    expect(loadRoster(store).caregivers).toEqual([])
  })

  it('finds caregivers by id', async () => {
    const created = await createCaregiver(emptyRoster(), 'Bố', '1234', '1234')
    if ('error' in created) throw new Error('setup failed')
    expect(findCaregiver(created.roster, created.caregiver.id)?.name).toBe('Bố')
    expect(findCaregiver(created.roster, 'nope')).toBeUndefined()
    expect(findCaregiver(created.roster, null)).toBeUndefined()
  })
})

describe('session', () => {
  it('keeps a remembered session in both storages', () => {
    const store = storages()
    writeSession('caregiver-1', true, store)
    expect(readSession(store)).toBe('caregiver-1')
    expect(store.local.dump()['beyeu.session.v1']).toBeDefined()
  })

  it('keeps a tab-only session out of local storage', () => {
    const store = storages()
    writeSession('caregiver-1', false, store)
    expect(readSession(store)).toBe('caregiver-1')
    expect(store.local.dump()['beyeu.session.v1']).toBeUndefined()
  })

  it('expires a remembered session after its TTL', () => {
    const store = storages()
    writeSession('caregiver-1', true, store)
    store.local.setItem(
      'beyeu.session.v1',
      JSON.stringify({ caregiverId: 'caregiver-1', until: Date.now() - 1000 }),
    )
    store.session.removeItem('beyeu.session.v1')
    expect(readSession(store)).toBeNull()
  })

  it('clears both storages', () => {
    const store = storages()
    writeSession('caregiver-1', true, store)
    clearSession(store)
    expect(readSession(store)).toBeNull()
    expect(store.local.dump()['beyeu.session.v1']).toBeUndefined()
  })

  it('ignores malformed session payloads', () => {
    const store = storages()
    store.session.setItem('beyeu.session.v1', 'nope')
    expect(readSession(store)).toBeNull()
  })
})
