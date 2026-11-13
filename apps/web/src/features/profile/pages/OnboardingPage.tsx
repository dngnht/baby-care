import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useActiveBaby } from '../../../core/baby/activeBaby'
import { getRepo } from '../../../core/db/repo'
import type { Sex } from '../../../core/db/schema'
import { t, type TranslationKey } from '../../../core/i18n'
import { toDayKey } from '../../../core/time/day'
import { Button } from '../../../ui/Button'
import { Screen } from '../../../ui/Screen'
import { AgePreview } from '../components/AgePreview'
import { Field } from '../components/Field'
import { SexChoice } from '../components/SexChoice'
import {
  DEFAULT_GESTATIONAL_WEEKS,
  GESTATIONAL_WEEKS_MAX,
  GESTATIONAL_WEEKS_MIN,
  describeAge,
  parseBirthDate,
  validateGestationalWeeks,
} from '../logic/age'

const INPUT_BASE =
  'w-full rounded-2xl border border-moss bg-canopy/70 px-4 py-3.5 text-[15px] text-cream caret-honey transition [color-scheme:dark] placeholder:text-mist/50 focus:border-honey/70'

const NAME_MAX_LENGTH = 30

type FormErrorField = 'sex' | 'birthDate' | 'gestWeeks' | 'form'

type FormErrors = Partial<Record<FormErrorField, TranslationKey>>

/**
 * T010 — the 4-field onboarding that creates the one baby profile.
 * Values are validated with the pure helpers in `../logic/age`; the store and
 * the shell take over as soon as the profile exists.
 */
