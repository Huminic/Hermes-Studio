import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAdmin } from '../../../server/auth-middleware'
import { listWidgets } from '../../../server/widget-store'

export const Route = createFileRoute('/api/widgets/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAdmin(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        return json({ ok: true, widgets: listWidgets() })
      },
    },
  },
})
