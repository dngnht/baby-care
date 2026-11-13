import { webcrypto } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { currentAuthor, useAuth } from '../store'
import { emptyRoster } from '../logic/caregivers'

if (globalThis.crypto?.subtle === undefined) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true })
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  useAuth.setState({ ready: false, roster: emptyRoster(), unlocked: false, active: null })
})

describe('auth store', () => {
  it('starts locked with no caregivers', () => {
    useAuth.getState().init()
    const state = useAuth.getState()
    expect(state.ready).toBe(true)
    expect(state.roster.caregivers).toHaveLength(0)
    expect(state.unlocked).toBe(false)
    expect(state.active).toBeNull()
    expect(currentAuthor()).toBe('parent')
  })

  it('signs the first caregiver up and stays unlocked', async () => {
    useAuth.getState().init()
    const result = await useAuth.getState().signUp('Mẹ Lan', '1234', '1234', true)
    expect(result).toBe('ok')

    const state = useAuth.getState()
    expect(state.unlocked).toBe(true)
    expect(state.active?.name).toBe('Mẹ Lan')
    expect(currentAuthor()).toBe('Mẹ Lan')
  })

  it('restores a remembered session on reload', async () => {
    useAuth.getState().init()
    await useAuth.getState().signUp('Mẹ Lan', '1234', '1234', true)

    useAuth.setState({ ready: false })
    useAuth.getState().init()
    expect(useAuth.getState().unlocked).toBe(true)
    expect(useAuth.getState().active?.name).toBe('Mẹ Lan')
  })

  it('locking ends the session, even after a reload', async () => {
    useAuth.getState().init()
    await useAuth.getState().signUp('Mẹ Lan', '1234', '1234', true)

    useAuth.getState().lock()
    expect(useAuth.getState().unlocked).toBe(false)
    expect(currentAuthor()).toBe('parent')

    useAuth.setState({ ready: false })
    useAuth.getState().init()
    expect(useAuth.getState().unlocked).toBe(false)
    expect(useAuth.getState().active).toBeNull()
  })

  it('rejects a wrong PIN and accepts the right one', async () => {
    useAuth.getState().init()
    await useAuth.getState().signUp('Mẹ Lan', '1234', '1234', true)
    const id = useAuth.getState().roster.caregivers[0]?.id ?? ''
    useAuth.getState().lock()

    expect(await useAuth.getState().signIn(id, '0000')).toBe('bad-pin')
    expect(useAuth.getState().unlocked).toBe(false)
    expect(await useAuth.getState().signIn(id, '1234')).toBe('ok')
    expect(useAuth.getState().unlocked).toBe(true)
  })

  it('adds a second caregiver without switching the active one', async () => {
    useAuth.getState().init()
    await useAuth.getState().signUp('Mẹ Lan', '1234', '1234', true)
    expect(await useAuth.getState().addCaregiver('Bố Hùng', '5678', '5678')).toBe('ok')

    const state = useAuth.getState()
    expect(state.roster.caregivers.map((entry) => entry.name)).toEqual(['Mẹ Lan', 'Bố Hùng'])
    expect(state.active?.name).toBe('Mẹ Lan')
    expect(await useAuth.getState().addCaregiver('Mẹ Lan', '1111', '1111')).toBe('duplicate')
  })

  it('refuses to remove the last caregiver and keeps the session consistent', async () => {
    useAuth.getState().init()
    await useAuth.getState().signUp('Mẹ Lan', '1234', '1234', true)
    await useAuth.getState().addCaregiver('Bố Hùng', '5678', '5678')

    const [first, second] = useAuth.getState().roster.caregivers
    expect(useAuth.getState().removeCaregiver(second?.id ?? '')).toBe('ok')
    expect(useAuth.getState().roster.caregivers).toHaveLength(1)
    expect(useAuth.getState().removeCaregiver(first?.id ?? '')).toBe('name')
  })

  it('updates the remember flag', async () => {
    useAuth.getState().init()
    await useAuth.getState().signUp('Mẹ Lan', '1234', '1234', true)
    useAuth.getState().setRemember(false)
    expect(useAuth.getState().roster.remember).toBe(false)
    expect(localStorage.getItem('beyeu.session.v1')).toBeNull()
  })
})
