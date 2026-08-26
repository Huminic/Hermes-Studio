/**
 * HUM-VIN-006 acceptance — DEV-ONLY isolated API surface.
 *
 * GET  /api/dev/vin006-acceptance?profile=X  → the read-only acceptance view (accepted families +
 *      corrected Response Times readback; missing/quarantined = withheld, never zero).
 * POST /api/dev/vin006-acceptance             → record ONE inert notification (no dispatch path).
 *
 * Hard-gated: refuses unless VIN006_ACCEPTANCE_ENABLED === 'true' AND an isolated (non-production)
 * DEV_ANALYTICS_ROOT / BRAIN_PROFILES_ROOT is set. Reads ONLY that analytical root. Never sends.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { buildAcceptanceView, recordInertNotification, AcceptanceViewAbort } from '../../../server/analytics/vin006-acceptance-view'

function analyticsRoot(): string | null {
  const r = process.env.DEV_ANALYTICS_ROOT ?? process.env.BRAIN_PROFILES_ROOT ?? ''
  return r.trim() ? r.trim() : null
}
function guard(): ReturnType<typeof json> | null {
  if (process.env.VIN006_ACCEPTANCE_ENABLED !== 'true') return json({ ok: false, error: 'dev acceptance surface disabled' }, { status: 404 })
  if (!analyticsRoot()) return json({ ok: false, error: 'DEV_ANALYTICS_ROOT not configured' }, { status: 503 })
  return null
}

export const Route = createFileRoute('/api/dev/vin006-acceptance')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const g = guard(); if (g) return g
        const profile = new URL(request.url).searchParams.get('profile') ?? ''
        if (!profile) return json({ ok: false, error: 'profile query parameter required' }, { status: 400 })
        try {
          return json({ ok: true, view: buildAcceptanceView(profile, { analyticsRoot: analyticsRoot()! }) })
        } catch (e) {
          const status = e instanceof AcceptanceViewAbort ? 400 : 500
          return json({ ok: false, error: String((e as Error).message).slice(0, 200) }, { status })
        }
      },
      POST: async ({ request }) => {
        const g = guard(); if (g) return g
        const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
        const profile = String(b.profile ?? ''), metric = String(b.metric ?? ''), recipient = String(b.recipient ?? '')
        if (!profile) return json({ ok: false, error: 'profile required' }, { status: 400 })
        try {
          // Inert RECORD only — no comms-gate / notifyDealer / send path is invoked here.
          const r = recordInertNotification({ profile, metric, recipient, analyticsRoot: analyticsRoot()!, now: new Date().toISOString() })
          return json({ ok: true, outcome: r.outcome, id: r.id, record: r.record, dispatch: 'disabled' })
        } catch (e) {
          const status = e instanceof AcceptanceViewAbort ? 400 : 500
          return json({ ok: false, error: String((e as Error).message).slice(0, 200) }, { status })
        }
      },
    },
  },
})
