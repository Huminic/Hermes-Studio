/**
 * POST /api/messaging/threads/$threadId/reply
 *
 * AC.5.4 — Reply on a thread. Routes the outbound message via the
 * selected channel's adapter (TextMagic/Vapi/Tavus/email) or falls back
 * to recording an outbound chat message when the channel is 'chat' or
 * when no adapter is wired (dev mode).
 *
 * Body: { profile, channel?, content }
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireJsonContentType } from '../../../server/rate-limit'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../server/customer-auth'
import {
  appendMessage,
  getThread,
} from '../../../server/messaging-hub-store'
import { dispatchOutbound } from '../../../server/messaging-adapters'

export const Route = createFileRoute('/api/messaging/threads/$threadId/reply')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        const body = (await request.json().catch(() => ({}))) as Record<
          string,
          unknown
        >
        const profile = typeof body.profile === 'string' ? body.profile : ''
        const content = typeof body.content === 'string' ? body.content : ''
        if (!profile || !content) {
          return json(
            { ok: false, error: 'profile and content required' },
            { status: 400 },
          )
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Forbidden' }, { status: 403 })
        }
        const thread = getThread(profile, params.threadId)
        if (!thread || thread.profile !== profile) {
          return json({ ok: false, error: 'Not found' }, { status: 404 })
        }
        const channel =
          typeof body.channel === 'string' ? body.channel : thread.channel
        // Outbound dispatch via channel adapter. The adapter is responsible
        // for the actual send; the persistence write happens here regardless
        // so the inbox reflects the attempt.
        const adapterResult = await dispatchOutbound({
          profile,
          channel,
          thread,
          content,
        })
        const message = appendMessage({
          thread_id: thread.id,
          direction: 'outbound',
          role: 'assistant',
          channel,
          content,
          author: session?.username ?? 'customer-admin',
          metadata: {
            via: adapterResult.via,
            adapter_status: adapterResult.status,
            error: adapterResult.error ?? null,
          },
        })
        return json({ ok: true, message, adapter: adapterResult })
      },
    },
  },
})
