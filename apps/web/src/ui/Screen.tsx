import type { ReactNode } from 'react'

export interface ScreenProps {
  children: ReactNode
  /** Extra classes for the max-width column (not the page background). */
  className?: string
  /** Bottom padding reserved for the bottom navigation. */
  withNav?: boolean
  as?: 'main' | 'div' | 'section'
}

/**
 * Page shell: full-height night background + a 27rem mobile-first column with
 * safe-area padding. Every screen uses it so gutters never drift.
 */
export function Screen({ children, className = '', withNav = true, as = 'main' }: ScreenProps) {
  const Tag = as
  return (
    <Tag className="min-h-dvh bg-night text-cream">
      <div
        className={`relative mx-auto flex w-full max-w-[27rem] flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] ${
          withNav ? 'pb-[calc(6.5rem+env(safe-area-inset-bottom))]' : 'pb-[max(1.5rem,env(safe-area-inset-bottom))]'
        } ${className}`.trim()}
      >
        {children}
      </div>
    </Tag>
  )
}
