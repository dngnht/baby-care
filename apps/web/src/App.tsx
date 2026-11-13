import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthWelcomePage } from './features/auth/pages/AuthWelcomePage'
import { DashboardPage } from './features/dashboard/pages/DashboardPage'
import { HomePage } from './features/home/pages/HomePage'
import { MorePage } from './features/more/pages/MorePage'
import { OnboardingPage } from './features/profile/pages/OnboardingPage'
import { TimelinePage } from './features/timeline/pages/TimelinePage'
import { t } from './core/i18n'
import { AppLayout } from './ui/AppLayout'
import { Screen } from './ui/Screen'

// Growth pulls the WHO LMS tables (~300 KB of JSON) and the chart library, so
// it is split out of the first-load bundle.
const GrowthPage = lazy(() =>
  import('./features/growth/pages/GrowthPage').then((module) => ({ default: module.GrowthPage })),
)
const VaccinesPage = lazy(() =>
  import('./features/vaccines/pages/VaccinesPage').then((module) => ({ default: module.VaccinesPage })),
)
const MilestonesPage = lazy(() =>
  import('./features/milestones/pages/MilestonesPage').then((module) => ({ default: module.MilestonesPage })),
)
const RemindersPage = lazy(() =>
  import('./features/reminders/pages/RemindersPage').then((module) => ({ default: module.RemindersPage })),
)
const IllnessPage = lazy(() =>
  import('./features/illness/pages/IllnessPage').then((module) => ({ default: module.IllnessPage })),
)
const ReportPage = lazy(() =>
  import('./features/report/pages/ReportPage').then((module) => ({ default: module.ReportPage })),
)
const PrivacyPage = lazy(() =>
  import('./features/privacy/pages/PrivacyPage').then((module) => ({ default: module.PrivacyPage })),
)
const CaregiversPage = lazy(() =>
  import('./features/auth/pages/CaregiversPage').then((module) => ({ default: module.CaregiversPage })),
)

function RouteFallback() {
  return (
    <Screen>
      <p className="mt-24 text-center text-sm text-mist">{t('common.loading')}</p>
    </Screen>
  )
}

export function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/welcome" element={<AuthWelcomePage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/growth" element={<GrowthPage />} />
          <Route path="/vaccines" element={<VaccinesPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/more" element={<MorePage />} />
          <Route path="/milestones" element={<MilestonesPage />} />
          <Route path="/reminders" element={<RemindersPage />} />
          <Route path="/illness" element={<IllnessPage />} />
          <Route path="/report" element={<ReportPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/caregivers" element={<CaregiversPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
