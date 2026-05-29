import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  getSessionMetadata,
  getSessionTokenFromCookie,
  isAuthenticated,
} from '../../../server/auth-middleware'
import { hasAnyProfileAuth } from '../../../server/profile-auth'
import { setActiveProfile } from '../../../server/profiles-browser'
import { requireJsonContentType } from '../../../server/rate-limit'

export const Route = createFileRoute('/api/profiles/activate')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Profile-auth mode: switching the global active profile requires
        // is_admin. Non-admin sessions are pinned to their own profile.
        if (hasAnyProfileAuth()) {
          const token = getSessionTokenFromCookie(
            request.headers.get('cookie'),
          )
          const meta = token ? getSessionMetadata(token) : null
          if (!meta || !meta.is_admin) {
            return json(
              { error: 'Profile switching requires admin role' },
              { status: 403 },
            )
          }
        }

        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        try {
          const body = (await request.json()) as { name?: string }
          setActiveProfile(body.name || '')
          return json({ ok: true })
        } catch (error) {
          return json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to activate profile',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
