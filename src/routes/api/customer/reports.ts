/**
 * GET /api/customer/reports?profile=X[&window_days=30]
 *
 * P3 native reports — backs the customer-console Data page. Returns comms
 * volume + sales/service thread split + campaign rollups (from the profile's
 * messaging-hub.db) and a LIVE federated VinSolutions lead funnel (only when
 * the profile declares a VIN federation read-scope; never synced).
 *
 * Auth: Studio admin or customer-admin scoped to the requested profile.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { buildCustomerReports } from '../../../server/customer-reports'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../server/customer-auth'

export const Route = createFileRoute('/api/customer/reports')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const profile = url.searchParams.get('profile') ?? ''
        if (!profile) {
          return json(
            { ok: false, error: 'Missing profile query parameter.' },
            { status: 400 },
          )
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json(
            { ok: false, error: 'Unauthorized for this profile.' },
            { status: 403 },
          )
        }
        const rawWindow = Number(url.searchParams.get('window_days'))
        const windowDays =
          Number.isFinite(rawWindow) && rawWindow > 0 && rawWindow <= 365
            ? Math.floor(rawWindow)
            : undefined
        const reports = await buildCustomerReports(profile, { windowDays })
        return json({ ok: true, reports })
      },
    },
  },
})
