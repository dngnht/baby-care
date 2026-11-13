import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { t, type TranslationKey } from '../../../core/i18n'
import { Button } from '../../../ui/Button'
import { Card } from '../../../ui/Card'
import { Screen } from '../../../ui/Screen'
import { useAuth, type AuthResult } from '../store'

const ERROR_KEYS: Readonly<Record<Exclude<AuthResult, 'ok'>, TranslationKey>> = {
  name: 'auth.errorName',
  pin: 'auth.errorPin',
  'pin-mismatch': 'auth.errorPinMatch',
  duplicate: 'auth.errorDuplicate',
  'bad-pin': 'auth.errorPinWrong',
}

const INPUT =
  'w-full min-h-12 rounded-2xl border border-moss bg-night/60 px-4 py-3 text-[15px] text-cream caret-honey transition [color-scheme:dark] placeholder:text-mist/40 focus:border-honey/70'

/** Manage who can sign in on this device (still local-only, no server). */
export function CaregiversPage() {
  const roster = useAuth((state) => state.roster)
  const active = useAuth((state) => state.active)
  const addCaregiver = useAuth((state) => state.addCaregiver)
  const removeCaregiver = useAuth((state) => state.removeCaregiver)
  const setRemember = useAuth((state) => state.setRemember)
  const lock = useAuth((state) => state.lock)

  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<TranslationKey | null>(null)
  const [busy, setBusy] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    const result = await addCaregiver(name, pin, confirm)
    setBusy(false)
    if (result !== 'ok') {
      setError(ERROR_KEYS[result])
      return
    }
    setError(null)
    setName('')
    setPin('')
    setConfirm('')
    setAdding(false)
  }

  return (
    <Screen>
      <header className="rise rise-1">
        <Link to="/more" className="text-[12px] text-mist transition hover:text-cream">
          ‹ {t('common.back')}
        </Link>
        <h1 className="mt-2 font-display text-[1.9rem] leading-tight text-cream">
          {t('auth.caregivers')}
        </h1>
        <p className="mt-1.5 text-[12.5px] text-mist">{t('auth.caregiversHint')}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-mist/80">{t('auth.localOnly')}</p>
      </header>

      <Card className="rise rise-2 mt-4">
        <ul className="space-y-2">
          {roster.caregivers.map((entry) => {
            const isActive = entry.id === active?.id
            return (
              <li
                key={entry.id}
                className="flex items-center gap-2 rounded-2xl border border-moss/70 bg-night/40 px-3.5 py-3"
              >
                <span className="min-w-0 flex-1 text-[13.5px] font-medium text-cream">
                  {entry.name}
                </span>
                {isActive && (
                  <span className="shrink-0 rounded-full border border-honey/40 bg-honey/10 px-2 py-0.5 text-[10.5px] text-honey">
                    {t('auth.active')}
                  </span>
                )}
                {removingId === entry.id ? (
                  <span className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        removeCaregiver(entry.id)
                        setRemovingId(null)
                      }}
                      className="rounded-lg border border-ember/50 px-2 py-1 text-[11px] text-ember"
                    >
                      {t('common.delete')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemovingId(null)}
                      className="rounded-lg border border-moss px-2 py-1 text-[11px] text-mist"
                    >
                      {t('common.no')}
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setRemovingId(entry.id)}
                    disabled={roster.caregivers.length <= 1}
                    className="shrink-0 rounded-lg border border-moss px-2 py-1 text-[11px] text-mist transition hover:border-ember/50 hover:text-ember disabled:opacity-40"
                  >
                    {t('auth.removeCaregiver')}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
        {roster.caregivers.length <= 1 && (
          <p className="mt-2 text-[11px] text-mist/70">{t('auth.cannotRemoveLast')}</p>
        )}

        <label className="mt-3 flex items-start gap-2.5">
          <input
            type="checkbox"
            checked={roster.remember}
            onChange={(event) => setRemember(event.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[#f0b563]"
          />
          <span className="text-[12px] leading-snug text-mist">{t('auth.remember')}</span>
        </label>
      </Card>

      {adding ? (
        <Card className="rise rise-3 mt-3">
          <form onSubmit={handleAdd} className="space-y-2.5">
            <label className="block">
              <span className="text-[11px] font-medium tracking-[0.14em] text-mist uppercase">
                {t('auth.nameLabel')}
              </span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('auth.namePlaceholder')}
                maxLength={24}
                className={`${INPUT} mt-1.5`}
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium tracking-[0.14em] text-mist uppercase">
                {t('auth.pinLabel')}
              </span>
              <input
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
                type="password"
                inputMode="numeric"
                maxLength={6}
                className={`${INPUT} mt-1.5 tracking-[0.3em]`}
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium tracking-[0.14em] text-mist uppercase">
                {t('auth.pinConfirmLabel')}
              </span>
              <input
                value={confirm}
                onChange={(event) => setConfirm(event.target.value.replace(/\D/g, ''))}
                type="password"
                inputMode="numeric"
                maxLength={6}
                className={`${INPUT} mt-1.5 tracking-[0.3em]`}
              />
            </label>

            {error !== null && (
              <p role="alert" className="text-[12px] text-ember">
                {t(error)}
              </p>
            )}

            <div className="flex gap-2">
              <Button type="submit" disabled={busy} className="flex-1">
                {t('common.save')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setAdding(false)
                  setError(null)
                }}
              >
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <Button variant="secondary" fullWidth className="mt-3" onClick={() => setAdding(true)}>
          {t('auth.addCaregiver')}
        </Button>
      )}

      <Button variant="secondary" fullWidth className="mt-3" onClick={lock}>
        {t('auth.lockNow')}
      </Button>
      <p className="mt-2 text-center text-[11px] text-mist/70">{t('auth.signOutHint')}</p>
    </Screen>
  )
}
