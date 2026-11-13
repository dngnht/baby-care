import { useEffect, useState } from 'react'
import { useActiveBaby } from '../../../core/baby/activeBaby'
import { getRepo } from '../../../core/db/repo'
import type { VaccineDose } from '../../../core/db/schema'
import { t, type TranslationKey } from '../../../core/i18n'
import { downloadFile } from '../../../core/platform'
import { Button } from '../../../ui/Button'
import { Card } from '../../../ui/Card'
import { Screen } from '../../../ui/Screen'
import { UnverifiedBadge } from '../../../ui/UnverifiedBadge'
import { MarkGivenSheet, type MarkGivenInput } from '../components/MarkGivenSheet'
import { VaccineDoseRow } from '../components/VaccineDoseRow'
import { VaccinesToast } from '../components/VaccinesToast'
import { buildIcs, icsFilename } from '../logic/ics'
import { notifyUpcoming, type NotifyResult } from '../logic/notify'
import {
  VN_SCHEDULE,
  daysBetween,
  doseKey,
  doseStatus,
  generateSchedule,
  mergeWithStored,
  type PlannedDose,
} from '../logic/schedule'

type LoadState = 'loading' | 'ready' | 'error'

/** How long a confirmation stays on screen. */
const TOAST_MS = 3000

/** One toast per notification outcome. */
const NOTIFY_TOAST: Readonly<Record<NotifyResult, TranslationKey>> = {
  shown: 'vaccines.notifyGranted',
  empty: 'vaccines.noneUpcoming',
  blocked: 'vaccines.notifyBlocked',
  unsupported: 'vaccines.notifyUnsupported',
}

/**
 * T023 — the TCMR schedule generated from the baby's birth date.
 *
 * The knowledge file is the only source of dates: on mount the planned schedule
 * is reconciled with the stored doses (create the missing ones, refresh a due
 * date that moved) and then re-read, so a recorded dose keeps its given date,
 * lot and place. The file is `verified: false`, so the header carries the
 * "Đang chờ xác minh" badge; the service vaccines are listed without dates
 * because the file has no age anchors for them.
 */
