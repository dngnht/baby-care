import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'md' | 'lg'

const BASE =
  'inline-flex select-none items-center justify-center gap-2 rounded-2xl font-medium transition active:scale-[0.985] disabled:pointer-events-none disabled:opacity-50'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-honey text-night hover:bg-honey/90',
  secondary: 'border border-moss bg-canopy/70 text-cream hover:border-honey/50',
  ghost: 'text-mist hover:text-cream',
  danger: 'border border-ember/50 bg-ember/10 text-ember hover:bg-ember/20',
}

const SIZES: Record<ButtonSize, string> = {
  md: 'min-h-12 px-4 text-[15px]',
  lg: 'min-h-14 px-6 text-base',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  children?: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [BASE, VARIANTS[variant], SIZES[size], fullWidth ? 'w-full' : '', className]
    .filter(Boolean)
    .join(' ')

  return <button type={type} className={classes} {...rest} />
}
