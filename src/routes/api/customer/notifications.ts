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
import {
  readStudioConfig,
  updateNotificationRouting,
  readManagementAudience,
  updateManagementAudience,
} from '../../../server/studio-config'
import { NotificationEvents } from '../../../lib/studio-config'

const E164_RE = /^\+[1-9]\d{6,14}$/

/**
 * Normalize + validate the management-audience block (N3.1). Emails must contain
 * '@'; cells must be E.164 (+1…). Blank lines are dropped. Returns the cleaned
 * lists + switches, or an error naming the first bad entry.
 */
function normalizeAudience(
  raw: unknown,
):
  | { ok: true; emails: string[]; cells: string[]; reportsEnabled: boolean; alertsEnabled: boolean }
  | { ok: false; error: string } {
  const o = (raw ?? {}) as Record<string, unknown>
  const toList = (v: unknown): string[] =>
    (Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\n,]/) : [])
      .map((s) => String(s).trim())
      .filter(Boolean)
  const emails = toList(o.emails)
  const cells = toList(o.cells)
  for (const e of emails) {
    if (!e.includes('@')) return { ok: false, error: `"${e}" is not a valid email` }
  }
  for (const c of cells) {
    if (!E164_RE.test(c)) return { ok: false, error: `"${c}" is not a valid E.164 phone (+1…)` }
  }
  return {
    ok: true,
    emails,
    cells,
    reportsEnabled: o.reportsEnabled === true,
    alertsEnabled: o.alertsEnabled === true,
  }
}

type RuleInput = {
  event: string
  to: string
  channel?: 'email' | 'sms'
  format?: 'adf-xml' | 'email'
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
    const format =
      r?.format === 'adf-xml' ? 'adf-xml' : r?.format === 'email' ? 'email' : undefined
    rules.push({
      event,
      to,
      channel,
      ...(format ? { format } : {}),
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
        const audience = readManagementAudience(profile)
        return json({
          ok: true,
          routing: config.notifications.routing ?? [],
          // Context for the UI: the legacy single recipient + the built-in
          // condition keys the dropdown should offer (Guardian conditions are
          // free-form text once #208/#209 emit them).
          lead_recipient: config.notifications.lead_recipient ?? null,
          lead_format: config.notifications.lead_format ?? 'email',
          known_events: NotificationEvents,
          // N3.1 — the ONE management audience (reports + wrap-up text + alerts).
          management_audience: {
            emails: audience.emails,
            cells: audience.cells,
            reportsEnabled: audience.reportsEnabled,
            alertsEnabled: audience.alertsEnabled,
          },
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
        const hasRouting = 'routing' in body
        const hasAudience = 'management_audience' in body
        if (!hasRouting && !hasAudience) {
          return json({ ok: false, error: 'nothing to save' }, { status: 400 })
        }

        let savedRouting: Array<RuleInput> | undefined
        if (hasRouting) {
          const normalized = normalizeRouting(body.routing)
          if (!normalized.ok) {
            return json({ ok: false, error: normalized.error }, { status: 400 })
          }
          const result = updateNotificationRouting(profile, normalized.rules)
          if (!result.ok) {
            return json({ ok: false, error: result.error }, { status: 400 })
          }
          savedRouting = result.routing as Array<RuleInput>
        }

        let savedAudience:
          | { emails: string[]; cells: string[]; reportsEnabled: boolean; alertsEnabled: boolean }
          | undefined
        if (hasAudience) {
          const norm = normalizeAudience(body.management_audience)
          if (!norm.ok) {
            return json({ ok: false, error: norm.error }, { status: 400 })
          }
          const res = updateManagementAudience(profile, {
            emails: norm.emails,
            cells: norm.cells,
            reportsEnabled: norm.reportsEnabled,
            alertsEnabled: norm.alertsEnabled,
          })
          if (!res.ok) {
            return json({ ok: false, error: res.error }, { status: 400 })
          }
          savedAudience = {
            emails: norm.emails,
            cells: norm.cells,
            reportsEnabled: norm.reportsEnabled,
            alertsEnabled: norm.alertsEnabled,
          }
        }

        return json({
          ok: true,
          ...(savedRouting ? { routing: savedRouting } : {}),
          ...(savedAudience ? { management_audience: savedAudience } : {}),
        })
      },
    },
  },
})
