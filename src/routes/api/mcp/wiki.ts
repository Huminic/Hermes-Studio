/**
 * POST /api/mcp/wiki
 * JSON-RPC endpoint for the wiki MCP server. Auth: bearer token from
 * the mcp-tokens registry.
 *
 * Spec: see src/server/wiki-mcp.ts for the tool list + admin tools.
 */
import { createFileRoute } from '@tanstack/react-router'
import { dispatchWikiMcp } from '../../../server/wiki-mcp'

export const Route = createFileRoute('/api/mcp/wiki')({
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