export function VaccinesPage() {
  const baby = useActiveBaby((state) => state.baby)

  const [planned, setPlanned] = useState<PlannedDose[]>([])
  const [doses, setDoses] = useState<VaccineDose[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [reloadToken, setReloadToken] = useState(0)

  const [editing, setEditing] = useState<VaccineDose | null>(null)
  const [busy, setBusy] = useState(false)
  const [writeError, setWriteError] = useState(false)
  const [notifying, setNotifying] = useState(false)
  const [toast, setToast] = useState<TranslationKey | null>(null)

  useEffect(() => {
    if (baby === null) return
    // Narrowed once: control-flow narrowing does not reach the nested function.
    const activeBaby = baby
    let cancelled = false
    const repo = getRepo()

    async function prepare() {
      setLoadState('loading')
      const stored = await repo.listVaccineDoses(activeBaby.id)
      const plannedDoses = generateSchedule(new Date(activeBaby.birthDate), VN_SCHEDULE)
      const { toCreate, toUpdate } = mergeWithStored(plannedDoses, stored)

      for (const dose of toCreate) {
        await repo.addVaccineDose({
          babyId: activeBaby.id,
          vaccineCode: dose.code,
          doseNo: dose.doseNo,
          dueDate: dose.dueDate,
        })
      }
      for (const change of toUpdate) {
        await repo.updateVaccineDose(change.id, { dueDate: change.dueDate })
      }

      const fresh =
        toCreate.length === 0 && toUpdate.length === 0
          ? stored
          : await repo.listVaccineDoses(activeBaby.id)
      if (cancelled) return
      setPlanned(plannedDoses)
      setDoses(fresh)
      setLoadState('ready')
    }

    void prepare().catch(() => {
      if (!cancelled) setLoadState('error')
    })

    return () => {
      cancelled = true
    }
  }, [baby, reloadToken])

  useEffect(() => {
    if (toast === null) return
    const timer = window.setTimeout(() => setToast(null), TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [toast])

  function showToast(label: TranslationKey) {
    // A fresh message restarts the countdown, even for the same label.
    setToast(null)
    setToast(label)
  }

  async function handleSaveGiven(input: MarkGivenInput) {
    if (editing === null || baby === null || busy) return
    const target = editing
    const babyId = baby.id
    setBusy(true)
    setWriteError(false)

    try {
      await getRepo().updateVaccineDose(target.id, {
        givenDate: input.givenDate,
        lot: input.lot === '' ? undefined : input.lot,
        place: input.place === '' ? undefined : input.place,
      })
      const fresh = await getRepo().listVaccineDoses(babyId)
      setDoses(fresh)
      setEditing(null)
      showToast('common.done')
    } catch {
      // Keep the sheet (and the user's edits) open.
      setWriteError(true)
    } finally {
      setBusy(false)
    }
  }

  function handleExport() {
    if (planned.length === 0) {
      showToast('vaccines.exportEmpty')
      return
    }
    const ics = buildIcs(planned)
    downloadFile(new File([ics], icsFilename(new Date()), { type: 'text/calendar' }))
    showToast('vaccines.exported')
  }

  async function handleNotify() {
    if (notifying) return
    setNotifying(true)
    try {
      const result = await notifyUpcoming(planned, doses, new Date())
      showToast(NOTIFY_TOAST[result])
    } catch {
      showToast('common.error')
    } finally {
      setNotifying(false)
    }
  }

  if (baby === null) {
    return (
      <Screen>
        <p className="mt-24 text-center text-sm text-mist">{t('common.loading')}</p>
      </Screen>
    )
  }

  const now = new Date()
  const nameByDose = new Map(planned.map((dose) => [doseKey(dose.code, dose.doseNo), dose.name]))
  const upcomingCount = doses.filter(
    (dose) => dose.givenDate === undefined && daysBetween(now, new Date(dose.dueDate)) >= 0,
  ).length
  const serviceSection = VN_SCHEDULE.optional_service
  const service = serviceSection?.items ?? []
  const serviceVerified = serviceSection?.verified ?? false
  const editingName =
    editing === null ? '' : (nameByDose.get(doseKey(editing.vaccineCode, editing.doseNo)) ?? editing.vaccineCode)

  return (
    <Screen>
      <header className="rise rise-1">
        <p className="text-[10.5px] font-medium tracking-[0.16em] text-honey/80 uppercase">
          {t('app.name')}
        </p>
        <h1 className="mt-2 font-display text-[2rem] leading-[1.05] tracking-[-0.02em] text-cream">
          {t('vaccines.title')}
        </h1>
        <p className="mt-2 text-[13px] text-mist">{t('vaccines.subtitle')}</p>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {!VN_SCHEDULE.verified && <UnverifiedBadge />}
          <span className="text-[11.5px] text-mist">{t('common.localOnly')}</span>
        </div>
      </header>

      {loadState === 'loading' ? (
        <p className="mt-16 text-center text-sm text-mist">{t('common.loading')}</p>
      ) : loadState === 'error' ? (
        <div role="alert" className="mt-16 text-center">
          <p className="text-sm text-ember">{t('common.error')}</p>
          <Button
            variant="secondary"
            className="mt-3"
            onClick={() => setReloadToken((token) => token + 1)}
          >
            {t('common.retry')}
          </Button>
        </div>
      ) : (
        <>
          <Card className="rise rise-2 mt-5 flex items-center gap-3">
            <span aria-hidden="true" className="relative flex h-9 w-9 shrink-0 items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-honey/12" />
              <span className="relative h-[7px] w-[7px] rounded-full bg-honey" />
            </span>
            <p className="min-w-0 font-display text-[1.05rem] leading-snug text-cream text-balance">
              {t('vaccines.count', { count: upcomingCount })}
            </p>
          </Card>

          <section className="rise rise-3 mt-6">
            <div className="flex items-center gap-3">
              <h2 className="text-[11px] font-medium tracking-[0.16em] text-honey/80 uppercase">
                {t('vaccines.tcmr')}
              </h2>
              <span aria-hidden="true" className="h-px flex-1 bg-moss/70" />
            </div>

            {doses.length === 0 ? (
              <Card className="mt-3 text-center">
                <p className="font-display text-[1.1rem] leading-snug text-cream">
                  {t('vaccines.empty')}
                </p>
              </Card>
            ) : (
              <ol className="mt-3 space-y-2">
                {doses.map((dose, index) => (
                  <VaccineDoseRow
                    key={dose.id}
                    name={nameByDose.get(doseKey(dose.vaccineCode, dose.doseNo)) ?? dose.vaccineCode}
                    doseNo={dose.doseNo}
                    dueDate={new Date(dose.dueDate)}
                    givenDate={dose.givenDate}
                    status={doseStatus({ dueDate: new Date(dose.dueDate) }, dose, now)}
                    connect={index < doses.length - 1}
                    onSelect={() => setEditing(dose)}
                  />
                ))}
              </ol>
            )}
          </section>

          <div className="rise rise-4 mt-6 grid grid-cols-1 gap-2">
            <Button variant="secondary" fullWidth onClick={handleExport}>
              {t('vaccines.exportIcs')}
            </Button>
            <Button
              variant="secondary"
              fullWidth
              disabled={notifying}
              onClick={() => {
                void handleNotify()
              }}
            >
              {t('vaccines.notifyOn')}
            </Button>
          </div>

          {service.length > 0 && (
            <section className="rise rise-5 mt-7">
              <div className="flex items-center gap-3">
                <h2 className="text-[11px] font-medium tracking-[0.16em] text-mist uppercase">
                  {t('vaccines.service')}
                </h2>
                <span aria-hidden="true" className="h-px flex-1 bg-moss/70" />
                {!serviceVerified && <UnverifiedBadge className="shrink-0" />}
              </div>

              {/* Listed only: the knowledge file has no age anchor for these,
                  so no date is generated (AGENTS rule 2). */}
              <ul className="mt-3 divide-y divide-moss/60 overflow-hidden rounded-3xl border border-moss/80 bg-canopy/60">
                {service.map((entry) => (
                  <li key={entry.code} className="px-4 py-3">
                    <p className="text-[13.5px] leading-snug font-medium break-words text-cream">
                      {entry.name}
                    </p>
                    {entry.note !== undefined && (
                      <p className="mt-0.5 text-[12px] leading-relaxed break-words text-mist">
                        {entry.note}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {editing !== null && (
        <MarkGivenSheet
          key={editing.id}
          name={editingName}
          doseNo={editing.doseNo}
          givenDate={editing.givenDate}
          lot={editing.lot}
          place={editing.place}
          busy={busy}
          error={writeError}
          onSave={(input) => {
            void handleSaveGiven(input)
          }}
          onClose={() => {
            if (busy) return
            setWriteError(false)
            setEditing(null)
          }}
        />
      )}

      {toast !== null && <VaccinesToast message={t(toast)} />}
    </Screen>
  )
}
