import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  getSessionMetadata,
  getSessionTokenFromCookie,
  isAuthenticated,
  isPasswordProtectionEnabled,
} from '../../server/auth-middleware'
import { ensureGatewayProbed } from '../../server/gateway-capabilities'

export const Route = createFileRoute('/api/auth-check')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          // Use ensureGatewayProbed() which handles auto-detection across
          // multiple ports (8642, 8643) instead of checking a single
          // hardcoded URL. This was previously a standalone
          // isBackendReachable() that only tried port 8642 and never
          // benefited from the gateway-capabilities auto-detection logic.
          const caps = await ensureGatewayProbed()
          const reachable = caps.health || caps.chatCompletions || caps.models

          if (!reachable) {
            return json(
              {
                authenticated: false,
                authRequired: false,
                error: 'hermes_agent_unreachable',
              },
              { status: 503 },
            )
          }
        } catch (error) {
          return json(
            {
              authenticated: false,
              authRequired: false,
              error:
                error instanceof DOMException && error.name === 'AbortError'
                  ? 'hermes_agent_timeout'
                  : 'hermes_agent_unreachable',
            },
            { status: 503 },
          )
        }

        const authRequired = isPasswordProtectionEnabled()
        const authenticated = isAuthenticated(request)

        // Expose the session's role so the client shell can gate Global Studio
        // routes on is_admin and route a Workspace (customer-admin) session to
        // its own /p/<profile>/* console (LC-BLOCKER-006). Scoped partner admins
        // are allowed in Global Studio with filtered profile access.
        const meta = authRequired
          ? getSessionMetadata(
              getSessionTokenFromCookie(request.headers.get('cookie')) ?? '',
            )
          : null
        return json({
          authenticated,
          authRequired,
          is_admin: authRequired ? meta?.is_admin === true : true,
          is_customer_admin: meta?.is_customer_admin === true,
          profile: meta?.profile ?? null,
          scope_profiles: meta?.scope_profiles ?? undefined,
        })
      },
    },
  },
})
