import type { ReactNode } from 'react'

export interface FieldProps {
  /** Id of the control this label points at (`htmlFor` / `aria-describedby`). */
  id: string
  label: string
  /** Small note rendered opposite the label, e.g. an "optional" hint. */
  aside?: string
  /** Helper line under the control. */
  hint?: string
  /** Inline validation message; replaces the hint while present. */
  error?: string
  children: ReactNode
}

/**
 * Label + control + helper/error stack used by every onboarding field.
 * The control itself is passed in so each input keeps its own attributes
 * (`type`, `max`, `inputMode`, ...).
 */
export function Field({ id, label, aside, hint, error, children }: FieldProps) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-medium text-cream/85">
          {label}
        </label>
        {aside !== undefined && (
          <span className="shrink-0 text-[11px] text-mist/70">{aside}</span>
        )}
      </div>

      {children}

      {error !== undefined ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-[12px] text-ember">
          {error}
        </p>
      ) : hint !== undefined ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[12px] leading-relaxed text-mist/80">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
