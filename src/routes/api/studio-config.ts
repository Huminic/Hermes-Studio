import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import { readStudioConfig } from '../../server/studio-config'

export const Route = createFileRoute('/api/studio-config')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        try {
          const url = new URL(request.url)
          const profile = url.searchParams.get('profile')
          if (!profile) {
            return json({ error: 'profile query param required' }, { status: 400 })
          }
          return json(readStudioConfig(profile))
        } catch (error) {
          return json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to read studio config',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
