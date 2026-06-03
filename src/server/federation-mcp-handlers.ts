/**
 * Federation MCP tool handlers (SRS Tranche D.4).
 *
 * Exposes federation.query.<scope> tools that:
 *   1. Read studio.yaml.federation.read_scopes
 *   2. Enforce checkScope(token, profile, tool_name) — denies if scope
 *      not in the profile's read_scopes
 *   3. Dispatch to the registered federation engine (MindsDB if
 *      configured, otherwise the fallback shim that round-trips
 *      via central-mcp tools per source)
 *   4. Audit + memorialize into Brain
 *
 * MindsDB is preferred when MINDSDB_URL is set; otherwise the shim
 * uses per-source MCP tools (central-mcp resend / vinsolutions / etc).
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { readStudioConfig } from './studio-config'
import { parseStudioConfig, defaultStudioConfig } from '../lib/studio-config'
import { recordAudit } from './metadata-substrate'
import { insertEvent, insertOutput } from './brain-record-families'
import { now, uuid } from './brain-store'
import { callCentralMcpTool } from './central-mcp'

function resolveStudioConfig(profile: string) {
  const envRoot = process.env.BRAIN_PROFILES_ROOT
  if (envRoot) {
    const file = path.join(
      envRoot,
      profile.replace(/[^a-zA-Z0-9_-]/g, '_'),
      'studio.yaml',
    )
    if (fs.existsSync(file)) {
      const parsed = parseStudioConfig(fs.readFileSync(file, 'utf8'))
      if (parsed.ok) return { config: parsed.config, source: 'file' as const }
    }
    return { config: defaultStudioConfig(profile), source: 'default' as const }
  }
  return readStudioConfig(profile)
}

export type FederationToolContext = {
  token_label: string
  token_allowed_profiles: Array<string>
  token_allowed_tools: Array<string>
  token_admin: boolean
}

export type FederationResult =
  | { ok: true; data: { scope: string; engine: string; rows: Array<unknown>; gate_event_id: string } }
  | { ok: false; error: string; rule?: string; gate_event_id?: string }

/**
 * The base tool descriptor. The actual scopes the agent may call are
 * `federation.query.<scope>` derived from the per-profile config; the
 * MCP dispatcher recognizes the prefix and routes here.
 */
export const FEDERATION_TOOLS = [
  {
    name: 'federation_list_scopes',
    description:
      'Return the federation read scopes declared in studio.yaml for the given profile.',
    inputSchema: {
      type: 'object',
      properties: { profile: { type: 'string' } },
      required: ['profile'],
    },
  },
  {
    name: 'federation_query',
    description:
      'Run a federation query against a declared scope. scope MUST be present in studio.yaml.federation.read_scopes for the profile.',
    inputSchema: {
      type: 'object',
      properties: {
        profile: { type: 'string' },
        scope: { type: 'string' },
        query: { type: 'string' },
        params: { type: 'object', additionalProperties: true },
      },
      required: ['profile', 'scope', 'query'],
    },
  },
]

export async function callFederationTool(
  name: string,
  args: Record<string, unknown>,
  ctx: FederationToolContext,
): Promise<FederationResult> {
  const actor = `token:${ctx.token_label}`
  const profile = String(args.profile ?? '')
  if (!profile) {
    return { ok: false, error: 'profile required' }
  }
  if (name === 'federation_list_scopes') {
    const cfg = resolveStudioConfig(profile)
    return {
      ok: true,
      data: {
        scope: '*',
        engine: 'config',
        rows: cfg.config.federation?.read_scopes ?? [],
        gate_event_id: 'list-scopes',
      },
    }
  }
  if (name !== 'federation_query') {
    return { ok: false, error: `unknown federation tool: ${name}` }
  }
  const scope = String(args.scope ?? '')
  const query = String(args.query ?? '')
  if (!scope || !query) {
    return { ok: false, error: 'scope and query required' }
  }

  const cfg = resolveStudioConfig(profile)
  const declared = cfg.config.federation?.read_scopes ?? []
  if (!declared.includes(scope) && !ctx.token_admin) {
    const gateEventId = uuid()
    recordAudit(profile, {
      ts: now(),
      surface: 'brain',
      actor,
      action: 'gate_decision',
      target_type: 'federation',
      target_id: scope,
      reason: `scope ${scope} not in studio.yaml.federation.read_scopes`,
      outcome: 'denied',
      rule: 'unscoped-tool',
      gate_event_id: gateEventId,
    })
    return {
      ok: false,
      error: `scope ${scope} not in federation.read_scopes for profile ${profile}`,
      rule: 'unscoped-tool',
      gate_event_id: gateEventId,
    }
  }

  const engineResult = await dispatchEngine(profile, scope, query, args.params as Record<string, unknown> | undefined)
  const gateEventId = uuid()
  recordAudit(profile, {
    ts: now(),
    surface: 'brain',
    actor,
    action: 'tool_call',
    target_type: 'federation',
    target_id: scope,
    reason: `federation_query scope=${scope} engine=${engineResult.engine} rows=${engineResult.rows.length}`,
    outcome: engineResult.ok ? 'ok' : 'error',
    gate_event_id: gateEventId,
  })
  // Memorialize the answer as an output for later inspection — EXCEPT for VIN,
  // which is live-federated and must NEVER be persisted in the Brain (locked
  // scope). For a VIN scope we store only a redacted summary (row count), never
  // the rows themselves; the live rows still flow back to the caller below.
  const vinLive = engineResult.engine === 'vin-live' || isVinScope(scope)
  insertOutput({
    profile,
    actor,
    producer_actor: `federation:${engineResult.engine}`,
    output_type: 'federation_query_result',
    content: vinLive
      ? JSON.stringify({
          redacted: 'VIN is live-federated and never persisted in the Brain',
          rows: engineResult.rows.length,
        })
      : JSON.stringify(engineResult.rows).slice(0, 8000),
    metadata: { scope, query, engine: engineResult.engine, ok: engineResult.ok, vin_live: vinLive },
    source_refs: [{ kind: 'external', value: `federation:${scope}` }],
  })
  insertEvent({
    profile,
    actor,
    type: 'federation_query',
    source: 'federation_engine',
    subject_type: 'federation',
    subject_id: scope,
    payload: { query, params: args.params ?? null, ok: engineResult.ok, rows: engineResult.rows.length },
    source_refs: [{ kind: 'external', value: `federation:${scope}` }],
  })

  return engineResult.ok
    ? {
        ok: true,
        data: {
          scope,
          engine: engineResult.engine,
          rows: engineResult.rows,
          gate_event_id: gateEventId,
        },
      }
    : { ok: false, error: engineResult.error, gate_event_id: gateEventId }
}

