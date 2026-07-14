/**
 * GET /api/customer/activity?profile=X[&limit=N] — recent comms/notification/send
 * activity for the profile (newest first) + a 24h summary. Customer session must
 * be authorized for the profile.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthorizedForProfile, resolveSession } from '../../../server/customer-auth'
import { listRecentActivity, activitySummary } from '../../../server/activity-log'

export const Route = createFileRoute('/api/customer/activity')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const profile = url.searchParams.get('profile') ?? ''
        if (!profile) return json({ ok: false, error: 'profile required' }, { status: 400 })
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Forbidden' }, { status: 403 })
        }
        const limitRaw = Number(url.searchParams.get('limit'))
        const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 100
        return json({
          ok: true,
          items: listRecentActivity(profile, { limit }),
          summary: activitySummary(profile),
        })
      },
    },
  },
})
