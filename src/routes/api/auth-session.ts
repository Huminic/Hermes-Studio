import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  getSessionMetadata,
  getSessionTokenFromCookie,
  isAuthenticated,
} from '../../server/auth-middleware'
import { hasAnyProfileAuth } from '../../server/profile-auth'

/**
 * GET /api/auth-session — return current session identity if any.
 *
 * Shape: { authenticated, profile_auth_mode, profile?, username?, is_admin?, is_customer_admin? }
 *
 * profile_auth_mode is true once any profile has an auth.yaml file. This lets
 * the login UI render the username field when profile mode is on and hide it
 * otherwise (legacy HERMES_PASSWORD-only mode).
 *
 * is_customer_admin indicates a storefront-side customer admin (storefront
 * /p/$profile/* surfaces); is_admin indicates a Studio operator. The two are
 * independent — a profile auth.yaml may set either, both, or neither.
 */
export const Route = createFileRoute('/api/auth-session')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const profileMode = hasAnyProfileAuth()
        const authed = isAuthenticated(request)

        if (!authed) {
          return json({
            authenticated: false,
            profile_auth_mode: profileMode,
          })
        }

        const token = getSessionTokenFromCookie(request.headers.get('cookie'))
        const meta = token ? getSessionMetadata(token) : null
        return json({
          authenticated: true,
          profile_auth_mode: profileMode,
          profile: meta?.profile ?? null,
          username: meta?.username ?? null,
          is_admin: meta?.is_admin ?? true,
          is_customer_admin: meta?.is_customer_admin ?? false,
        })
      },
    },
  },
})
