/**
 * GET /api/customer/performance?profile=X[&window_days=30]
 *
 * Per-store performance dashboard backend — backs the customer-console
 * Dashboard page. Returns lead (thread) + message counts grouped by channel
 * and by domain/type (sales/service) with aggregate totals, over the profile's
 * messaging-hub.db. Read-only. `window_days` (1..365) bounds to a recent
 * window; omit/0 for all-time.
 *
 * Auth: Studio admin or customer-admin scoped to the requested profile
 * (mirrors /api/customer/reports).
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { aggregatePerformance } from '../../../server/messaging-hub-store'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../server/customer-auth'

export const Route = createFileRoute('/api/customer/performance')({
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
        const sinceMs = windowDays
          ? Date.now() - windowDays * 24 * 60 * 60 * 1000
          : undefined
        const performance = aggregatePerformance(profile, sinceMs)
        return json({
          ok: true,
          profile,
          window_days: windowDays ?? null,
          generated_at: Date.now(),
          performance,
        })
      },
    },
  },
})
