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
  deleteAudience,
} from '../../../../server/messaging-hub-store'
import { resolveAudience } from '../../../../server/audience-resolver'
import { buildCrmAudience } from '../../../../server/crm-audience'

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
        if (body.action === 'crm_query') {
          const result = await buildCrmAudience({
            profile,
            name: typeof body.name === 'string' ? body.name : undefined,
            days: typeof body.days === 'number' ? body.days : undefined,
            limit: typeof body.limit === 'number' ? body.limit : undefined,
          })
          if (!result.ok) {
            return json({ ok: false, error: result.error }, { status: 502 })
          }
          return json(result)
        }
        const name =
          typeof body.name === 'string' ? body.name : 'Untitled audience'
        if (!profile) {
          return json({ ok: false, error: 'profile required' }, { status: 400 })
        }
        const audience = createAudience({ profile, name, query })
        return json({ ok: true, audience })
      },
      DELETE: async ({ request }) => {
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        const body = (await request.json().catch(() => ({}))) as Record<
          string,
          unknown
        >
        const profile = typeof body.profile === 'string' ? body.profile : ''
        const id = typeof body.id === 'string' ? body.id : ''
        if (!profile || !id) {
          return json(
            { ok: false, error: 'profile and id required' },
            { status: 400 },
          )
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Forbidden' }, { status: 403 })
        }
        const removed = deleteAudience(profile, id)
        if (!removed) {
          return json({ ok: false, error: 'List not found' }, { status: 404 })
        }
        return json({ ok: true })
      },
    },
  },
})
