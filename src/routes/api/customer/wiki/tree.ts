/**
 * GET /api/customer/wiki/tree?profile=X
 * AC.3.1 — Customer-editable wiki tree (excludes canon/, governance/, db).
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../../server/customer-auth'
import { listCustomerWikiTree } from '../../../../server/customer-wiki'

export const Route = createFileRoute('/api/customer/wiki/tree')({
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
        return json(listCustomerWikiTree(profile))
      },
    },
  },
})
