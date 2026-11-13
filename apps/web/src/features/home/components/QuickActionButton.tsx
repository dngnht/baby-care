import { useCallback, useEffect, useRef, type PointerEvent } from 'react'

/** Hold duration that opens the detail sheet instead of logging. */
export const HOLD_MS = 450

export type QuickIconName = 'feed' | 'bottle' | 'solid' | 'diaper' | 'sleep' | 'temp' | 'more'

export interface QuickActionButtonProps {
  label: string
  icon: QuickIconName
  /** Tailwind text colour used by the icon and the soft corner glow. */
  accent: string
  onTap: () => void
  onLongPress: () => void
  /** Extra `rise` delay class so the grid staggers in. */
  delayClass?: string
  disabled?: boolean
}

/**
 * One tile of the home quick-log grid.
 *
 * A tap logs immediately; a ~450 ms hold opens the sheet on release. Holding
 * is detected with pointer events so it also works while the finger scrolls
 * away (pointerleave / pointercancel cancel the hold). Keyboard users get the
 * tap path through the native click.
 */
export function QuickActionButton({
  label,
  icon,
  accent,
  onTap,
  onLongPress,
  delayClass = '',
  disabled = false,
}: QuickActionButtonProps) {
  const timer = useRef<number | null>(null)
  const held = useRef(false)
  /** Keeps the synthetic click that follows a hold from logging twice. */
  const clickGuardUntil = useRef(0)

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  useEffect(() => cancel, [cancel])

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (disabled || event.button !== 0) return
    held.current = false
    cancel()
    timer.current = window.setTimeout(() => {
      timer.current = null
      held.current = true
    }, HOLD_MS)
  }

  function handlePointerUp() {
    cancel()
    if (held.current) {
      held.current = false
      // The click that follows this release must not log a second time.
      clickGuardUntil.current = Date.now() + HOLD_MS
      onLongPress()
    }
  }

  function handleClick() {
    if (Date.now() < clickGuardUntil.current) return
    if (!disabled) onTap()
  }

  return (
    // The entrance animation sits on a wrapper: `.rise` fills both directions
    // forever, which would otherwise win over the tile's `active:scale`.
    <div className={`h-full ${delayClass}`.trim()}>
      <button
        type="button"
        disabled={disabled}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onClick={handleClick}
        onContextMenu={(event) => event.preventDefault()}
        className={`group relative flex h-full min-h-24 w-full touch-manipulation select-none flex-col justify-between gap-3 overflow-hidden rounded-3xl border border-moss/80 bg-canopy/60 p-4 text-left transition duration-150 active:scale-[0.98] active:border-honey/50 disabled:opacity-60 ${accent}`.trim()}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-8 -right-8 h-24 w-24 rounded-full bg-current opacity-[0.09] blur-2xl transition-opacity duration-300 group-hover:opacity-[0.16]"
        />
        <span aria-hidden="true" className="relative block h-8 w-8">
          <QuickIcon name={icon} />
        </span>
        <span className="relative font-display text-[1.3rem] leading-none text-cream">
          {label}
        </span>
      </button>
    </div>
  )
}

function QuickIcon({ name }: { name: QuickIconName }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    className: 'h-8 w-8',
  }

  switch (name) {
    case 'feed':
      return (
        <svg {...common}>
          <path d="M12 3.2c3.1 3.8 5.6 6.8 5.6 9.9a5.6 5.6 0 0 1-11.2 0c0-3.1 2.5-6.1 5.6-9.9Z" />
          <path d="M9.6 13.4a2.5 2.5 0 0 0 2.4 2.4" />
        </svg>
      )
    case 'bottle':
      return (
        <svg {...common}>
          <path d="M9.2 3.5h5.6v2.2H9.2z" />
          <path d="M10.2 5.7h3.6l.7 2.1h-5z" />
          <path d="M8.4 7.8h7.2a2 2 0 0 1 2 2v8.7a2 2 0 0 1-2 2H8.4a2 2 0 0 1-2-2V9.8a2 2 0 0 1 2-2Z" />
          <path d="M9.4 12.2h5.2M9.4 15.4h5.2" />
        </svg>
      )
    case 'solid':
      return (
        <svg {...common}>
          <path d="M4 12.5h16a8 8 0 0 1-16 0Z" />
          <path d="M8 12.5c0-2 1.4-3.4 4-3.4s4 1.4 4 3.4" />
          <path d="M8.5 9.1V6.4" />
        </svg>
      )
    case 'diaper':
      return (
        <svg {...common}>
          <path d="M4 7.5h16v4.2a6.3 6.3 0 0 1-6.3 6.3h-3.4A6.3 6.3 0 0 1 4 11.7V7.5Z" />
          <path d="M4 7.5c3 0 4.8 3.1 8 3.1s5-3.1 8-3.1" />
        </svg>
      )
    case 'sleep':
      return (
        <svg {...common}>
          <path d="M20 14.4A8.4 8.4 0 0 1 9.6 4 8.4 8.4 0 1 0 20 14.4Z" />
        </svg>
      )
    case 'temp':
      return (
        <svg {...common}>
          <path d="M10 13.5V6a2 2 0 1 1 4 0v7.5a4 4 0 1 1-4 0Z" />
          <path d="M12 9.2v6.1" />
        </svg>
      )
    case 'more':
      return (
        <svg {...common}>
          <circle cx="5.5" cy="12" r="1.35" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.35" fill="currentColor" stroke="none" />
          <circle cx="18.5" cy="12" r="1.35" fill="currentColor" stroke="none" />
        </svg>
      )
  }
}
