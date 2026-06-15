import { createFileRoute, redirect } from '@tanstack/react-router'

/**
 * `studio.huminic.app/` is the Global Huminic Studio backend root (Duane's
 * entrypoint correction, 2026-06-09): the root opens Global Studio
 * login/dashboard behavior, NOT the store chooser.
 *
 * - Unauthenticated → /chat renders the Studio login (it's a protected path).
 * - Studio admin (is_admin) → Studio chat.
 * - A Workspace (customer-admin) session → WorkspaceShell routes it on to its own
 *   /p/<profile>/chat (LC-BLOCKER-006). The boundary is unchanged.
 *
 * The optional store chooser is preserved at /stores. Direct Workspace
 * (/p/<profile>/chat) and Storefront (/p/<profile>, widget) routes are unchanged.
 */
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/chat' })
  },
})
