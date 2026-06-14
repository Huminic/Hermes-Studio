/**
 * Customer-facing Hunches API (WF-009) — Semantic Guardian review surface.
 *
 *   GET  /api/customer/hunches?profile=X[&status=open]
 *        Read-only list of Semantic Guardian hunches for the profile.
 *
 *   POST /api/customer/hunches
 *        Record a REVIEW DECISION only (accept → resolved, deny → dismissed).
 *        This updates the hunch's own status + writes a Brain audit row via
 *        resolveHunch. It NEVER executes the hunch's proposed_action, so it
 *        cannot mutate production knowledge, customer data, source data,
 *        contacts, campaigns, or reports (WF-009 acceptance criterion #7).
 *        "Defer" is a client-side, non-mutating choice — it makes no request.
 *
 * Auth: Studio admin, scoped partner with this profile, or the store's
 * customer-admin (isAuthorizedForProfile).
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../server/customer-auth'
import { listHunches, resolveHunch } from '../../../server/hunches-store'

export const Route = createFileRoute('/api/customer/hunches')({
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
        const statusParam = url.searchParams.get('status')
        const status =
          statusParam === 'open' ||
          statusParam === 'resolved' ||
          statusParam === 'dismissed'
            ? statusParam
            : 'open'
        const hunches = listHunches(profile, { status, limit: 200 }).map(
          (h) => ({
            id: h.id,
            ts: h.ts,
            guardian: h.originating_guardian,
            subject_type: h.subject_type,
            statement: h.statement,
            confidence: h.confidence_label,
            status: h.status,
            // proposed_action is shown as a LABEL only; it is never executed here.
            proposed_action: h.proposed_action,
          }),
        )
        return json({ ok: true, profile, hunches })
      },

      POST: async ({ request }) => {
        const session = resolveSession(request)
        let body: { profile?: string; id?: string; decision?: string }
        try {
          body = (await request.json()) as typeof body
        } catch {
          return json({ ok: false, error: 'Invalid JSON.' }, { status: 400 })
        }
        const profile = String(body.profile ?? '')
        const id = String(body.id ?? '')
        const decision = String(body.decision ?? '')
        if (!profile || !id || !decision) {
          return json(
            { ok: false, error: 'profile, id, decision required' },
            { status: 400 },
          )
        }
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Forbidden' }, { status: 403 })
        }
        // accept/deny record a review decision only. defer is client-side and
        // must never reach the server as a mutation.
        const resolution =
          decision === 'accept'
            ? 'resolved'
            : decision === 'deny'
              ? 'dismissed'
              : null
        if (!resolution) {
          return json(
            {
              ok: false,
              error:
                'decision must be "accept" or "deny" (defer is client-side)',
            },
            { status: 400 },
          )
        }
        const res = resolveHunch({
          profile,
          id,
          resolver_actor: session?.username ?? `customer-admin-${profile}`,
          resolution,
          resolution_notes: `review decision: ${decision} (no production action executed)`,
        })
        if (!res.ok) {
          return json(
            {
              ok: false,
              error: res.reason ?? 'resolve blocked',
              rule: res.rule,
            },
            { status: 409 },
          )
        }
        return json({ ok: true, id, status: resolution })
      },
    },
  },
})
