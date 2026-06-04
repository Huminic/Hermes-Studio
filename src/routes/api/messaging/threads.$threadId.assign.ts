/**
 * POST /api/messaging/threads/$threadId/assign
 *
 * WS-8 — Human take-over. Lets the dealership rep STOP the autonomous agent and
 * take over a conversation (or hand it back).
 *
 * The autonomous-reply pipeline (`agent-autonomous-reply.ts`) checks
 * `isHumanAssigned(profile, threadId)` both before generating and immediately
 * before sending. Setting the same `thread_takeover` row here therefore pauses
 * the agent end-to-end; clearing it resumes the agent.
 *
 * Body: { profile, action: 'take_over' | 'hand_back' }
 * `assigned_to` is taken from the authenticated session (the rep) — never the
 * client body, so a rep can't impersonate someone else.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireJsonContentType } from '../../../server/rate-limit'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../server/customer-auth'
import { getThread } from '../../../server/messaging-hub-store'
import {
  assignThreadToHuman,
  releaseThreadToAi,
  isHumanAssigned,
} from '../../../server/thread-takeover'

export const Route = createFileRoute('/api/messaging/threads/$threadId/assign')({
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
        const action = typeof body.action === 'string' ? body.action : ''
        if (!profile || (action !== 'take_over' && action !== 'hand_back')) {
          return json(
            {
              ok: false,
              error: 'profile and action (take_over|hand_back) required',
            },
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

        const assignedTo = session?.username ?? 'customer-admin'
        if (action === 'take_over') {
          assignThreadToHuman(profile, thread.id, assignedTo)
        } else {
          releaseThreadToAi(profile, thread.id)
        }
        return json({
          ok: true,
          thread_id: thread.id,
          human_assigned: isHumanAssigned(profile, thread.id),
          assigned_to: action === 'take_over' ? assignedTo : null,
        })
      },
    },
  },
})
