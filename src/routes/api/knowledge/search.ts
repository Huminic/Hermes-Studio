import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAdmin } from '../../../server/auth-middleware'
import { searchKnowledgePages } from '../../../server/knowledge-browser'

export const Route = createFileRoute('/api/knowledge/search')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAdmin(request)) {
          return json({ error: 'Unauthorized' }, { status: 401 })
        }

        const url = new URL(request.url)
        const query = url.searchParams.get('q') || ''
        const profile = url.searchParams.get('profile')

        try {
          return json({ results: searchKnowledgePages(query, profile) })
        } catch (error) {
          return json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : 'Failed to search knowledge pages',
            },
            { status: 500 },
          )
        }
      },
    },
  },
})
