import { t } from '../../../core/i18n'

export interface UndoToastProps {
  /** Already-interpolated `home.logged` sentence. */
  message: string
  onUndo: () => void
}

/**
 * Transient confirmation for a quick log, floating just above the bottom nav.
 * The 5 s dismissal timer lives in the page (it owns the toast state), so
 * remounting the toast never leaves a stray timer behind.
 */
export function UndoToast({ message, onUndo }: UndoToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rise pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 px-5"
    >
      <div className="pointer-events-auto mx-auto flex w-full max-w-[27rem] items-center gap-2 rounded-2xl border border-moss bg-canopy/95 py-2 pr-2 pl-4 shadow-[0_20px_45px_-24px_rgba(0,0,0,0.95)] backdrop-blur">
        <p className="min-w-0 flex-1 text-[13px] leading-snug text-cream">{message}</p>
        <button
          type="button"
          onClick={onUndo}
          className="shrink-0 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-honey transition hover:bg-honey/10 active:scale-[0.97]"
        >
          {t('common.undo')}
        </button>
      </div>
    </div>
  )
}
