import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAdmin } from '../../server/auth-middleware'
import { startHermesAgent } from '../../server/hermes-agent'

export const Route = createFileRoute('/api/start-agent')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAdmin(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const result = await startHermesAgent()
        return json(result, { status: result.ok ? 200 : 500 })
      },
    },
  },
})
