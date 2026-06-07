/**
 * GET /api/customer/widgets?profile=X
 * AC.4.1 — Customer-admin widget list (slug + mode + agent + status +
 * embed snippet + preview URL).
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../../server/customer-auth'
import { listCustomerWidgets } from '../../../../server/customer-widgets'

export const Route = createFileRoute('/api/customer/widgets/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const profile = url.searchParams.get('profile') ?? ''
        if (!profile) {
          return json({ ok: false, error: 'profile required' }, { status: 400 })
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Forbidden' }, { status: 403 })
        }
        // D-06: never leak the absolute server filePath to the customer client.
        // Keep it internal to the server module (used for save/validation);
        // strip it from the response.
        const result = listCustomerWidgets(profile)
        const widgets = result.widgets.map(({ filePath: _omit, ...rest }) => rest)
        return json({ ...result, widgets })
      },
    },
  },
})
