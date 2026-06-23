/**
 * GET /api/customer/sentinel?status=open|all — the Sentinel findings feed
 * (the in-app alert surface). Operator/super-admin only; app-wide, so it is
 * not scoped to a single profile.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { resolveSession } from '../../../server/customer-auth'
import { listSentinelFindings } from '../../../server/sentinel'

export const Route = createFileRoute('/api/customer/sentinel')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = resolveSession(request)
        if (!session?.is_admin) {
          return json({ ok: false, error: 'Forbidden' }, { status: 403 })
        }
        const url = new URL(request.url)
        const status = url.searchParams.get('status') === 'all' ? 'all' : 'open'
        const findings = listSentinelFindings({ status })
        return json({ ok: true, findings })
      },
    },
  },
})
