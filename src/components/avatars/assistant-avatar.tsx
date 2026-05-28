import { memo } from 'react'
import { cn } from '@/lib/utils'
import { BrandMark } from '@/components/brand-mark'

type AvatarProps = {
  size?: number
  className?: string
}

/**
 * Assistant avatar — Huminic mark.
 */
function AssistantAvatarComponent({ size = 28, className }: AvatarProps) {
  return (
    <BrandMark
      label="Huminic"
      className={cn('shrink-0', className)}
      style={{
        width: size,
        height: size,
        borderRadius: Math.max(4, Math.round(size * 0.15)),
      }}
    />
  )
}

export const AssistantAvatar = memo(AssistantAvatarComponent)