type EngineResult =
  | { ok: true; engine: string; rows: Array<unknown> }
  | { ok: false; engine: string; rows: Array<unknown>; error: string }

/** VIN tools exposed by central-mcp that a federation query can route to. */
const VIN_TOOLS = new Set(['vin_query_leads', 'vin_get_lead_statuses'])

/** True when this scope targets VinSolutions (its own live source). */
function isVinScope(scope: string): boolean {
  return scope.toLowerCase().includes('vin')
}

/**
 * Coerce a central-mcp VIN payload into a rows array. VIN's shape isn't ours,
 * so accept the common shapes (bare array / {leads|data|results|records:[…]}).
 */
function vinRows(data: unknown): Array<unknown> {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') {
    for (const key of ['leads', 'data', 'results', 'records', 'statuses']) {
      const v = (data as Record<string, unknown>)[key]
      if (Array.isArray(v)) return v
    }
    return [data] // single object → one row
  }
  return data == null ? [] : [data]
}

/**
 * Live VinSolutions dispatch (locked architecture: VIN is live-federated, never
 * synced, on its own source — not routed through MindsDB). Picks the VIN tool
 * from params.vin_tool, else a keyword in the query, else vin_query_leads.
 */
async function dispatchVinScope(
  profile: string,
  query: string,
  params?: Record<string, unknown>,
): Promise<EngineResult> {
  const override =
    typeof params?.vin_tool === 'string' && VIN_TOOLS.has(params.vin_tool)
      ? (params.vin_tool as string)
      : null
  const tool =
    override ??
    (/\bstatus(es)?\b/i.test(query) ? 'vin_get_lead_statuses' : 'vin_query_leads')
  // Forward query params to VIN; always scope by profile (federated, live).
  const { vin_tool: _omit, ...rest } = params ?? {}
  const r = await callCentralMcpTool(tool, { profile, ...rest })
  if (!r.ok) {
    return {
      ok: false,
      engine: 'vin-live',
      rows: [],
      error: r.unconfigured
        ? 'central-mcp / VinSolutions not configured (token missing).'
        : `VinSolutions ${tool} failed: ${r.error}`,
    }
  }
  return { ok: true, engine: 'vin-live', rows: vinRows(r.data) }
}

async function dispatchEngine(
  profile: string,
  scope: string,
  query: string,
  params?: Record<string, unknown>,
): Promise<EngineResult> {
  // VIN is its own live source — route to central-mcp ahead of MindsDB/shim.
  if (isVinScope(scope)) {
    return dispatchVinScope(profile, query, params)
  }
  // MindsDB path (preferred when configured).
  if (process.env.MINDSDB_URL) {
    try {
      const res = await fetch(`${process.env.MINDSDB_URL}/api/sql/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.MINDSDB_TOKEN
            ? { Authorization: `Bearer ${process.env.MINDSDB_TOKEN}` }
            : {}),
        },
        body: JSON.stringify({ query: contextualizeQuery(scope, query, params) }),
      })
      const j = (await res.json()) as { data?: Array<unknown>; error_message?: string }
      if (res.ok) {
        return { ok: true, engine: 'mindsdb', rows: j.data ?? [] }
      }
      return {
        ok: false,
        engine: 'mindsdb',
        rows: [],
        error: j.error_message ?? `MindsDB HTTP ${res.status}`,
      }
    } catch (err) {
      return {
        ok: false,
        engine: 'mindsdb',
        rows: [],
        error: (err as Error).message,
      }
    }
  }
  // Fallback shim: return a structured stub describing how the query
  // would be dispatched. Honest about what isn't wired without faking
  // results. Per D-011 in decisions.log.
  return {
    ok: true,
    engine: 'shim',
    rows: [
      {
        notice:
          'MindsDB not configured; federation_query returned a shim response. Set MINDSDB_URL + MINDSDB_TOKEN env vars to enable real dispatch.',
        profile,
        scope,
        query,
        params: params ?? null,
        suggested_action: `Register a real source for scope ${scope} via mcp-federation skill + studio.yaml.federation.read_scopes.`,
      },
    ],
  }
}

function contextualizeQuery(
  scope: string,
  query: string,
  params?: Record<string, unknown>,
): string {
  // Lightweight namespacing: prepend scope as a SQL comment so audit
  // can trace, and substitute :param placeholders with values from params.
  let q = `/* huminic-scope:${scope} */ ${query}`
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      const re = new RegExp(`:${k}\\b`, 'g')
      const lit =
        typeof v === 'string'
          ? `'${String(v).replace(/'/g, "''")}'`
          : String(v)
      q = q.replace(re, lit)
    }
  }
  return q
}
