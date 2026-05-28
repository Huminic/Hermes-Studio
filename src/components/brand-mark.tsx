import { cn } from '@/lib/utils'
import type { CSSProperties } from 'react'

type BrandMarkProps = {
  className?: string
  label?: string
  style?: CSSProperties
}

export function BrandMark({ className, label = 'Huminic', style }: BrandMarkProps) {
  return (
    <span
      aria-label={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] font-bold leading-none text-[var(--theme-text)]',
        className,
      )}
      style={{ fontFamily: 'Arial, Helvetica, sans-serif', ...style }}
    >
      h
    </span>
  )
}
