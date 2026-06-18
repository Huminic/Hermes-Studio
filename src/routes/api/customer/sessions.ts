/**
 * GET /api/customer/sessions?profile=X&agent_id=Y
 *
 * Past chat sessions for the Workspace Chat page slide-out. Read-only over the
 * existing messaging-hub chat threads (no new storage). When agent_id is given,
 * only that agent's sessions are returned.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../server/customer-auth'
import {
  getChatSession,
  listChatSessions,
} from '../../../server/customer-chat-sessions'

export const Route = createFileRoute('/api/customer/sessions')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const profile = url.searchParams.get('profile') ?? ''
        const agentId = url.searchParams.get('agent_id') ?? undefined
        if (!profile) {
          return json(
            { ok: false, error: 'Missing profile query parameter.' },
            { status: 400 },
          )
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json(
            { ok: false, error: 'Unauthorized for this profile.' },
            { status: 403 },
          )
        }
        // Detail fetch: ?session_id=… returns one session's full turns so the
        // Chat page can open it and scroll to the last message.
        const sessionId = url.searchParams.get('session_id')
        if (sessionId) {
          const session = getChatSession(profile, sessionId)
          if (!session) {
            return json({ ok: false, error: 'Session not found.' }, { status: 404 })
          }
          return json({ ok: true, profile, session })
        }

        const sessions = listChatSessions(profile, { agentId })
        return json({ ok: true, profile, sessions })
      },
    },
  },
})
