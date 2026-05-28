'use client'

import { cn } from '@/lib/utils'
import { BrandMark } from '@/components/brand-mark'

export type LogoLoaderProps = {
  className?: string
}

function LogoLoader({ className }: LogoLoaderProps) {
  return (
    <span className="logo-loader-track" aria-hidden="true">
      <BrandMark className={cn('logo-loader-icon size-4 rounded text-[11px]', className)} />
    </span>
  )
}

export { LogoLoader }
