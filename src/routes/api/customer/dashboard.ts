/**
 * GET /api/customer/dashboard?profile=X[&window_days=30]
 *
 * Backs the Workspace Dashboard tabs (Funnel / Leads / Pipeline / AI Activity).
 * Federates uploaded VinSolutions ROI/KPI snapshots (Brain report_* tables),
 * live local comms (messaging-hub.db, period-over-period), and the live
 * federated VinSolutions lead funnel. Unsourced metrics come back as
 * status:'pending' (the UI renders "data source pending") — never fabricated.
 *
 * window_days is bounded to the spec selector values 7 / 30 / 90; anything else
 * falls back to 30. Auth: Studio admin or customer-admin scoped to the profile.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { buildDashboard } from '../../../server/dashboard-metrics'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../server/customer-auth'

const ALLOWED_WINDOWS = new Set([7, 30, 90])

export const Route = createFileRoute('/api/customer/dashboard')({
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
        const raw = Number(url.searchParams.get('window_days'))
        const windowDays = ALLOWED_WINDOWS.has(raw) ? raw : 30
        const dashboard = await buildDashboard(profile, { windowDays })
        return json({ ok: true, dashboard })
      },
    },
  },
})
