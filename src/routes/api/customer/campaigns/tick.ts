/**
 * POST /api/customer/campaigns/tick
 *
 * AC.8.4 — Customer-admin scheduled-send tick. Cron-style job calls
 * this every N minutes to dispatch due campaigns.
 * Body: { profile }
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireJsonContentType } from '../../../../server/rate-limit'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../../server/customer-auth'
import { tickCampaigns } from '../../../../server/campaign-worker'

export const Route = createFileRoute('/api/customer/campaigns/tick')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        const body = (await request.json().catch(() => ({}))) as Record<
          string,
          unknown
        >
        const profile = typeof body.profile === 'string' ? body.profile : ''
        if (!profile) {
          return json({ ok: false, error: 'profile required' }, { status: 400 })
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Forbidden' }, { status: 403 })
        }
        const results = await tickCampaigns({ profile })
        return json({ ok: true, results })
      },
    },
  },
})
