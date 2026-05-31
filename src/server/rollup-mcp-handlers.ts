/**
 * Rollup MCP tool handler (SRS Tranche E).
 *
 * Exposes mcp_rollup_query as an admin-scoped tool. The tool is in the
 * existing wiki-mcp.ts dispatcher, NOT a new endpoint — SRS E.M forbids
 * a fourth cross-profile access surface. Authority is the existing
 * wildcard token model + per-child rollup grant.
 */

import { rollupQuery, type RollupRequest } from './rollup'

export const ROLLUP_TOOLS = [
  {
    name: 'mcp_rollup_query',
    description:
      'Run a rollup query from the parent profile across explicitly-granted children. ADMIN scope OR wildcard token required, AND each child must declare `rollup:<parent>` in its studio.yaml.federation.read_scopes.',
    inputSchema: {
      type: 'object',
      properties: {
        parent_profile: { type: 'string' },
        child_profiles: { type: 'array', items: { type: 'string' } },
        table: { type: 'string' },
        where: { type: 'object', additionalProperties: true },
        aggregate: {
          type: 'string',
          enum: ['count', 'sum', 'avg', 'list'],
        },
        column: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['parent_profile', 'child_profiles', 'table'],
    },
  },
]

export type RollupToolContext = {
  token_label: string
  token_allowed_profiles: Array<string>
  token_allowed_tools: Array<string>
  token_admin: boolean
}

export type RollupToolResult =
  | { ok: true; data: ReturnType<typeof rollupQuery> }
  | { ok: false; error: string; rule?: string; gate_event_id?: string }

export function callRollupTool(
  args: Record<string, unknown>,
  ctx: RollupToolContext,
): RollupToolResult {
  const req: RollupRequest = {
    parent_profile: String(args.parent_profile ?? ''),
    child_profiles: (args.child_profiles as Array<string>) ?? [],
    query: {
      table: String(args.table ?? ''),
      where: (args.where as Record<string, unknown>) ?? undefined,
      aggregate: args.aggregate as 'count' | 'sum' | 'avg' | 'list' | undefined,
      column: args.column as string | undefined,
      limit: args.limit as number | undefined,
    },
    actor: `token:${ctx.token_label}`,
    is_admin_token: ctx.token_admin,
    token_allowed_profiles: ctx.token_allowed_profiles,
  }
  const res = rollupQuery(req)
  if (!res.ok) {
    return {
      ok: false,
      error: res.reason ?? 'rollup denied',
      rule: res.rule,
      gate_event_id: res.gate_event_id,
    }
  }
  return { ok: true, data: res }
}
