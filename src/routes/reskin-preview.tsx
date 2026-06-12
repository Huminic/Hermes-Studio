import { createFileRoute } from '@tanstack/react-router'
import { ReskinNavPreview } from '@/components/reskin-nav-preview'

/**
 * /reskin-preview — NON-PRODUCTION prototype of a regrouped Studio/Workspace
 * left navigation, for Duane to review.
 *
 * This route is self-contained and renders its own chrome (like /stores and
 * /p/$profile*). It does NOT modify or depend on the live nav components. It is
 * NOT wired into the live workspace shell beyond route registration.
 */
export const Route = createFileRoute('/reskin-preview')({
  component: ReskinNavPreview,
})
