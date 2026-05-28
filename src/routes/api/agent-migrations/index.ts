import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { isAuthenticated } from '../../../server/auth-middleware'
import { requireJsonContentType } from '../../../server/rate-limit'
import {
  createMigratedAgent,
  listMigratedAgents,
} from '../../../server/agent-migration-store'

export const Route = createFileRoute('/api/agent-migrations/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const url = new URL(request.url)
        return json({
          ok: true,
          agents: listMigratedAgents(url.searchParams.get('profile')),
        })
      },

      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        const body = (await request.json().catch(() => ({}))) as Record<
          string,
          unknown
        >
        const sourceApplication =
          typeof body.sourceApplication === 'string' ? body.sourceApplication : ''
        const sourceAgentId =
          typeof body.sourceAgentId === 'string' ? body.sourceAgentId : ''
        const profile = typeof body.profile === 'string' ? body.profile : ''
        const displayName = typeof body.displayName === 'string' ? body.displayName : ''
        if (!sourceApplication || !sourceAgentId || !profile || !displayName) {
          return json(
            {
              ok: false,
              error:
                'sourceApplication, sourceAgentId, profile, and displayName are required',
            },
            { status: 400 },
          )
        }
        const agent = createMigratedAgent({
          sourceApplication,
          sourceAgentId,
          profile,
          displayName,
          studioAgentId:
            typeof body.studioAgentId === 'string' ? body.studioAgentId : null,
          systemPrompt:
            typeof body.systemPrompt === 'string' ? body.systemPrompt : '',
          customerFacing:
            typeof body.customerFacing === 'boolean' ? body.customerFacing : false,
          tools: Array.isArray(body.tools)
            ? (body.tools as unknown[]).filter(
                (value): value is string => typeof value === 'string',
              )
            : [],
          vapi:
            body.vapi && typeof body.vapi === 'object'
              ? (body.vapi as Record<string, string>)
              : {},
          tavus:
            body.tavus && typeof body.tavus === 'object'
              ? (body.tavus as Record<string, string>)
              : {},
          notes: typeof body.notes === 'string' ? body.notes : '',
        })
        return json({ ok: true, agent }, { status: 201 })
      },
    },
  },
})
