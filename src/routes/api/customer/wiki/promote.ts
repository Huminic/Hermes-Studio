/**
 * POST /api/customer/wiki/promote
 * AC.3.4 — Promote inbox/<x>.md → drafts/<x>.md → published/<x>.md.
 * Body: { profile, path }
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireJsonContentType } from '../../../../server/rate-limit'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../../server/customer-auth'
import { moveKnowledgeFile } from '../../../../server/customer-wiki'
import { evaluatePromote } from '../../../../server/ksg-gate'

export const Route = createFileRoute('/api/customer/wiki/promote')({
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
        // Promote paths come in relative to the profile root and start with
        // either 'knowledge/inbox/...' or 'knowledge/drafts/...'. We strip
        // the 'knowledge/' prefix when handing to evaluatePromote so the
        // rule operates on the bucket directly, then re-prepend on rename.
        const KNOWLEDGE_PREFIX = 'knowledge/'
        let working = p
        let underKnowledge = false
        if (working.startsWith(KNOWLEDGE_PREFIX)) {
          working = working.slice(KNOWLEDGE_PREFIX.length)
          underKnowledge = true
        }
        const verdict = evaluatePromote({ relativePath: working })
        if (!verdict.ok) {
          return json(
            { ok: false, error: verdict.reason, rule: verdict.rule },
            { status: 422 },
          )
        }
        const toRel = (underKnowledge ? KNOWLEDGE_PREFIX : '') + verdict.to
        const move = moveKnowledgeFile(profile, p, toRel)
        if (!move.ok) {
          return json(move, { status: 400 })
        }
        return json({ ok: true, from: p, to: toRel })
      },
    },
  },
})
