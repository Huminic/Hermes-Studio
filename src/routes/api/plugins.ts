import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  getLoadedPlugins,
  summarize,
} from '../../server/plugin-bootstrap'

export const Route = createFileRoute('/api/plugins')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        try {
          const result = getLoadedPlugins()
          return json(summarize(result))
        } catch (error) {
          return json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to load plugins',
              plugins: [],
              issues: [],
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
