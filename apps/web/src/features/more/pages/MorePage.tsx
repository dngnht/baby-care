import { Link } from 'react-router-dom'
import { t, type TranslationKey } from '../../../core/i18n'
import { Screen } from '../../../ui/Screen'

interface MenuItem {
  to: string
  titleKey: TranslationKey
  hintKey: TranslationKey
  icon: 'caregiver' | 'milestone' | 'bell' | 'thermo' | 'print' | 'lock'
}

const ITEMS: readonly MenuItem[] = [
  { to: '/caregivers', titleKey: 'auth.caregivers', hintKey: 'auth.caregiversHint', icon: 'caregiver' },
  { to: '/milestones', titleKey: 'more.milestones', hintKey: 'more.milestonesHint', icon: 'milestone' },
  { to: '/reminders', titleKey: 'more.reminders', hintKey: 'more.remindersHint', icon: 'bell' },
  { to: '/illness', titleKey: 'more.illness', hintKey: 'more.illnessHint', icon: 'thermo' },
  { to: '/report', titleKey: 'more.report', hintKey: 'more.reportHint', icon: 'print' },
  { to: '/privacy', titleKey: 'more.privacy', hintKey: 'more.privacyHint', icon: 'lock' },
]

const PATHS: Record<MenuItem['icon'], readonly string[]> = {
  caregiver: ['M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z', 'M4.5 20a7.5 7.5 0 0 1 15 0'],
  milestone: ['M5 19V9M11 19V5M17 19v-7', 'M3 19h18'],
  bell: ['M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7', 'M10 20a2 2 0 0 0 4 0'],
  thermo: ['M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0Z', 'M12 9v6'],
  print: ['M7 8V4h10v4', 'M5 8h14v8h-3v4H8v-4H5z', 'M8 16h8'],
  lock: ['M6 11h12v9H6z', 'M9 11V8a3 3 0 0 1 6 0v3'],
}

function MenuIcon({ name }: { name: MenuItem['icon'] }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-5 w-5 shrink-0 text-honey/80"
    >
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}

/** Secondary menu: everything that does not deserve a bottom tab. */
export function MorePage() {
  return (
    <Screen>
      <header className="rise rise-1">
        <p className="text-[10.5px] font-medium tracking-[0.16em] text-honey/80 uppercase">
          {t('app.name')}
        </p>
        <h1 className="mt-2 font-display text-[2rem] leading-[1.05] tracking-[-0.02em] text-cream">
          {t('more.title')}
        </h1>
      </header>

      <ul className="mt-5 space-y-2">
        {ITEMS.map((item, index) => (
          <li key={item.to} className={`rise rise-${Math.min(index + 2, 6)}`}>
            <Link
              to={item.to}
              className="flex items-center gap-3 rounded-3xl border border-moss/80 bg-canopy/60 px-4 py-3.5 transition hover:border-honey/40 active:scale-[0.99]"
            >
              <MenuIcon name={item.icon} />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium text-cream">{t(item.titleKey)}</span>
                <span className="mt-0.5 block text-[12px] text-mist">{t(item.hintKey)}</span>
              </span>
              <span aria-hidden="true" className="text-mist">
                ›
              </span>
            </Link>
          </li>
        ))}

        <li className="rise rise-6">
          <div className="flex items-center gap-3 rounded-3xl border border-moss/50 bg-canopy/30 px-4 py-3.5 opacity-70">
            <MenuIcon name="lock" />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-medium text-cream">{t('more.sync')}</span>
              <span className="mt-0.5 block text-[12px] text-mist">{t('more.syncHint')}</span>
            </span>
          </div>
        </li>
      </ul>

      <p className="mt-6 text-center text-[11px] leading-relaxed text-mist/80">{t('disclaimer')}</p>
    </Screen>
  )
}
