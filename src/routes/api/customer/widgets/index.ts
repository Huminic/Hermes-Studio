/**
 * GET /api/customer/widgets?profile=X
 * AC.4.1 — Customer-admin widget list (slug + mode + agent + status +
 * embed snippet + preview URL).
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../../server/customer-auth'
import { listCustomerWidgets } from '../../../../server/customer-widgets'

export const Route = createFileRoute('/api/customer/widgets/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const profile = url.searchParams.get('profile') ?? ''
        if (!profile) {
          return json({ ok: false, error: 'profile required' }, { status: 400 })
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Forbidden' }, { status: 403 })
        }
        return json(listCustomerWidgets(profile))
      },
    },
  },
})
