import { useState, type FormEvent } from 'react'
import { t } from '../../../core/i18n'
import { Button } from '../../../ui/Button'
import { Card } from '../../../ui/Card'
import { Screen } from '../../../ui/Screen'
import { useAuth } from '../store'

const INPUT =
  'w-full min-h-12 rounded-2xl border border-moss bg-night/60 px-4 py-3 text-center text-[18px] tracking-[0.35em] text-cream caret-honey transition [color-scheme:dark] focus:border-honey/70'

/**
 * Full-screen lock shown by `AppLayout` while nobody is signed in.
 *
 * Multi-caregiver households get a "switch user" list; the PIN is the only
 * credential, so a wrong PIN just returns to the same screen.
 */
export function LockScreen() {
  const roster = useAuth((state) => state.roster)
  const signIn = useAuth((state) => state.signIn)

  const [selectedId, setSelectedId] = useState<string | null>(roster.activeId)
  const [pin, setPin] = useState('')
  const [switching, setSwitching] = useState(false)
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  const selected =
    roster.caregivers.find((entry) => entry.id === selectedId) ?? roster.caregivers[0]

  if (selected === undefined) return null

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || selected === undefined) return
    setBusy(true)
    const result = await signIn(selected.id, pin)
    setBusy(false)
    if (result === 'ok') {
      setError(false)
      setPin('')
      return
    }
    setError(true)
    setPin('')
  }

  return (
    <Screen withNav={false}>
      <div className="mt-16 flex flex-col items-center text-center">
        <p className="text-[10.5px] font-medium tracking-[0.16em] text-honey/80 uppercase">
          {t('app.name')}
        </p>
        <h1 className="mt-2 font-display text-[1.9rem] leading-tight text-cream">
          {t('auth.lockedTitle')}
        </h1>
        <p className="mt-2 text-[12.5px] text-mist">{t('auth.lockedSubtitle')}</p>
      </div>

      <Card className="rise rise-2 mt-6">
        {switching ? (
          <div>
            <p className="text-[11px] font-medium tracking-[0.14em] text-mist uppercase">
              {t('auth.caregivers')}
            </p>
            <ul className="mt-2 space-y-1.5">
              {roster.caregivers.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(entry.id)
                      setSwitching(false)
                      setPin('')
                      setError(false)
                    }}
                    className={`flex w-full items-center justify-between rounded-2xl border px-3.5 py-3 text-left transition ${
                      entry.id === selected.id
                        ? 'border-honey/50 bg-honey/10 text-cream'
                        : 'border-moss/70 bg-night/40 text-mist hover:text-cream'
                    }`}
                  >
                    <span className="text-[13.5px] font-medium">{entry.name}</span>
                    {entry.id === roster.activeId && (
                      <span className="text-[10.5px] text-honey">{t('auth.active')}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13.5px] font-medium text-cream">
                {t('auth.signedInAs', { name: selected.name })}
              </p>
              {roster.caregivers.length > 1 && (
                <button
                  type="button"
                  onClick={() => setSwitching(true)}
                  className="shrink-0 text-[11.5px] font-medium text-honey"
                >
                  {t('auth.switchUser')}
                </button>
              )}
            </div>

            <input
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              maxLength={6}
              aria-label={t('auth.pinLabel')}
              className={`${INPUT} mt-3`}
            />

            {error && (
              <p role="alert" className="mt-2 text-center text-[12px] text-ember">
                {t('auth.errorPinWrong')}
              </p>
            )}

            <Button type="submit" size="lg" fullWidth className="mt-3" disabled={busy || pin.length < 4}>
              {t('auth.unlock')}
            </Button>
          </form>
        )}
      </Card>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-mist/80">{t('auth.localOnly')}</p>
    </Screen>
  )
}
