import type { HTMLAttributes, ReactNode } from 'react'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode
}

export function Card({ className = '', children, ...rest }: CardProps) {
  return (
    <div
      className={`rounded-3xl border border-moss/80 bg-canopy/60 p-4 ${className}`.trim()}
      {...rest}
    >
      {children}
    </div>
  )
}
