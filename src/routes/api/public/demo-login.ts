/**
 * GET /api/public/demo-login?profile=huminic-motors&session=<id>
 *
 * Frictionless demo login. From the public demo site's "Login" button, this
 * mints a short-lived customer-admin session for the DEMO tenant and redirects
 * the visitor straight into the back-end workspace — no credential prompt.
 *
 * Hard constraints:
 *  - Works ONLY for a demo profile (isDemoProfile). A production tenant can
 *    never be reached this way (a prod profile is never in DEMO_PROFILES).
 *  - The session is flagged is_demo so the workspace shows a "Demo Mode" banner.
 *  - Never reused for real customers — the demo profile gate IS the feature flag.
 */
import { createFileRoute } from '@tanstack/react-router'
import {
  generateSessionToken,
  storeSessionToken,
  createSessionCookie,
} from '../../../server/auth-middleware'
import { isDemoProfile } from '../../../server/demo-comms-guard'

export const Route = createFileRoute('/api/public/demo-login')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const profile = (url.searchParams.get('profile') ?? '').trim()
        if (!profile || !isDemoProfile(profile)) {
          return new Response('demo login is not available for this profile', {
            status: 404,
          })
        }
        const token = generateSessionToken()
        storeSessionToken(token, {
          profile,
          username: 'demo-visitor',
          is_admin: false,
          is_customer_admin: true,
          is_demo: true,
        })
        // Land on the store dashboard; the captured demo lead is already in the
        // messaging-hub, so Teambox / Activity / dashboard reflect the visit.
        return new Response(null, {
          status: 302,
          headers: {
            Location: `/p/${encodeURIComponent(profile)}/dashboard`,
            'Set-Cookie': createSessionCookie(token),
            'Cache-Control': 'no-store',
          },
        })
      },
    },
  },
})
