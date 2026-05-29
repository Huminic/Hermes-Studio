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
import {
  readCustomerWikiFile,
  writeCustomerWikiFile,
} from '../../../../server/customer-wiki'
import { evaluateWikiSave } from '../../../../server/ksg-gate'

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
        const prev = readCustomerWikiFile(profile, p)
        const previousContent = prev.ok ? prev.content ?? null : null
        const verdict = evaluateWikiSave({
          relativePath: p,
          previousContent,
          newContent: content,
        })
        if (!verdict.ok) {
          return json(
            { ok: false, error: verdict.reason, rule: verdict.rule },
            { status: 422 },
          )
        }
        const writeResult = writeCustomerWikiFile(profile, p, content)
        if (!writeResult.ok) {
          return json(writeResult, { status: 400 })
        }
        return json({
          ok: true,
          path: p,
          warnings: verdict.warnings,
        })
      },
    },
  },
})
