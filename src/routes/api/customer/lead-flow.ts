/**
 * GET /api/customer/lead-flow?profile=X — read the customer's follow-up flow.
 * PUT /api/customer/lead-flow — save it (body: profile, enabled, steps[]).
 *
 * The escalation flow (Text → no reply → Email → no reply → Call) is
 * customer-editable data, stored in the per-profile messaging-hub.db. The
 * operator master gate (vin.watcher.enabled in studio.yaml) is separate and is
 * surfaced read-only so the UI can tell the customer if follow-up is turned on
 * at the account level. See docs/launch/NEXXUS_FOLLOWUP_FLOW_SPEC.md.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireJsonContentType } from '../../../server/rate-limit'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../server/customer-auth'
import { getLeadFlow, saveLeadFlow } from '../../../server/messaging-hub-store'
import { normalizeFlowSteps } from '../../../server/lead-flow'
import { readStudioConfig } from '../../../server/studio-config'

export const Route = createFileRoute('/api/customer/lead-flow')({
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
        const flow = getLeadFlow(profile)
        // Operator master gate — the customer's flow only runs when this is on.
        const watcherEnabled = !!readStudioConfig(profile).config.vin.watcher.enabled
        return json({
          ok: true,
          flow: flow ?? { profile, enabled: false, steps: [], updated_at: 0 },
          account_enabled: watcherEnabled,
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
        const normalized = normalizeFlowSteps(body.steps)
        if (!normalized.ok) {
          return json({ ok: false, error: normalized.error }, { status: 400 })
        }
        const enabled = body.enabled === true
        const flow = saveLeadFlow({ profile, enabled, steps: normalized.steps })
        return json({ ok: true, flow })
      },
    },
  },
})
