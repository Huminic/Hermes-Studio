/**
 * GET /api/customer/dashboards?profile=X — read the custom dashboard cards.
 * PUT /api/customer/dashboards — save them (body: { profile, dashboards: Card[] }).
 *
 * Cards are composed from metrics /api/customer/reports already computes
 * (calls=vapi, video=tavus, sms, email, chat, leads=vin, service, sales,
 * campaigns, followups). Persisted in studio.yaml under `dashboards`.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireJsonContentType } from '../../../server/rate-limit'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../server/customer-auth'
import { readStudioConfig, updateDashboards } from '../../../server/studio-config'
import { DashboardSources } from '../../../lib/studio-config'

function normalizeCards(
  raw: unknown,
):
  | {
      ok: true
      cards: Array<{
        title: string
        source: string
        visualization: 'number' | 'bar' | 'table'
        display: 'summary' | 'detail'
      }>
    }
  | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: 'dashboards must be an array' }
  const allowed = new Set<string>(DashboardSources)
  const visualizations = new Set(['number', 'bar', 'table'])
  const displays = new Set(['summary', 'detail'])
  const cards: Array<{
    title: string
    source: string
    visualization: 'number' | 'bar' | 'table'
    display: 'summary' | 'detail'
  }> = []
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i] as Record<string, unknown>
    const title = typeof c?.title === 'string' ? c.title.trim() : ''
    const source = typeof c?.source === 'string' ? c.source.trim() : ''
    const visualization =
      typeof c?.visualization === 'string' && visualizations.has(c.visualization)
        ? (c.visualization as 'number' | 'bar' | 'table')
        : 'number'
    const display =
      typeof c?.display === 'string' && displays.has(c.display)
        ? (c.display as 'summary' | 'detail')
        : 'summary'
    if (!title) return { ok: false, error: `card ${i + 1}: title is required` }
    if (!allowed.has(source)) {
      return { ok: false, error: `card ${i + 1}: unknown source "${source}"` }
    }
    cards.push({ title, source, visualization, display })
  }
  return { ok: true, cards }
}

export const Route = createFileRoute('/api/customer/dashboards')({
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
          dashboards: config.dashboards ?? [],
          sources: DashboardSources,
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
        const normalized = normalizeCards(body.dashboards)
        if (!normalized.ok) {
          return json({ ok: false, error: normalized.error }, { status: 400 })
        }
        const result = updateDashboards(profile, normalized.cards)
        if (!result.ok) {
          return json({ ok: false, error: result.error }, { status: 400 })
        }
        return json({ ok: true, dashboards: result.dashboards })
      },
    },
  },
})
