import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useActiveBaby } from '../../../core/baby/activeBaby'
import { getRepo } from '../../../core/db/repo'
import type { MilestoneCheck } from '../../../core/db/schema'
import { t, type TranslationKey } from '../../../core/i18n'
import { Button } from '../../../ui/Button'
import { Card } from '../../../ui/Card'
import { Screen } from '../../../ui/Screen'
import { UnverifiedBadge } from '../../../ui/UnverifiedBadge'
import { describeAge } from '../../profile/logic/age'
import {
  MILESTONES,
  ageInMonths,
  formatDdMmYyyy,
  milestoneStatus,
  redFlagMonth,
  sortByMonthThenDomain,
  summarizeChecks,
  type MilestoneItem,
} from '../logic/milestones'

type LoadState = 'loading' | 'ready' | 'error'

/** Domain slug -> i18n key. Unknown slugs render no chip (never a raw label). */
function domainLabel(domain: string): TranslationKey | null {
  switch (domain) {
    case 'motor':
      return 'milestones.domain.motor'
    case 'social':
      return 'milestones.domain.social'
    case 'language':
      return 'milestones.domain.language'
    case 'cognitive':
      return 'milestones.domain.cognitive'
    default:
      return null
  }
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-honey"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

/**
 * T040 — developmental milestones for the active baby.
 *
 * Texts and red-flag thresholds come from `knowledge/milestones/`; the page
 * only records when a parent marked a milestone as achieved. While the file is
 * `verified: false` a missed threshold is shown in the warm honey/mist tone,
 * never red (AGENTS rule 3), and the header carries the unverified badge.
 */
export function MilestonesPage() {
  const baby = useActiveBaby((state) => state.baby)

  const [checks, setChecks] = useState<MilestoneCheck[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [reloadToken, setReloadToken] = useState(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [writeError, setWriteError] = useState(false)

  useEffect(() => {
    if (baby === null) return
    // Narrowed once: control-flow narrowing does not reach the async callback.
    const babyId = baby.id
    let cancelled = false

    setLoadState('loading')
    getRepo()
      .listMilestoneChecks(babyId)
      .then((rows) => {
        if (cancelled) return
        setChecks(rows)
        setLoadState('ready')
      })
      .catch(() => {
        if (!cancelled) setLoadState('error')
      })

    return () => {
      cancelled = true
    }
  }, [baby, reloadToken])

  const ageMonths = useMemo(
    () => (baby === null ? 0 : ageInMonths(describeAge(baby, new Date()).correctedDays)),
    [baby],
  )

  const items = useMemo(() => sortByMonthThenDomain(MILESTONES.items), [])
  const summary = useMemo(() => summarizeChecks(MILESTONES.items, checks), [checks])
  const checkById = useMemo(
    () => new Map(checks.map((check) => [check.milestoneId, check])),
    [checks],
  )

  async function toggleAchieved(item: MilestoneItem, achieved: boolean) {
    if (baby === null || busyId !== null) return
    const babyId = baby.id
    setBusyId(item.id)
    setWriteError(false)

    try {
      const repo = getRepo()
      if (achieved) {
        await repo.setMilestoneCheck({ babyId, milestoneId: item.id, achievedAt: new Date() })
      } else {
        await repo.clearMilestoneCheck(babyId, item.id)
      }
      setChecks(await repo.listMilestoneChecks(babyId))
    } catch {
      setWriteError(true)
    } finally {
      setBusyId(null)
    }
  }

  if (baby === null) {
    return (
      <Screen>
        <p className="mt-24 text-center text-sm text-mist">{t('common.loading')}</p>
      </Screen>
    )
  }

  const percent = summary.total === 0 ? 0 : Math.round((summary.done / summary.total) * 100)
  const alertTone = MILESTONES.verified
    ? { box: 'border-ember/40 bg-ember/10', title: 'text-ember', body: 'text-ember/90' }
    : { box: 'border-honey/40 bg-honey/10', title: 'text-honey', body: 'text-mist' }

  return (
    <Screen>
      <header className="rise rise-1">
        <Link
          to="/more"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-mist transition hover:text-cream"
        >
          <span aria-hidden="true" className="text-base leading-none">
            ‹
          </span>
          {t('common.back')}
        </Link>

        <p className="mt-5 text-[10.5px] font-medium tracking-[0.16em] text-honey/80 uppercase">
          {t('app.name')}
        </p>
        <h1 className="mt-2 font-display text-[2rem] leading-[1.05] tracking-[-0.02em] text-cream">
          {t('milestones.title')}
        </h1>
        <p className="mt-2 text-[13px] text-mist">{t('milestones.subtitle')}</p>

        {!MILESTONES.verified && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <UnverifiedBadge />
            <span className="text-[11.5px] leading-relaxed text-mist">
              {t('milestones.pendingReview')}
            </span>
          </div>
        )}
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
          <Card className="rise rise-2 mt-5">
            <div className="flex items-baseline justify-between gap-3">
              <p
                id="milestone-progress"
                className="font-display text-[1.05rem] leading-snug text-cream text-balance"
              >
                {t('milestones.progress', { done: summary.done, total: summary.total })}
              </p>
              <span className="shrink-0 text-[12px] tabular-nums text-honey">{percent}%</span>
            </div>
            <div
              role="progressbar"
              aria-labelledby="milestone-progress"
              aria-valuemin={0}
              aria-valuemax={summary.total}
              aria-valuenow={summary.done}
              className="mt-3 h-1.5 overflow-hidden rounded-full bg-moss/70"
            >
              <div
                className="h-full rounded-full bg-honey transition-[width] duration-500 ease-out"
                style={{ width: `${percent}%` }}
              />
            </div>
          </Card>

          {writeError && (
            <p role="alert" className="mt-3 text-center text-[12.5px] text-ember">
              {t('common.error')}
            </p>
          )}

          <ol className="mt-5 space-y-2">
            {items.map((item, index) => {
              const check = checkById.get(item.id)
              const achievedAt = check?.achievedAt
              const status = milestoneStatus(item, check, ageMonths, MILESTONES)
              const label = domainLabel(item.domain)
              const busy = busyId === item.id

              return (
                <li key={item.id} className={`rise rise-${Math.min(index + 2, 6)}`}>
                  <Card className={achievedAt !== undefined ? 'ring-1 ring-honey/40' : ''}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10.5px] font-medium tracking-[0.16em] text-honey/80 uppercase">
                        {t('milestones.month', { month: item.month })}
                      </span>
                      {label !== null && (
                        <span className="rounded-full border border-moss bg-canopy/70 px-2 py-0.5 text-[10.5px] leading-none text-mist">
                          {t(label)}
                        </span>
                      )}
                      <span aria-hidden="true" className="flex-1" />
                      {achievedAt !== undefined && <CheckIcon />}
                    </div>

                    <p className="mt-2 text-[14.5px] leading-snug break-words text-cream">
                      {item.text}
                    </p>

                    {achievedAt !== undefined ? (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[12px] text-honey">
                          {t('milestones.achieved', { date: formatDdMmYyyy(achievedAt) })}
                        </p>
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() => {
                            void toggleAchieved(item, false)
                          }}
                        >
                          {t('milestones.undo')}
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-3">
                        {status === 'red_flag' && (
                          <div className={`rounded-2xl border px-3.5 py-3 ${alertTone.box}`}>
                            <p className={`text-[12.5px] font-medium ${alertTone.title}`}>
                              {t('milestones.redFlagTitle')}
                            </p>
                            <p className={`mt-1 text-[12px] leading-relaxed ${alertTone.body}`}>
                              {t('milestones.redFlag', {
                                month: redFlagMonth(item, MILESTONES),
                              })}
                            </p>
                          </div>
                        )}
                        <Button
                          variant="secondary"
                          fullWidth
                          className={status === 'red_flag' ? 'mt-2.5' : ''}
                          disabled={busy}
                          onClick={() => {
                            void toggleAchieved(item, true)
                          }}
                        >
                          {t('milestones.markAchieved')}
                        </Button>
                      </div>
                    )}
                  </Card>
                </li>
              )
            })}
          </ol>

          <p className="mt-6 text-center text-[11px] leading-relaxed text-mist/80">
            {t('disclaimer')}
          </p>
        </>
      )}
    </Screen>
  )
}
