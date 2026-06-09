import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAdmin } from '../../server/auth-middleware'
import { listEngagements } from '../../server/engagements'

export const Route = createFileRoute('/api/engagements')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAdmin(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }
        try {
          return json(listEngagements())
        } catch (error) {
          return json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to list engagements',
              customers: [],
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
