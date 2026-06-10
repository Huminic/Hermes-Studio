import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  getSessionMetadata,
  getSessionTokenFromCookie,
  isAuthenticated,
} from '../../../server/auth-middleware'
import {
  getActiveProfileName,
  listProfiles,
} from '../../../server/profiles-browser'

export const Route = createFileRoute('/api/profiles/list')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // Require authentication
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        const token = getSessionTokenFromCookie(request.headers.get('cookie'))
        const meta = token ? getSessionMetadata(token) : null

        try {
          const allProfiles = listProfiles()
          const activeProfile = getActiveProfileName()

          // Super-admin: sees all profiles
          if (meta?.is_admin === true) {
            return json({
              profiles: allProfiles,
              activeProfile,
            })
          }

          // Scoped partner admin: sees only profiles in scope_profiles array
          if (meta?.scope_profiles && meta.scope_profiles.length > 0) {
            const scopedProfiles = allProfiles.filter((p) =>
              meta.scope_profiles?.includes(p.name),
            )
            // Return activeProfile only if it's in scope
            const scopedActiveProfile = meta.scope_profiles.includes(
              activeProfile,
            )
              ? activeProfile
              : undefined
            return json({
              profiles: scopedProfiles,
              activeProfile: scopedActiveProfile,
            })
          }

          // Customer-admin or unauthorized: no profile list access
          return json({ error: 'Forbidden' }, { status: 403 })
        } catch (error) {
          return json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to list profiles',
              profiles: [],
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
