/**
 * GET /api/messaging/contacts?profile=X
 *
 * AC.5.4 — Contacts listing for the customer-admin.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../server/customer-auth'
import { listContacts } from '../../../server/messaging-hub-store'
import { scrubContact } from '../../../server/dealer-safe'

export const Route = createFileRoute('/api/messaging/contacts')({
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
        // LC-BLOCKER-004: scrub stale provider terms from dealer-visible contacts.
        return json({ ok: true, contacts: listContacts(profile).map(scrubContact) })
      },
    },
  },
})
