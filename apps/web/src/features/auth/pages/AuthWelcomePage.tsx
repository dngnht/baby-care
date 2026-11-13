import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
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

/** First-run screen: create the caregiver who is using this device. */
export function AuthWelcomePage() {
  const navigate = useNavigate()
  const roster = useAuth((state) => state.roster)
  const signUp = useAuth((state) => state.signUp)

  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState<TranslationKey | null>(null)
  const [busy, setBusy] = useState(false)

  if (roster.caregivers.length > 0) {
    // Already set up: this page is only for the first caregiver.
    return <Navigate to="/" replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    const result = await signUp(name, pin, confirm, remember)
    setBusy(false)
    if (result !== 'ok') {
      setError(ERROR_KEYS[result])
      return
    }
    setError(null)
    navigate('/', { replace: true })
  }

  return (
    <Screen withNav={false}>
      <header className="rise rise-1 mt-8">
        <p className="text-[10.5px] font-medium tracking-[0.16em] text-honey/80 uppercase">
          {t('auth.welcomeEyebrow')}
        </p>
        <h1 className="mt-2 font-display text-[2.1rem] leading-[1.05] tracking-[-0.02em] text-cream text-balance">
          {t('auth.welcomeTitle')}
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-mist">{t('auth.welcomeSubtitle')}</p>
      </header>

      <Card className="rise rise-2 mt-5">
        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="text-[11px] font-medium tracking-[0.14em] text-mist uppercase">
              {t('auth.nameLabel')}
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('auth.namePlaceholder')}
              maxLength={24}
              autoComplete="name"
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
              autoComplete="new-password"
              maxLength={6}
              className={`${INPUT} mt-1.5 tracking-[0.35em] tabular-nums`}
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
              autoComplete="new-password"
              maxLength={6}
              className={`${INPUT} mt-1.5 tracking-[0.35em] tabular-nums`}
            />
          </label>

          <label className="flex items-start gap-2.5 pt-0.5">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#f0b563]"
            />
            <span className="text-[12px] leading-snug text-mist">{t('auth.remember')}</span>
          </label>

          {error !== null && (
            <p role="alert" className="text-[12px] text-ember">
              {t(error)}
            </p>
          )}

          <Button type="submit" size="lg" fullWidth disabled={busy}>
            {t('auth.start')}
          </Button>
        </form>
      </Card>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-mist/80">{t('auth.localOnly')}</p>
    </Screen>
  )
}