export function OnboardingPage() {
  const navigate = useNavigate()
  const status = useActiveBaby((state) => state.status)
  const load = useActiveBaby((state) => state.load)

  const [name, setName] = useState('')
  const [sex, setSex] = useState<Sex | null>(null)
  const [birthDateInput, setBirthDateInput] = useState('')
  const [weeksInput, setWeeksInput] = useState(String(DEFAULT_GESTATIONAL_WEEKS))
  const [errors, setErrors] = useState<FormErrors>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (status === 'loading') void load()
  }, [status, load])

  // A profile already exists (e.g. deep link to /onboarding): never create a second one.
  if (status === 'loading') {
    return (
      <Screen withNav={false}>
        <p className="mt-24 text-center text-sm text-mist">{t('common.loading')}</p>
      </Screen>
    )
  }

  if (status === 'ready') return <Navigate to="/" replace />

  const birthDate = parseBirthDate(birthDateInput)
  const weeks = validateGestationalWeeks(weeksInput)
  const preview =
    birthDate !== null && weeks !== null
      ? {
          age: describeAge({
            birthDate: birthDate.toISOString(),
            gestationalWeeks: weeks,
          }),
          weeks,
        }
      : null

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return

    const nextErrors: FormErrors = {}
    if (sex === null) nextErrors.sex = 'onboarding.error.sex'
    if (birthDateInput.trim() === '') nextErrors.birthDate = 'onboarding.error.birthDate'
    else if (birthDate === null) nextErrors.birthDate = 'onboarding.error.birthDateFuture'
    if (weeks === null) nextErrors.gestWeeks = 'onboarding.error.gestWeeks'

    if (sex === null || birthDate === null || weeks === null) {
      setErrors(nextErrors)
      return
    }

    setErrors({})
    setSaving(true)

    try {
      const baby = await getRepo().createBaby({
        name: name.trim(),
        sex,
        birthDate,
        gestationalWeeks: weeks,
      })
      useActiveBaby.getState().setBaby(baby)
      navigate('/', { replace: true })
    } catch {
      setSaving(false)
      setErrors({ form: 'onboarding.error.save' })
    }
  }

  const birthDateInvalid = errors.birthDate !== undefined
  const weeksInvalid = errors.gestWeeks !== undefined
  const sexInvalid = errors.sex !== undefined

  return (
    <Screen withNav={false} className="overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-24 z-0 h-80 bg-[radial-gradient(58%_55%_at_50%_50%,rgba(240,181,99,0.16),rgba(224,122,79,0.05)_58%,transparent_78%)]"
      />
      <div aria-hidden="true" className="grain pointer-events-none absolute inset-0 z-0" />

      <div className="relative z-10 flex flex-1 flex-col">
        <header className="rise rise-1 flex items-center justify-between">
          <span className="font-display text-[17px] tracking-tight text-cream">
            {t('app.name')}
            <span className="text-honey">.</span>
          </span>
          <span className="rounded-full border border-moss px-3 py-1 text-[10px] font-medium tracking-[0.1em] text-mist">
            {t('common.localOnly')}
          </span>
        </header>

        <div className="pt-9">
          <p className="rise rise-2 text-[10.5px] font-medium tracking-[0.16em] text-honey/80 uppercase">
            {t('onboarding.eyebrow')}
          </p>
          <h1 className="rise rise-2 mt-3 font-display text-[2.5rem] leading-[1.03] tracking-[-0.02em] text-cream text-balance">
            {t('onboarding.title')}
          </h1>
          <p className="rise rise-3 mt-3 max-w-[21rem] text-[14px] leading-[1.6] text-cream/60 text-pretty">
            {t('onboarding.subtitle')}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="rise rise-4 mt-7 flex flex-1 flex-col gap-5"
        >
          <Field
            id="baby-name"
            label={t('onboarding.nameLabel')}
            aside={t('onboarding.nameOptional')}
          >
            <input
              id="baby-name"
              name="babyName"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={NAME_MAX_LENGTH}
              autoComplete="off"
              placeholder={t('onboarding.namePlaceholder')}
              className={INPUT_BASE}
            />
          </Field>

          <fieldset
            className="min-w-0"
            aria-describedby={sexInvalid ? 'baby-sex-error' : undefined}
          >
            <legend className="mb-2 text-[13px] font-medium text-cream/85">
              {t('onboarding.sexLabel')}
            </legend>
            <SexChoice value={sex} onChange={setSex} invalid={sexInvalid} />
            {sexInvalid && errors.sex !== undefined && (
              <p id="baby-sex-error" role="alert" className="mt-1.5 text-[12px] text-ember">
                {t(errors.sex)}
              </p>
            )}
          </fieldset>

          <Field
            id="birth-date"
            label={t('onboarding.birthDateLabel')}
            error={errors.birthDate !== undefined ? t(errors.birthDate) : undefined}
          >
            <input
              id="birth-date"
              name="birthDate"
              type="date"
              value={birthDateInput}
              max={toDayKey(new Date())}
              onChange={(event) => setBirthDateInput(event.target.value)}
              aria-invalid={birthDateInvalid}
              aria-describedby={birthDateInvalid ? 'birth-date-error' : undefined}
              className={`${INPUT_BASE} ${birthDateInvalid ? 'border-ember/60' : ''}`.trim()}
            />
          </Field>

          <Field
            id="gest-weeks"
            label={t('onboarding.gestWeeksLabel')}
            hint={t('onboarding.gestWeeksHint')}
            error={errors.gestWeeks !== undefined ? t(errors.gestWeeks) : undefined}
          >
            <input
              id="gest-weeks"
              name="gestationalWeeks"
              type="number"
              inputMode="numeric"
              min={GESTATIONAL_WEEKS_MIN}
              max={GESTATIONAL_WEEKS_MAX}
              step={1}
              value={weeksInput}
              onChange={(event) => setWeeksInput(event.target.value)}
              aria-invalid={weeksInvalid}
              aria-describedby={weeksInvalid ? 'gest-weeks-error' : 'gest-weeks-hint'}
              className={`${INPUT_BASE} max-w-[7.5rem] text-center font-medium tabular-nums ${
                weeksInvalid ? 'border-ember/60' : ''
              }`.trim()}
            />
          </Field>

          {preview !== null && <AgePreview age={preview.age} weeks={preview.weeks} />}

          <div className="mt-auto space-y-4 pt-4">
            {errors.form !== undefined && (
              <p role="alert" className="text-center text-[12.5px] text-ember">
                {t(errors.form)}
              </p>
            )}

            <Button type="submit" size="lg" fullWidth disabled={saving}>
              {saving ? t('common.saving') : t('onboarding.submit')}
            </Button>

            <p className="text-center text-[11px] leading-relaxed text-mist/75">
              {t('onboarding.privacy')}
            </p>
          </div>
        </form>
      </div>
    </Screen>
  )
}
