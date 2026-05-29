/**
 * GET /api/customer/wiki/read?profile=X&path=...
 * AC.3.1 — Read a customer wiki file.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../../server/customer-auth'
import { readCustomerWikiFile } from '../../../../server/customer-wiki'

export const Route = createFileRoute('/api/customer/wiki/read')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const profile = url.searchParams.get('profile') ?? ''
        const p = url.searchParams.get('path') ?? ''
        if (!profile || !p) {
          return json(
            { ok: false, error: 'profile and path required' },
            { status: 400 },
          )
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Forbidden' }, { status: 403 })
        }
        const result = readCustomerWikiFile(profile, p)
        if (!result.ok) {
          return json(result, { status: 404 })
        }
        return json({ ok: true, path: p, content: result.content })
      },
    },
  },
})
