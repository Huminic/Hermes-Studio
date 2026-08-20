/**
 * GET /api/customer/cockpit?profile=&window=
 *
 * Serves the Dashboard-landing view model (Reach/Night-Shift gauges, odometer,
 * power-pack heartbeats) for a profile. Profile-scoped auth, availability-safe.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../server/customer-auth'
import { resolveCockpitView } from '../../../server/cockpit/cockpit-data'

function clampWindow(raw: string | null): number {
  const n = Number(raw)
  return n === 7 || n === 90 ? n : 30
}

export const Route = createFileRoute('/api/customer/cockpit')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const profile = url.searchParams.get('profile') ?? ''
        if (!profile) {
          return json({ ok: false, error: 'Missing profile query parameter.' }, { status: 400 })
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Unauthorized for this profile.' }, { status: 403 })
        }
        const windowDays = clampWindow(url.searchParams.get('window'))
        try {
          const view = await resolveCockpitView(profile, windowDays)
          return json({ ok: true, view })
        } catch (err) {
          return json({ ok: false, error: (err as Error).message }, { status: 500 })
        }
      },
    },
  },
})
