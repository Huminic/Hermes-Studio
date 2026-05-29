/**
 * GET  /api/customer/audiences?profile=X
 * POST /api/customer/audiences { profile, name, query }
 * POST /api/customer/audiences with action: 'preview' to resolve without saving.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireJsonContentType } from '../../../../server/rate-limit'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../../server/customer-auth'
import {
  createAudience,
  listAudiences,
} from '../../../../server/messaging-hub-store'
import { resolveAudience } from '../../../../server/audience-resolver'

export const Route = createFileRoute('/api/customer/audiences/')({
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
        return json({ ok: true, audiences: listAudiences(profile) })
      },
      POST: async ({ request }) => {
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        const body = (await request.json().catch(() => ({}))) as Record<
          string,
          unknown
        >
        const profile = typeof body.profile === 'string' ? body.profile : ''
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Forbidden' }, { status: 403 })
        }
        const query =
          typeof body.query === 'object' && body.query !== null
            ? (body.query as Record<string, unknown>)
            : {}
        if (body.action === 'preview') {
          const contacts = resolveAudience({ profile, query })
          return json({
            ok: true,
            preview: {
              count: contacts.length,
              sample: contacts.slice(0, 5).map((c) => ({
                id: c.id,
                display_name: c.display_name,
                channels: c.channels,
              })),
            },
          })
        }
        const name =
          typeof body.name === 'string' ? body.name : 'Untitled audience'
        if (!profile) {
          return json({ ok: false, error: 'profile required' }, { status: 400 })
        }
        const audience = createAudience({ profile, name, query })
        return json({ ok: true, audience })
      },
    },
  },
})
