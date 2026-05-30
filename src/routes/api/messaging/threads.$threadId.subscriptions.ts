/**
 * GET  /api/messaging/threads/$threadId/subscriptions?profile=X
 * POST /api/messaging/threads/$threadId/subscriptions
 *
 * AC.5.8 — per-thread agent subscription CRUD. Body for POST:
 * { profile, agent_id, channel, mode, rules? }
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireJsonContentType } from '../../../server/rate-limit'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../server/customer-auth'
import {
  listSubscriptionsForThread,
  subscribeAgentToThread,
} from '../../../server/messaging-hub-store'

export const Route = createFileRoute(
  '/api/messaging/threads/$threadId/subscriptions',
)({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url)
        const profile = url.searchParams.get('profile') ?? ''
        if (!profile) {
          return json({ ok: false, error: 'profile required' }, { status: 400 })
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Forbidden' }, { status: 403 })
        }
        return json({
          ok: true,
          subscriptions: listSubscriptionsForThread(profile, params.threadId),
        })
      },
      POST: async ({ request, params }) => {
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        const body = (await request.json().catch(() => ({}))) as Record<
          string,
          unknown
        >
        const profile = typeof body.profile === 'string' ? body.profile : ''
        const agentId = typeof body.agent_id === 'string' ? body.agent_id : ''
        const channel = typeof body.channel === 'string' ? body.channel : ''
        const mode = body.mode === 'reply' ? 'reply' : 'monitor'
        const rules =
          typeof body.rules === 'object' && body.rules !== null
            ? (body.rules as Record<string, unknown>)
            : {}
        if (!profile || !agentId || !channel) {
          return json(
            { ok: false, error: 'profile, agent_id, channel required' },
            { status: 400 },
          )
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Forbidden' }, { status: 403 })
        }
        subscribeAgentToThread({
          thread_id: params.threadId,
          agent_id: agentId,
          profile,
          channel,
          mode,
          rules,
          created_at: Date.now(),
        })
        return json({ ok: true })
      },
    },
  },
})
