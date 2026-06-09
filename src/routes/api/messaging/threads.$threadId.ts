/**
 * GET /api/messaging/threads/$threadId?profile=X
 *
 * AC.5.4 — Thread detail with messages.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../server/customer-auth'
import { getThread } from '../../../server/messaging-hub-store'
import { isHumanAssigned } from '../../../server/thread-takeover'
import { scrubThreadDetail } from '../../../server/dealer-safe'

export const Route = createFileRoute('/api/messaging/threads/$threadId')({
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
        const thread = getThread(profile, params.threadId)
        if (!thread || thread.profile !== profile) {
          return json({ ok: false, error: 'Not found' }, { status: 404 })
        }
        return json({
          ok: true,
          // LC-BLOCKER-004: scrub stale provider terms + drop internal metadata.
          thread: scrubThreadDetail({
            ...thread,
            human_assigned: isHumanAssigned(profile, thread.id),
          }),
        })
      },
    },
  },
})
