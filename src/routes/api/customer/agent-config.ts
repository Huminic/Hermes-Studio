/**
 * /api/customer/agent-config
 *
 * Per-agent Configuration for the Workspace Agents page (Configuration modal).
 *   GET  ?profile=X&agent_id=Y   → { ok, instructions: {instructions, source, wiki_ref, updated_at} }
 *   POST { profile, agent_id, instructions }  → save (persists; source stays 'local'
 *          until the wiki backend owns it — see agent-config-store wiki note)
 *
 * The Uploads tab uses the existing /api/customer/data-uploads surface; only the
 * Contextual Instructions live here.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../server/customer-auth'
import { requireJsonContentType } from '../../../server/rate-limit'
import {
  getInstructions,
  saveInstructions,
} from '../../../server/agent-config-store'

export const Route = createFileRoute('/api/customer/agent-config')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const profile = url.searchParams.get('profile') ?? ''
        const agentId = url.searchParams.get('agent_id') ?? ''
        if (!profile || !agentId) {
          return json(
            { ok: false, error: 'profile and agent_id required.' },
            { status: 400 },
          )
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Unauthorized for this profile.' }, { status: 403 })
        }
        return json({ ok: true, instructions: getInstructions(profile, agentId) })
      },

      POST: async ({ request }) => {
        const csrf = requireJsonContentType(request)
        if (csrf) return csrf
        let body: Record<string, unknown>
        try {
          body = (await request.json()) as Record<string, unknown>
        } catch {
          return json({ ok: false, error: 'Invalid JSON.' }, { status: 400 })
        }
        const profile = String(body.profile ?? '')
        const agentId = String(body.agent_id ?? '')
        const instructions = String(body.instructions ?? '')
        if (!profile || !agentId) {
          return json(
            { ok: false, error: 'profile and agent_id required.' },
            { status: 400 },
          )
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Unauthorized for this profile.' }, { status: 403 })
        }
        const result = saveInstructions(profile, agentId, instructions)
        if (!result.ok) return json(result, { status: 400 })
        return json({ ok: true, instructions: result.instructions })
      },
    },
  },
})
