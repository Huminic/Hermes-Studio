/**
 * Issues API — the unified manifest for the Issues tab.
 *
 * GET  /api/customer/issues?profile=   → { issues[], ignored_count }
 *   Merges Semantic Watchdog findings (open) + Hunches (open) into one feed with
 *   columns Issue / Date / Category / Name / Details and a Low/Med/High priority.
 * POST /api/customer/issues            → actions:
 *   { action:'dismiss'|'ignore'|'reopen', source, key }
 *   { action:'create-alert', email, query_name, description, source_key }
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../server/customer-auth'
import { listFindings, setFindingStatus } from '../../../server/watchdog/watchdog-store'
import { createNotification } from '../../../server/watchdog/notifications-store'
import { listHunches, resolveHunch } from '../../../server/hunches-store'

type Priority = 'low' | 'medium' | 'high'
type IssueRow = {
  key: string
  source: 'watchdog' | 'hunch'
  category: string
  priority: Priority
  issue: string
  name: string
  details: string
  date: number
}

function hunchPriority(label: string | null): Priority {
  const l = (label ?? '').toLowerCase()
  if (l.includes('high')) return 'high'
  if (l.includes('low')) return 'low'
  return 'medium'
}

export const Route = createFileRoute('/api/customer/issues')({
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
        // ?status=ignored → the Ignored modal list (watchdog findings only).
        if (url.searchParams.get('status') === 'ignored') {
          let ignored: Array<IssueRow> = []
          try {
            ignored = listFindings(profile, { status: 'ignored' }).map((f) => ({
              key: f.key, source: 'watchdog' as const, category: f.category, priority: f.priority,
              issue: f.issue, name: f.name, details: f.details, date: f.last_seen,
            }))
          } catch {
            ignored = []
          }
          return json({ ok: true, issues: ignored })
        }
        const issues: Array<IssueRow> = []
        try {
          for (const f of listFindings(profile, { status: 'open' })) {
            issues.push({
              key: f.key, source: 'watchdog', category: f.category, priority: f.priority,
              issue: f.issue, name: f.name, details: f.details, date: f.last_seen,
            })
          }
        } catch {
          /* availability-safe: no findings table yet → empty */
        }
        let ignoredCount = 0
        try {
          ignoredCount = listFindings(profile, { status: 'ignored' }).length
        } catch {
          ignoredCount = 0
        }
        try {
          for (const hn of listHunches(profile, { status: 'open' })) {
            issues.push({
              key: hn.id, source: 'hunch', category: 'General',
              priority: hunchPriority(hn.confidence_label),
              issue: hn.statement.slice(0, 80),
              name: hn.subject_type ? `${hn.subject_type}` : 'store pattern',
              details: hn.statement, date: hn.ts,
            })
          }
        } catch {
          /* availability-safe */
        }
        const rank = { high: 0, medium: 1, low: 2 }
        issues.sort((a, b) => rank[a.priority] - rank[b.priority] || b.date - a.date)
        return json({ ok: true, issues, ignored_count: ignoredCount })
      },

      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
        const profile = typeof body.profile === 'string' ? body.profile : ''
        if (!profile) return json({ ok: false, error: 'Missing profile.' }, { status: 400 })
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Unauthorized for this profile.' }, { status: 403 })
        }
        const action = typeof body.action === 'string' ? body.action : ''
        const actor = `user:${session?.username ?? 'unknown'}`
        const now = Date.now()

        if (action === 'create-alert') {
          const email = typeof body.email === 'string' ? body.email : ''
          const query_name = typeof body.query_name === 'string' ? body.query_name : ''
          const description = typeof body.description === 'string' ? body.description : ''
          const source = typeof body.source_key === 'string' ? body.source_key : 'manual'
          const r = createNotification({ profile, email, query_name, description, source }, now)
          return r.ok ? json({ ok: true, id: r.id }) : json({ ok: false, error: r.error }, { status: 400 })
        }

        const source = typeof body.source === 'string' ? body.source : 'watchdog'
        const key = typeof body.key === 'string' ? body.key : ''
        if (!key) return json({ ok: false, error: 'Missing key.' }, { status: 400 })

        if (source === 'hunch') {
          if (action === 'reopen') return json({ ok: false, error: 'Hunches cannot be reopened here.' }, { status: 400 })
          const r = resolveHunch({ profile, id: key, resolver_actor: actor, resolution: 'dismissed' })
          return r.ok ? json({ ok: true }) : json({ ok: false, error: r.reason ?? 'blocked' }, { status: 400 })
        }

        const statusMap: Record<string, 'dismissed' | 'ignored' | 'open'> = {
          dismiss: 'dismissed', ignore: 'ignored', reopen: 'open',
        }
        const status = statusMap[action]
        if (!status) return json({ ok: false, error: 'Unknown action.' }, { status: 400 })
        const changed = setFindingStatus(profile, key, status)
        return json({ ok: changed })
      },
    },
  },
})
