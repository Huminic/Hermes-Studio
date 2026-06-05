/**
 * POST /api/customer/wiki/save
 * AC.3.3 — Save through the KSG gate. Body: { profile, path, content }.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireJsonContentType } from '../../../../server/rate-limit'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../../server/customer-auth'
import { guardedWikiWrite } from '../../../../server/guarded-wiki'

export const Route = createFileRoute('/api/customer/wiki/save')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        const body = (await request.json().catch(() => ({}))) as Record<
          string,
          unknown
        >
        const profile = typeof body.profile === 'string' ? body.profile : ''
        const p = typeof body.path === 'string' ? body.path : ''
        const content = typeof body.content === 'string' ? body.content : ''
        if (!profile || !p) {
          return json(
            { ok: false, error: 'profile and path required' },
            { status: 400 },
          )
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Forbidden' }, { status: 403 })
        }
        // Route through the SINGLE structural gate (rule gate → write →
        // memorialize to Brain), the same entry point the knowledge MCP tool
        // uses, under this customer-admin's recognized actor identity.
        const actor = `user:${session?.username ?? 'customer-admin'}`
        const result = guardedWikiWrite({ profile, relPath: p, content, actor })
        if (!result.ok) {
          return json(
            { ok: false, error: result.reason, rule: result.rule },
            { status: 422 },
          )
        }
        return json({
          ok: true,
          path: result.path,
          warnings: result.warnings,
          captured: result.memorialized,
        })
      },
    },
  },
})
