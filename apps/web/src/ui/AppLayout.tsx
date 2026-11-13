import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useActiveBaby } from '../core/baby/activeBaby'
import { t } from '../core/i18n'
import { LockScreen } from '../features/auth/components/LockScreen'
import { useAuth } from '../features/auth/store'
import { BottomNav } from './BottomNav'
import { Screen } from './Screen'

/**
 * Shell for the signed-in (profile-created) part of the app.
 *
 * Gate order matters: caregiver login first (nobody sees the app without a
 * PIN), then the baby profile, then the tabbed content.
 */
export function AppLayout() {
  const authReady = useAuth((state) => state.ready)
  const unlocked = useAuth((state) => state.unlocked)
  const hasCaregivers = useAuth((state) => state.roster.caregivers.length > 0)
  const initAuth = useAuth((state) => state.init)

  const status = useActiveBaby((state) => state.status)
  const load = useActiveBaby((state) => state.load)

  useEffect(() => {
    if (!authReady) initAuth()
  }, [authReady, initAuth])

  useEffect(() => {
    if (status === 'loading' && unlocked) void load()
  }, [status, load, unlocked])

  if (!authReady) {
    return (
      <Screen withNav={false}>
        <p className="mt-24 text-center text-sm text-mist">{t('common.loading')}</p>
      </Screen>
    )
  }

  if (!hasCaregivers) {
    return <Navigate to="/welcome" replace />
  }

  if (!unlocked) {
    return <LockScreen />
  }

  if (status === 'loading') {
    return (
      <Screen withNav={false}>
        <p className="mt-24 text-center text-sm text-mist">{t('common.loading')}</p>
      </Screen>
    )
  }

  if (status === 'missing') {
    return <Navigate to="/onboarding" replace />
  }

  return (
    <div className="min-h-dvh bg-night text-cream">
      <Outlet />
      <BottomNav />
    </div>
  )
}
