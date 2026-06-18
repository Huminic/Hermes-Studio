/**
 * POST /api/customer/dashboard-ask — Dashboard Custom tab "Ask AI".
 *
 * Body: { profile, question, window_days? }
 * Answers a natural-language question grounded in the profile's REAL federated
 * dashboard data (see dashboard-ask.ts). Never fabricates; returns an honest
 * "not configured" when no inference provider is available.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireJsonContentType } from '../../../server/rate-limit'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../server/customer-auth'
import { askDashboard } from '../../../server/dashboard-ask'

const ALLOWED_WINDOWS = new Set([7, 30, 90])

export const Route = createFileRoute('/api/customer/dashboard-ask')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
        const profile = typeof body.profile === 'string' ? body.profile : ''
        const question = typeof body.question === 'string' ? body.question : ''
        if (!profile || !question.trim()) {
          return json({ ok: false, error: 'profile and question required.' }, { status: 400 })
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Unauthorized for this profile.' }, { status: 403 })
        }
        const raw = Number(body.window_days)
        const windowDays = ALLOWED_WINDOWS.has(raw) ? raw : 30
        const result = await askDashboard(profile, question, { windowDays })
        if (!result.ok) {
          return json(
            { ok: false, error: result.error, unconfigured: result.unconfigured ?? false },
            { status: result.unconfigured ? 503 : 502 },
          )
        }
        return json({ ok: true, answer: result.answer, via: result.via })
      },
    },
  },
})
