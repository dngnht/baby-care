import type { Sex } from '../../../core/db/schema'
import { t } from '../../../core/i18n'

export interface SexChoiceProps {
  value: Sex | null
  onChange: (sex: Sex) => void
  /** Draws the error border when the field was submitted without a choice. */
  invalid?: boolean
}

/**
 * Two-button single choice for `Bé trai` / `Bé gái`.
 * Rendered inside the page's `<fieldset>` so the legend labels the group.
 */
export function SexChoice({ value, onChange, invalid = false }: SexChoiceProps) {
  return (
    <div
      className={`grid grid-cols-2 gap-1.5 rounded-2xl border bg-canopy/50 p-1.5 ${
        invalid ? 'border-ember/60' : 'border-moss'
      }`.trim()}
    >
      <Choice
        label={t('onboarding.sexMale')}
        selected={value === 'M'}
        onSelect={() => onChange('M')}
      />
      <Choice
        label={t('onboarding.sexFemale')}
        selected={value === 'F'}
        onSelect={() => onChange('F')}
      />
    </div>
  )
}

interface ChoiceProps {
  label: string
  selected: boolean
  onSelect: () => void
}

function Choice({ label, selected, onSelect }: ChoiceProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`min-h-11 rounded-xl text-[14px] font-medium transition active:scale-[0.99] ${
        selected
          ? 'bg-honey text-night shadow-[0_6px_18px_-8px_rgba(240,181,99,0.85)]'
          : 'text-cream/70 hover:text-cream'
      }`.trim()}
    >
      {label}
    </button>
  )
}
