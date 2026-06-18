/**
 * Saved Ask-AI queries for the Dashboard Custom tab.
 *   GET    /api/customer/dashboard-queries?profile=X        — list
 *   POST   /api/customer/dashboard-queries  { profile, text } — save
 *   DELETE /api/customer/dashboard-queries  { profile, id }   — remove
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireJsonContentType } from '../../../server/rate-limit'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../server/customer-auth'
import {
  listSavedQueries,
  saveQuery,
  deleteSavedQuery,
} from '../../../server/dashboard-queries-store'

export const Route = createFileRoute('/api/customer/dashboard-queries')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const profile = url.searchParams.get('profile') ?? ''
        if (!profile) return json({ ok: false, error: 'profile required' }, { status: 400 })
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Forbidden' }, { status: 403 })
        }
        return json({ ok: true, queries: listSavedQueries(profile) })
      },
      POST: async ({ request }) => {
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
        const profile = typeof body.profile === 'string' ? body.profile : ''
        const text = typeof body.text === 'string' ? body.text : ''
        if (!profile) return json({ ok: false, error: 'profile required' }, { status: 400 })
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Forbidden' }, { status: 403 })
        }
        const result = saveQuery(profile, text)
        if (!result.ok) return json({ ok: false, error: result.error }, { status: 400 })
        return json({ ok: true, query: result.query, queries: listSavedQueries(profile) })
      },
      DELETE: async ({ request }) => {
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
        const profile = typeof body.profile === 'string' ? body.profile : ''
        const id = typeof body.id === 'string' ? body.id : ''
        if (!profile || !id) return json({ ok: false, error: 'profile and id required' }, { status: 400 })
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Forbidden' }, { status: 403 })
        }
        deleteSavedQuery(profile, id)
        return json({ ok: true, queries: listSavedQueries(profile) })
      },
    },
  },
})
