/**
 * GET /api/messaging/threads?profile=X&domain=Y&channel=Z&status=open
 *
 * AC.5.4 — Thread listing for the Comms inbox.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../server/customer-auth'
import { listThreads, type ThreadStatus } from '../../../server/messaging-hub-store'
import { safeThreadPreview, scrubThreadListItem } from '../../../server/dealer-safe'

export const Route = createFileRoute('/api/messaging/threads')({
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
        const domain = url.searchParams.get('domain') ?? undefined
        const channel = url.searchParams.get('channel') ?? undefined
        const statusStr = url.searchParams.get('status')
        const status = ((): ThreadStatus | undefined => {
          if (statusStr === 'open' || statusStr === 'snoozed' || statusStr === 'closed') {
            return statusStr
          }
          return undefined
        })()
        const limit = Number(url.searchParams.get('limit') ?? '100')
        const threads = listThreads({
          profile,
          domain,
          channel,
          status,
          limit: Number.isFinite(limit) ? Math.min(limit, 500) : 100,
        })
        return json({
          ok: true,
          // LC-BLOCKER-004: scrub stale provider terms from dealer-visible fields.
          threads: threads.map((t) => scrubThreadListItem({
            id: t.id,
            profile: t.profile,
            domain: t.domain,
            channel: t.channel,
            subject: t.subject,
            contact_handle: t.contact_handle,
            assigned_agent_id: t.assigned_agent_id,
            status: t.status,
            created_at: t.created_at,
            updated_at: t.updated_at,
            message_count: t.messages.length,
            // Preview from the most recent SHOPPER-FACING message. Skips
            // system/notification annotations AND any message that reads like
            // the agent persona/system prompt — including legacy rows that
            // start directly with "You are Caroline…" (no `system:` prefix).
            // Falls back to an older real message rather than leak the prompt
            // (PFF-007). Non-destructive — render-time only.
            last_message_preview: safeThreadPreview(t.messages),
          })),
        })
      },
    },
  },
})
