/**
 * GET /api/brain/readiness?profile=X
 * GET /api/brain/readiness?all=true (admin-only)
 *
 * Returns a structured readiness report. Studio's deployment readiness
 * probe refuses to mark a profile launch-ready if this endpoint reports
 * sixth-invariant failure.
 */
import { createFileRoute } from '@tanstack/react-router'
import { checkBrainReadiness, listProfilesNeedingBrain } from '../../../server/brain-readiness'
import {
  getSessionMetadata,
  getSessionTokenFromCookie,
  isPasswordProtectionEnabled,
} from '../../../server/auth-middleware'

function readSession(request: Request) {
  if (!isPasswordProtectionEnabled()) {
    return { ok: true as const, is_admin: true, username: 'local', profile: null }
  }
  const token = getSessionTokenFromCookie(request.headers.get('cookie'))
  if (!token) return { ok: false as const, reason: 'no session' }
  const meta = getSessionMetadata(token)
  if (!meta) return { ok: false as const, reason: 'invalid session' }
  return { ok: true as const, ...meta }
}

export const Route = createFileRoute('/api/brain/readiness')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = readSession(request)
        if (!session.ok) {
          return new Response(JSON.stringify({ error: session.reason }), {
            status: 401,
          })
        }
        const url = new URL(request.url)
        const all = url.searchParams.get('all') === 'true'
        if (all) {
          if (!session.is_admin) {
            return new Response(
              JSON.stringify({ error: 'admin required' }),
              { status: 403 },
            )
          }
          const needing = listProfilesNeedingBrain()
          return new Response(
            JSON.stringify({ profiles_needing_brain: needing }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        const profile = url.searchParams.get('profile') ?? ''
        if (!profile) {
          return new Response(JSON.stringify({ error: 'profile required' }), {
            status: 400,
          })
        }
        const allowed =
          session.is_admin ||
          (session.is_customer_admin && session.profile === profile)
        if (!allowed) {
          return new Response(
            JSON.stringify({ error: 'profile out of scope' }),
            { status: 403 },
          )
        }
        const report = checkBrainReadiness(profile)
        return new Response(JSON.stringify(report), {
          status: report.ok ? 200 : 503,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
