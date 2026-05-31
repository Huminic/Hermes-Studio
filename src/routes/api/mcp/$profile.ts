/**
 * POST /api/mcp/$profile
 *
 * Single MCP connection per profile (SRS Tranche A.4). Carries the full
 * tool surface: wiki_*, brain_*, federation_*, comms_*, admin tools.
 * Authentication via bearer token from mcp-tokens registry; scope and
 * audit handled by dispatchWikiMcp.
 *
 * The legacy /api/mcp/wiki endpoint continues to work for backward
 * compatibility with the consultative-agent admin token; new clients
 * should hit this endpoint with their profile-scoped token.
 */
import { createFileRoute } from '@tanstack/react-router'
import { dispatchWikiMcp } from '../../../server/wiki-mcp'

export const Route = createFileRoute('/api/mcp/$profile')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const response = await dispatchWikiMcp(request)
        return new Response(JSON.stringify(response), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
