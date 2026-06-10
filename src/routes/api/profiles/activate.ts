import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  getSessionMetadata,
  getSessionTokenFromCookie,
  isAdmin,
} from '../../../server/auth-middleware'
import { hasAnyProfileAuth } from '../../../server/profile-auth'
import { setActiveProfile } from '../../../server/profiles-browser'
import { requireJsonContentType } from '../../../server/rate-limit'

export const Route = createFileRoute('/api/profiles/activate')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAdmin(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck

        const body = (await request.json()) as { name?: string }
        const profileName = body.name || ''

        // Profile-auth mode: validate scope
        if (hasAnyProfileAuth()) {
          const token = getSessionTokenFromCookie(
            request.headers.get('cookie'),
          )
          const meta = token ? getSessionMetadata(token) : null

          if (!meta) {
            return json({ error: 'Unauthorized' }, { status: 401 })
          }

          // Super-admin: can activate any profile
          if (meta.is_admin === true) {
            try {
              setActiveProfile(profileName)
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
          }

          // Scoped partner admin: can only activate profiles in their scope
          if (meta.scope_profiles && meta.scope_profiles.length > 0) {
            if (!meta.scope_profiles.includes(profileName)) {
              return json(
                { error: 'Profile not in your scope' },
                { status: 403 },
              )
            }
            try {
              setActiveProfile(profileName)
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
          }

          // Customer-admin: cannot switch profiles
          return json(
            { error: 'Profile switching requires admin role' },
            { status: 403 },
          )
        }

        // Legacy mode: any admin can switch
        try {
          setActiveProfile(profileName)
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
