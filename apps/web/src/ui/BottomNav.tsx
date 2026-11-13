import { NavLink } from 'react-router-dom'
import { t, type TranslationKey } from '../core/i18n'

type IconName = 'home' | 'timeline' | 'growth' | 'vaccines' | 'dashboard'

interface NavItem {
  to: string
  labelKey: TranslationKey
  icon: IconName
  end?: boolean
}

const ITEMS: readonly NavItem[] = [
  { to: '/', labelKey: 'nav.home', icon: 'home', end: true },
  { to: '/timeline', labelKey: 'nav.timeline', icon: 'timeline' },
  { to: '/growth', labelKey: 'nav.growth', icon: 'growth' },
  { to: '/vaccines', labelKey: 'nav.vaccines', icon: 'vaccines' },
  { to: '/dashboard', labelKey: 'nav.dashboard', icon: 'dashboard' },
]

const ICON_PATHS: Record<IconName, readonly string[]> = {
  home: ['M4 10.5 12 4l8 6.5', 'M6 9.5V20h12V9.5', 'M10 20v-5h4v5'],
  timeline: ['M8 6h11M8 12h11M8 18h11'],
  growth: ['M4 19V5', 'M4 19h16', 'M7 15l4-4 3 2 5-6'],
  vaccines: ['M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z', 'M9 11.5l2 2 4-4'],
  dashboard: ['M4 19V5', 'M4 19h16', 'M8 16v-4M12.5 16V8M17 16v-6'],
}

function NavIcon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-[21px] w-[21px]"
    >
      {ICON_PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
      {name === 'timeline' && (
        <>
          <circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" />
          <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" />
        </>
      )}
    </svg>
  )
}

export function BottomNav() {
  return (
    <nav
      aria-label={t('nav.label')}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-moss/70 bg-night/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex w-full max-w-[27rem] items-stretch justify-around px-1">
        {ITEMS.map((item) => (
          <li key={item.to} className="min-w-0 flex-1">
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                [
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 text-[10px] leading-tight font-medium transition',
                  isActive ? 'text-honey' : 'text-mist hover:text-cream',
                ].join(' ')
              }
            >
              <NavIcon name={item.icon} />
              <span className="max-w-full truncate">{t(item.labelKey)}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
