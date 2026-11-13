import { t } from '../../../core/i18n'
import type { DoseStatus } from '../logic/schedule'

export interface VaccineDoseRowProps {
  name: string
  doseNo: number
  dueDate: Date
  /** ISO 8601 UTC, present once the dose was recorded. */
  givenDate?: string
  status: DoseStatus
  /** Draws the rail connector down to the next row. */
  connect?: boolean
  onSelect: () => void
}

/** "dd/MM/yyyy" in the device timezone; digits only, no locale dependency. */
function formatDay(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${date.getFullYear()}`
}

/**
 * One dose on the schedule rail: status marker, vaccine name, dose number and
 * the date line. Tapping it opens the "đã tiêm" sheet, which also edits an
 * already-recorded dose.
 */
export function VaccineDoseRow({
  name,
  doseNo,
  dueDate,
  givenDate,
  status,
  connect = false,
  onSelect,
}: VaccineDoseRowProps) {
  const givenOn = givenDate === undefined ? dueDate : new Date(givenDate)

  const statusText =
    status.kind === 'given'
      ? `${t('vaccines.givenOn', { date: formatDay(givenOn) })}`
      : status.kind === 'overdue'
        ? `${t('vaccines.overdue', { days: status.daysOverdue })}`
        : status.kind === 'today'
          ? `${t('vaccines.dueToday')}`
          : `${t('vaccines.due', { date: formatDay(dueDate) })}`

  const statusTone =
    status.kind === 'overdue' ? 'text-ember' : status.kind === 'today' ? 'text-honey' : 'text-mist'

  return (
    <li className="relative pl-8">
      <span aria-hidden="true" className="absolute top-4 left-0">
        <StatusMark kind={status.kind} />
      </span>

      {connect && (
        <span aria-hidden="true" className="absolute top-9 bottom-[-0.5rem] left-[8px] w-px bg-moss/70" />
      )}

      <button
        type="button"
        onClick={onSelect}
        aria-label={
          status.kind === 'given'
            ? `${t('common.edit')}: ${name}`
            : `${t('vaccines.markGiven')}: ${name}`
        }
        className="group w-full rounded-2xl border border-moss/70 bg-canopy/40 px-3.5 py-3 text-left transition hover:border-honey/40 hover:bg-canopy/70 active:scale-[0.99]"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 flex-1 text-[14px] leading-snug font-medium break-words text-cream">
            {name}
          </p>
          <span className="shrink-0 rounded-full border border-moss bg-night/70 px-2 py-0.5 text-[11px] leading-none font-medium text-mist tabular-nums">
            {t('vaccines.doseNo', { dose: doseNo })}
          </span>
        </div>

        <div className="mt-1 flex items-center justify-between gap-2">
          <p className={`min-w-0 text-[12px] leading-snug tabular-nums ${statusTone}`.trim()}>
            {statusText}
          </p>
          {/* Visual affordance for the sheet; the button's accessible name is
              the "Đánh dấu đã tiêm" label above. */}
          <span
            aria-hidden="true"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-moss text-mist transition group-hover:border-honey/50 group-hover:text-honey"
          >
            {status.kind === 'given' ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
              >
                <path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4Z" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
              >
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            )}
          </span>
        </div>
      </button>
    </li>
  )
}

/**
 * The rail marker. Colour is a status cue only — the schedule file is
 * `verified: false`, so nothing here is styled as an alarm.
 */
function StatusMark({ kind }: { kind: DoseStatus['kind'] }) {
  if (kind === 'given') {
    return (
      <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-moss">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="h-3 w-3 text-cream"
        >
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        </svg>
      </span>
    )
  }

  if (kind === 'today') {
    return <span className="block h-[18px] w-[18px] rounded-full bg-honey ring-4 ring-honey/20" />
  }

  if (kind === 'overdue') {
    return <span className="block h-[18px] w-[18px] rounded-full bg-ember/90" />
  }

  return (
    <span className="block h-[18px] w-[18px] rounded-full border border-honey/45 bg-night" />
  )
}
