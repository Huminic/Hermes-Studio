/**
 * Studio admin API for the MCP token registry.
 *
 *   GET    /api/mcp-tokens              — list tokens (no secrets)
 *   POST   /api/mcp-tokens              — issue token (returns secret ONCE)
 *   DELETE /api/mcp-tokens?label=...    — revoke token by label
 *
 * Auth: Studio admin session (is_admin = true). Customer-admin users
 * cannot manage MCP tokens — they may only call MCP through their
 * issued bearer.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireJsonContentType } from '../../server/rate-limit'
import { resolveSession } from '../../server/customer-auth'
import {
  issueToken,
  listTokens,
  revokeToken,
} from '../../server/mcp-tokens'

function requireAdmin(request: Request): Response | null {
  const session = resolveSession(request)
  if (!session || !session.is_admin) {
    return json({ ok: false, error: 'Studio admin required.' }, { status: 403 })
  }
  return null
}

export const Route = createFileRoute('/api/mcp-tokens')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = requireAdmin(request)
        if (denied) return denied
        return json({ ok: true, tokens: listTokens() })
      },
      POST: async ({ request }) => {
        const denied = requireAdmin(request)
        if (denied) return denied
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        const body = (await request.json().catch(() => ({}))) as Record<
          string,
          unknown
        >
        const session = resolveSession(request)
        const result = issueToken({
          label: typeof body.label === 'string' ? body.label : '',
          allowed_profiles: Array.isArray(body.allowed_profiles)
            ? (body.allowed_profiles as Array<string>)
            : [],
          allowed_tools: Array.isArray(body.allowed_tools)
            ? (body.allowed_tools as Array<string>)
            : [],
          expires_at:
            typeof body.expires_at === 'string'
              ? body.expires_at
              : null,
          admin: body.admin === true,
          created_by: session?.username ?? 'studio-admin',
        })
        if (!result.ok) {
          return json(result, { status: 400 })
        }
        return json(result)
      },
      DELETE: async ({ request }) => {
        const denied = requireAdmin(request)
        if (denied) return denied
        const url = new URL(request.url)
        const label = url.searchParams.get('label') ?? ''
        if (!label) {
          return json(
            { ok: false, error: 'label query param required.' },
            { status: 400 },
          )
        }
        const session = resolveSession(request)
        const result = revokeToken(label, session?.username ?? 'studio-admin')
        if (!result.ok) {
          return json(result, { status: 404 })
        }
        return json(result)
      },
    },
  },
})
