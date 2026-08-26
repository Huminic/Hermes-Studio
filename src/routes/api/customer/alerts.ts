/**
 * Alerts API — the manual/created notifications surfaced on the Notifications
 * page (distinct from the routing-rule matrix). Backed by notifications-store.
 *
 * GET    /api/customer/alerts?profile=       → { alerts[], catalog[] }
 * POST   /api/customer/alerts                → create; a metric alert when `metric_id`
 *          is present ({ profile, email, metric_id, rule_type, direction, threshold |
 *          baseline_sigma }), otherwise a manual alert ({ email, query_name, description })
 * DELETE /api/customer/alerts                → { profile, id }
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../server/customer-auth'
import {
  createMetricAlert,
  createNotification,
  deleteNotification,
  listNotifications,
  type AlertDirection,
  type AlertRuleType,
} from '../../../server/watchdog/notifications-store'
import { catalogByCategory, getCatalogMetric } from '../../../server/watchdog/metric-catalog'

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export const Route = createFileRoute('/api/customer/alerts')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const profile = url.searchParams.get('profile') ?? ''
        if (!profile) return json({ ok: false, error: 'Missing profile.' }, { status: 400 })
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Unauthorized for this profile.' }, { status: 403 })
        }
        let alerts: ReturnType<typeof listNotifications> = []
        try {
          alerts = listNotifications(profile)
        } catch {
          alerts = []
        }
        // The metric catalog powers the wizard's metric picker (per-profile identical today).
        return json({ ok: true, alerts, catalog: catalogByCategory() })
      },

      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
        const profile = typeof body.profile === 'string' ? body.profile : ''
        if (!profile) return json({ ok: false, error: 'Missing profile.' }, { status: 400 })
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Unauthorized for this profile.' }, { status: 403 })
        }
        const email = typeof body.email === 'string' ? body.email : ''

        // Metric alert (wizard) when a metric_id is present; else a manual alert.
        if (typeof body.metric_id === 'string' && body.metric_id.trim()) {
          const metric = getCatalogMetric(body.metric_id.trim())
          if (!metric) return json({ ok: false, error: 'Unknown metric.' }, { status: 400 })
          const rule_type = body.rule_type === 'baseline' ? 'baseline' : 'threshold'
          const direction: AlertDirection = body.direction === 'above' ? 'above' : 'below'
          const r = createMetricAlert(
            {
              profile,
              email,
              metric_id: metric.id,
              metric_label: metric.label,
              rule_type: rule_type as AlertRuleType,
              direction,
              threshold: num(body.threshold),
              baseline_sigma: num(body.baseline_sigma),
            },
            Date.now(),
          )
          return r.ok ? json({ ok: true, id: r.id }) : json({ ok: false, error: r.error }, { status: 400 })
        }

        const r = createNotification(
          {
            profile,
            email,
            query_name: typeof body.query_name === 'string' ? body.query_name : '',
            description: typeof body.description === 'string' ? body.description : '',
            source: 'manual',
          },
          Date.now(),
        )
        return r.ok ? json({ ok: true, id: r.id }) : json({ ok: false, error: r.error }, { status: 400 })
      },

      DELETE: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
        const profile = typeof body.profile === 'string' ? body.profile : ''
        const id = typeof body.id === 'string' ? body.id : ''
        if (!profile || !id) return json({ ok: false, error: 'Missing profile or id.' }, { status: 400 })
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Unauthorized for this profile.' }, { status: 403 })
        }
        return json({ ok: deleteNotification(profile, id) })
      },
    },
  },
})
