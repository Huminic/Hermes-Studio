/**
 * GET /api/customer/agents?profile=X
 *
 * AC.2.1 — Customer-facing read-only agent roster for a profile. Reads
 * SOUL fragments under governance/agents/<id>.md, falls back to the
 * profile-level SOUL.md when no per-agent fragments exist. Filtered by
 * the profile's studio.yaml agent_picker.visible_agents allowlist when
 * present.
 *
 * Auth: requires either Studio admin or customer-admin scoped to the
 * requested profile.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  filterByVisibleAgents,
  listAgentsForProfile,
} from '../../../server/customer-agents'
import { isAuthorizedForProfile, resolveSession } from '../../../server/customer-auth'
import { readStudioConfig } from '../../../server/studio-config'

export const Route = createFileRoute('/api/customer/agents')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const profile = url.searchParams.get('profile') ?? ''
        if (!profile) {
          return json(
            { ok: false, error: 'Missing profile query parameter.' },
            { status: 400 },
          )
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json(
            { ok: false, error: 'Unauthorized for this profile.' },
            { status: 403 },
          )
        }
        const roster = listAgentsForProfile(profile)
        const { config } = readStudioConfig(profile)
        const filtered = filterByVisibleAgents(
          roster,
          config.agent_picker.visible_agents,
        )
        return json({
          ok: true,
          profile: filtered.profile,
          agents: filtered.agents.map((a) => ({
            id: a.id,
            name: a.name,
            summary: a.summary,
            scope: a.scope,
            source: a.source,
            has_chat_persona: a.hasChatPersona,
          })),
          default_agent: config.agent_picker.default_agent,
        })
      },
    },
  },
})
