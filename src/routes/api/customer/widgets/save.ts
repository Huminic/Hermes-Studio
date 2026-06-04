/**
 * POST /api/customer/widgets/save
 * AC.4.3 — Customer-admin edits a widget. Routes through the KSG
 * (same gate as wiki edits) so the audit log surfaces the action.
 * Body: { profile, slug, content }
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireJsonContentType } from '../../../../server/rate-limit'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../../server/customer-auth'
import {
  readCustomerWidgetFile,
  writeCustomerWidgetFile,
} from '../../../../server/customer-widgets'
import { evaluateWikiSave } from '../../../../server/ksg-gate'

export const Route = createFileRoute('/api/customer/widgets/save')({
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
        const slug = typeof body.slug === 'string' ? body.slug : ''
        const content = typeof body.content === 'string' ? body.content : ''
        if (!profile || !slug) {
          return json(
            { ok: false, error: 'profile and slug required' },
            { status: 400 },
          )
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Forbidden' }, { status: 403 })
        }
        const relPath = `knowledge/widgets/${slug}.md`
        const prev = readCustomerWidgetFile(profile, slug)
        const previousContent = prev.ok ? prev.content ?? null : null
        const verdict = evaluateWikiSave({
          relativePath: relPath,
          previousContent,
          newContent: content,
        })
        if (!verdict.ok) {
          return json(
            { ok: false, error: verdict.reason, rule: verdict.rule },
            { status: 422 },
          )
        }
        const result = writeCustomerWidgetFile(profile, slug, content)
        if (!result.ok) return json(result, { status: 400 })
        return json({
          ok: true,
          slug,
          path: relPath,
          warnings: verdict.warnings,
        })
      },
    },
  },
})
