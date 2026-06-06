/**
 * GET /api/customer/notifications?profile=X — read the notification routing matrix.
 * PUT /api/customer/notifications — save it (body: { profile, routing: Rule[] }).
 *
 * The matrix (#207) maps a CONDITION (a built-in lead/inbound event OR a
 * Guardian/query condition key) to recipients × channels. It's the routing layer
 * in front of the alert bus: lead events route today; Business Guardian (#208) /
 * Performance Guardian (#209) conditions plug into the same matrix when they land.
 * Persisted in studio.yaml under `notifications.routing`.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireJsonContentType } from '../../../server/rate-limit'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../server/customer-auth'
import { readStudioConfig, updateNotificationRouting } from '../../../server/studio-config'
import { NotificationEvents } from '../../../lib/studio-config'

type RuleInput = {
  event: string
  to: string
  channel?: 'email' | 'sms'
  label?: string
  enabled?: boolean
}

/** Normalize + validate an incoming routing array. Returns rules or an error. */
function normalizeRouting(
  raw: unknown,
): { ok: true; rules: Array<RuleInput> } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: 'routing must be an array' }
  const rules: Array<RuleInput> = []
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i] as Record<string, unknown>
    const event = typeof r?.event === 'string' ? r.event.trim() : ''
    const to = typeof r?.to === 'string' ? r.to.trim() : ''
    if (!event) return { ok: false, error: `rule ${i + 1}: condition (event) is required` }
    if (!to) return { ok: false, error: `rule ${i + 1}: recipient (to) is required` }
    const channel = r?.channel === 'sms' ? 'sms' : 'email'
    if (channel === 'email' && !to.includes('@')) {
      return { ok: false, error: `rule ${i + 1}: "${to}" is not a valid email` }
    }
    rules.push({
      event,
      to,
      channel,
      label: typeof r?.label === 'string' ? r.label.trim() || undefined : undefined,
      enabled: r?.enabled !== false,
    })
  }
  return { ok: true, rules }
}

export const Route = createFileRoute('/api/customer/notifications')({
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
        const { config } = readStudioConfig(profile)
        return json({
          ok: true,
          routing: config.notifications.routing ?? [],
          // Context for the UI: the legacy single recipient + the built-in
          // condition keys the dropdown should offer (Guardian conditions are
          // free-form text once #208/#209 emit them).
          lead_recipient: config.notifications.lead_recipient ?? null,
          lead_format: config.notifications.lead_format ?? 'email',
          known_events: NotificationEvents,
        })
      },
      PUT: async ({ request }) => {
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
        const normalized = normalizeRouting(body.routing)
        if (!normalized.ok) {
          return json({ ok: false, error: normalized.error }, { status: 400 })
        }
        const result = updateNotificationRouting(profile, normalized.rules)
        if (!result.ok) {
          return json({ ok: false, error: result.error }, { status: 400 })
        }
        return json({ ok: true, routing: result.routing })
      },
    },
  },
})
