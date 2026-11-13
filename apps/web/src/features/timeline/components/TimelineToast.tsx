export interface TimelineToastProps {
  /** Already-interpolated message, e.g. `t('logs.saved')`. */
  message: string
}

/**
 * Short confirmation after a timeline edit. The 3 s countdown lives in the
 * page (it owns the toast state), so unmounting never leaves a timer behind.
 * `aria-live="polite"` announces it without stealing focus from the sheet that
 * just closed.
 */
export function TimelineToast({ message }: TimelineToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rise pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 px-5"
    >
      <div className="mx-auto flex w-full max-w-[27rem] items-center gap-2.5 rounded-2xl border border-moss bg-canopy/95 px-4 py-3 shadow-[0_20px_45px_-24px_rgba(0,0,0,0.95)] backdrop-blur">
        <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-honey" />
        <p className="min-w-0 flex-1 text-[13px] leading-snug text-cream">{message}</p>
      </div>
    </div>
  )
}
