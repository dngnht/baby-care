import { t, type TranslationKey } from '../../../core/i18n'
import { Card } from '../../../ui/Card'
import {
  INTERVAL_OPTIONS,
  type ReminderKind,
  type ReminderSetting,
  type ReminderSettings,
} from '../logic/reminderSettings'

interface RowCopy {
  kind: ReminderKind
  labelKey: TranslationKey
}

const ROWS: readonly RowCopy[] = [
  { kind: 'feed', labelKey: 'reminderCard.feed' },
  { kind: 'diaper', labelKey: 'reminderCard.diaper' },
]

export interface ReminderSettingsCardProps {
  settings: ReminderSettings
  onChange: (next: ReminderSettings) => void
}

function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean
  label: string
  onChange: (value: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full border transition ${
        checked ? 'border-honey/70 bg-honey/70' : 'border-moss bg-night/70'
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-cream transition-all ${
          checked ? 'left-6' : 'left-0.5'
        }`}
      />
    </button>
  )
}

/**
 * Two opt-in nudges: "it has been ~3h since the last feed / diaper".
 *
 * Off by default, interval chosen by the parent, and the copy says explicitly
 * that this is a personal rhythm rather than a medical schedule.
 */
export function ReminderSettingsCard({ settings, onChange }: ReminderSettingsCardProps) {
  function update(kind: ReminderKind, patch: Partial<ReminderSetting>) {
    onChange({ ...settings, [kind]: { ...settings[kind], ...patch } })
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[11px] font-medium tracking-[0.14em] text-honey/80 uppercase">
            {t('reminderCard.title')}
          </h2>
          <p className="mt-1 text-[11px] leading-relaxed text-mist">{t('reminderCard.hint')}</p>
        </div>
      </div>

      <ul className="mt-3 space-y-3">
        {ROWS.map((row) => {
          const setting = settings[row.kind]
          return (
            <li key={row.kind}>
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1 text-[13.5px] font-medium text-cream">
                  {t(row.labelKey)}
                </span>
                {setting.enabled && (
                  <select
                    aria-label={t('reminderCard.every', { minutes: setting.intervalMinutes })}
                    value={setting.intervalMinutes}
                    onChange={(event) => update(row.kind, { intervalMinutes: Number(event.target.value) })}
                    className="h-9 rounded-xl border border-moss bg-night/60 px-2 text-[12px] text-cream tabular-nums"
                  >
                    {INTERVAL_OPTIONS.map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {t('reminderCard.every', { minutes })}
                      </option>
                    ))}
                  </select>
                )}
                <Toggle
                  checked={setting.enabled}
                  label={t(row.labelKey)}
                  onChange={(value) => update(row.kind, { enabled: value })}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
