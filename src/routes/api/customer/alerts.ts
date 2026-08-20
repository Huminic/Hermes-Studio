/**
 * Alerts API — the manual/created notifications surfaced on the Notifications
 * page (distinct from the routing-rule matrix). Backed by notifications-store.
 *
 * GET    /api/customer/alerts?profile=       → { alerts[] }
 * POST   /api/customer/alerts                → create { profile, email, query_name, description }
 * DELETE /api/customer/alerts                → { profile, id }
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../server/customer-auth'
import {
  createNotification,
  deleteNotification,
  listNotifications,
} from '../../../server/watchdog/notifications-store'

export const Route = createFileRoute('/api/customer/alerts')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const profile = url.searchParams.get('profile') ?? ''
        if (!profile) return json({ ok: false, error: 'Missing profile.' }, { status: 400 })
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Unauthorized for this profile.' }, { status: 403 })
        }
        let alerts: ReturnType<typeof listNotifications> = []
        try {
          alerts = listNotifications(profile)
        } catch {
          alerts = []
        }
        return json({ ok: true, alerts })
      },

      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
        const profile = typeof body.profile === 'string' ? body.profile : ''
        if (!profile) return json({ ok: false, error: 'Missing profile.' }, { status: 400 })
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Unauthorized for this profile.' }, { status: 403 })
        }
        const r = createNotification(
          {
            profile,
            email: typeof body.email === 'string' ? body.email : '',
            query_name: typeof body.query_name === 'string' ? body.query_name : '',
            description: typeof body.description === 'string' ? body.description : '',
            source: 'manual',
          },
          Date.now(),
        )
        return r.ok ? json({ ok: true, id: r.id }) : json({ ok: false, error: r.error }, { status: 400 })
      },

      DELETE: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
        const profile = typeof body.profile === 'string' ? body.profile : ''
        const id = typeof body.id === 'string' ? body.id : ''
        if (!profile || !id) return json({ ok: false, error: 'Missing profile or id.' }, { status: 400 })
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Unauthorized for this profile.' }, { status: 403 })
        }
        return json({ ok: deleteNotification(profile, id) })
      },
    },
  },
})
