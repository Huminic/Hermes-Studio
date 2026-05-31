/**
 * Huminic-the-company rollup (SRS Tranche E).
 *
 * Parent profile reads aggregated data from authorized children. NEVER
 * a co-resident database; always read-through MCP using the existing
 * cross-profile-access surfaces (wildcard token + explicit grants).
 *
 * Child grants live in studio.yaml.federation.read_scopes as a special
 * scope name: `rollup:<parent-profile>`. A child has granted rollup
 * read to a parent iff that scope is present in its declared list.
 * Without the grant the parent's rollup query is denied with the
 * existing `cross-profile-write-denied` rule (which we extend semantically
 * to also cover "cross-profile read without grant").
 *
 * Every rollup read writes a metadata_audit row with the parent actor
 * AND the set of child profiles touched.
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { parseStudioConfig, defaultStudioConfig } from '../lib/studio-config'
import { openBrain, now, uuid } from './brain-store'
import { recordAudit } from './metadata-substrate'

function studioConfigFor(profile: string) {
  const root =
    process.env.BRAIN_PROFILES_ROOT ??
    path.join(os.homedir(), '.hermes', 'profiles')
  const file = path.join(
    root,
    profile.replace(/[^a-zA-Z0-9_-]/g, '_'),
    'studio.yaml',
  )
  if (!fs.existsSync(file)) {
    return defaultStudioConfig(profile)
  }
  const parsed = parseStudioConfig(fs.readFileSync(file, 'utf8'))
  return parsed.ok ? parsed.config : defaultStudioConfig(profile)
}

export function childHasGrantedRollup(child: string, parent: string): boolean {
  const cfg = studioConfigFor(child)
  const scopes = cfg.federation?.read_scopes ?? []
  return scopes.includes(`rollup:${parent}`)
}

export type RollupRequest = {
  parent_profile: string
  child_profiles: Array<string>
  query: {
    table: string
    where?: Record<string, unknown>
    aggregate?: 'count' | 'sum' | 'avg' | 'list'
    column?: string
    limit?: number
  }
  actor: string
  /** Whether the calling token is admin/wildcard scope. */
  is_admin_token: boolean
  /** allowed_profiles set on the calling token (for explicit scope check). */
  token_allowed_profiles: Array<string>
}

export type RollupResult = {
  ok: boolean
  parent_profile: string
  children_included: Array<string>
  children_denied: Array<{ profile: string; reason: string }>
  rows?: Array<{ profile: string; value: unknown }>
  total?: number | null
  reason?: string
  rule?: string
  gate_event_id: string
}

const ALLOWED_TABLES = new Set([
  'events',
  'entities',
  'observations',
  'outputs',
  'transactions',
  'tasks',
  'hunches',
  'lookup_misses',
  'assumptions',
  'reconciliation_items',
  'comms_log',
  'uploads',
  'adjacent_neighbors',
])

export function rollupQuery(input: RollupRequest): RollupResult {
  const gateEventId = uuid()
  const childrenIncluded: Array<string> = []
  const childrenDenied: Array<{ profile: string; reason: string }> = []
  if (!ALLOWED_TABLES.has(input.query.table)) {
    return {
      ok: false,
      parent_profile: input.parent_profile,
      children_included: [],
      children_denied: input.child_profiles.map((p) => ({
        profile: p,
        reason: `table ${input.query.table} not allowed`,
      })),
      reason: `rollup query against table not allowed: ${input.query.table}`,
      rule: 'invalid-table',
      gate_event_id: gateEventId,
    }
  }

  // Token-level authority check: either wildcard scope or all child
  // profiles are explicitly granted.
  const hasWildcard = input.token_allowed_profiles.includes('*')
  if (!hasWildcard && !input.is_admin_token) {
    const ungranted = input.child_profiles.filter(
      (c) => !input.token_allowed_profiles.includes(c),
    )
    if (ungranted.length > 0) {
      return {
        ok: false,
        parent_profile: input.parent_profile,
        children_included: [],
        children_denied: ungranted.map((p) => ({
          profile: p,
          reason: 'child not in token allowed_profiles',
        })),
        reason: `token lacks scope for children: ${ungranted.join(', ')}`,
        rule: 'cross-profile-write-denied',
        gate_event_id: gateEventId,
      }
    }
  }

  const rows: Array<{ profile: string; value: unknown }> = []
  let total: number | null = null
  if (input.query.aggregate === 'count') total = 0

  for (const child of input.child_profiles) {
    if (!childHasGrantedRollup(child, input.parent_profile) && !hasWildcard) {
      childrenDenied.push({
        profile: child,
        reason: `child ${child}'s studio.yaml.federation.read_scopes does not include rollup:${input.parent_profile}`,
      })
      continue
    }
    try {
      const value = readChild(child, input.query)
      rows.push({ profile: child, value })
      childrenIncluded.push(child)
      if (input.query.aggregate === 'count' && typeof value === 'number') {
        total = (total ?? 0) + value
      }
    } catch (err) {
      childrenDenied.push({
        profile: child,
        reason: (err as Error).message,
      })
    }
  }

  recordAudit(input.parent_profile, {
    ts: now(),
    surface: 'brain',
    actor: input.actor,
    action: 'tool_call',
    target_type: 'rollup_query',
    target_id: input.query.table,
    reason: `rollup parent=${input.parent_profile} included=${childrenIncluded.join(',')} denied=${childrenDenied.map((d) => d.profile).join(',')}`,
    outcome: childrenDenied.length === input.child_profiles.length ? 'denied' : 'ok',
    gate_event_id: gateEventId,
    source_refs: childrenIncluded.map(
      (c) => ({ kind: 'engagement', value: `child:${c}` }) as unknown,
    ) as Array<unknown>,
  })

  return {
    ok: true,
    parent_profile: input.parent_profile,
    children_included: childrenIncluded,
    children_denied: childrenDenied,
    rows,
    total,
    gate_event_id: gateEventId,
  }
}

function readChild(
  child: string,
  q: RollupRequest['query'],
): unknown {
  const handle = openBrain(child)
  try {
    const wheres: Array<string> = []
    const params: Array<unknown> = []
    for (const [k, v] of Object.entries(q.where ?? {})) {
      if (!/^[a-zA-Z0-9_]+$/.test(k)) continue
      wheres.push(`${k} = ?`)
      params.push(v)
    }
    const whereClause = wheres.length ? `WHERE ${wheres.join(' AND ')}` : ''
    if (q.aggregate === 'count') {
      const row = handle.get<{ n: number }>(
        `SELECT COUNT(*) as n FROM ${q.table} ${whereClause}`,
        ...params,
      )
      return row?.n ?? 0
    }
    if (q.aggregate === 'sum' && q.column && /^[a-zA-Z0-9_]+$/.test(q.column)) {
      const row = handle.get<{ s: number }>(
        `SELECT SUM(${q.column}) as s FROM ${q.table} ${whereClause}`,
        ...params,
      )
      return row?.s ?? 0
    }
    if (q.aggregate === 'avg' && q.column && /^[a-zA-Z0-9_]+$/.test(q.column)) {
      const row = handle.get<{ a: number }>(
        `SELECT AVG(${q.column}) as a FROM ${q.table} ${whereClause}`,
        ...params,
      )
      return row?.a ?? 0
    }
    // Default to a row list (capped).
    return handle.all(
      `SELECT * FROM ${q.table} ${whereClause} LIMIT ?`,
      ...params,
      Math.min(q.limit ?? 100, 500),
    )
  } finally {
    handle.close()
  }
}
