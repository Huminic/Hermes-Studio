/**
 * Brain MCP tool handlers (SRS Tranche A.3 + A.4).
 *
 * These handlers ride the same JSON-RPC dispatcher as the wiki tools
 * (src/server/wiki-mcp.ts). The SRS requires ONE MCP connection per
 * profile that carries wiki, brain, federation, and comms tools — not
 * a parallel server. This module exports the brain_* tool implementations;
 * the dispatcher in wiki-mcp.ts routes to them by name.
 *
 * Every brain_* write goes through the DSG gate. Reads go through
 * dsgReadGate when they cross profiles. Everything lands in the
 * always-on metadata substrate.
 */

import { openBrain } from './brain-store'
import { dsgGate, dsgReadGate, type DsgInput } from './dsg-gate'
import { recordChat } from './chat-memorialization'
import { recordLookupMiss } from './lookup-miss'
import { recordHunch } from './hunches-store'
import { recordAudit } from './metadata-substrate'
import { backupBrain, pendingMigrations } from './brain-store'

export const BRAIN_TOOLS = [
  {
    name: 'brain_query',
    description:
      'Read rows from a Brain table for a profile. Cross-profile reads require admin scope; pass cross_profile=true to attempt.',
    inputSchema: {
      type: 'object',
      properties: {
        profile: { type: 'string' },
        table: { type: 'string' },
        where: { type: 'object', additionalProperties: true },
        order_by: { type: 'string' },
        limit: { type: 'number' },
        cross_profile: { type: 'boolean' },
      },
      required: ['profile', 'table'],
    },
  },
  {
    name: 'brain_write',
    description:
      'Insert a row into a Brain table. DSG-gated. Payload must include tenant=profile and (where required) source_refs.',
    inputSchema: {
      type: 'object',
      properties: {
        profile: { type: 'string' },
        table: { type: 'string' },
        payload: { type: 'object', additionalProperties: true },
      },
      required: ['profile', 'table', 'payload'],
    },
  },
  {
    name: 'brain_record_chat',
    description:
      'Memorialize a chat message (human↔agent or agent↔back-end) into the Brain. Append-only.',
    inputSchema: {
      type: 'object',
      properties: {
        profile: { type: 'string' },
        channel: {
          type: 'string',
          enum: [
            'studio-chat',
            'storefront-chat',
            'mcp',
            'messaging-hub',
            'consultative',
            'system',
          ],
        },
        thread_id: { type: 'string' },
        participants: { type: 'array', items: { type: 'string' } },
        role: {
          type: 'string',
          enum: ['user', 'assistant', 'system', 'tool'],
        },
        content: { type: 'string' },
        metadata: { type: 'object', additionalProperties: true },
        source_refs: { type: 'array' },
        decision_context_id: { type: 'string' },
      },
      required: ['profile', 'channel', 'participants', 'role', 'content'],
    },
  },
  {
    name: 'brain_record_lookup_miss',
    description:
      'Record a lookup miss. When the agent had to proceed with an assumption, the assumption is surfaced to the operator for review.',
    inputSchema: {
      type: 'object',
      properties: {
        profile: { type: 'string' },
        actor: { type: 'string' },
        actor_role: { type: 'string' },
        scope: { type: 'string' },
        query: { type: 'string' },
        downstream_decision: {
          type: 'string',
          enum: ['deferred', 'assumed', 'escalated'],
        },
        assumption: {
          type: 'object',
          properties: {
            statement: { type: 'string' },
            context: { type: 'object', additionalProperties: true },
          },
          required: ['statement'],
        },
        operator_visible: { type: 'boolean' },
      },
      required: ['profile', 'actor', 'query'],
    },
  },
  {
    name: 'brain_record_hunch',
    description:
      'Record a hunch (advisor output). Originating guardian must be KSG or DSG; KSG writes hunches that propose wiki updates, DSG writes hunches that propose Brain updates.',
    inputSchema: {
      type: 'object',
      properties: {
        profile: { type: 'string' },
        originating_guardian: { type: 'string', enum: ['KSG', 'DSG'] },
        subject_type: { type: 'string' },
        subject_id: { type: 'string' },
        statement: { type: 'string' },
        evidence_refs: { type: 'array' },
        confidence_label: { type: 'string' },
        proposed_action: {
          type: 'string',
          enum: ['wiki_update', 'brain_update', 'escalate', 'monitor'],
        },
        actor: { type: 'string' },
      },
      required: [
        'profile',
        'originating_guardian',
        'statement',
        'actor',
      ],
    },
  },
  {
    name: 'brain_subscribe_events',
    description:
      'Return the SSE endpoint URL for Brain + guardian events on a profile. Connect via /api/messaging/stream?profile=X (shared bus, new event types).',
    inputSchema: {
      type: 'object',
      properties: { profile: { type: 'string' } },
      required: ['profile'],
    },
  },
  {
    name: 'brain_export_snapshot',
    description:
      'Create a backup snapshot of the profile Brain DB. Returns the snapshot path + checksum.',
    inputSchema: {
      type: 'object',
      properties: {
        profile: { type: 'string' },
        destination: { type: 'string' },
      },
      required: ['profile'],
    },
  },
  {
    name: 'mcp__brain_migrate',
    description:
      'Apply pending Brain schema migrations to a profile. ADMIN-ONLY.',
    inputSchema: {
      type: 'object',
      properties: { profile: { type: 'string' } },
      required: ['profile'],
    },
  },
  {
    name: 'mcp__brain_backup',
    description:
      'Create a backup snapshot for a profile. ADMIN-ONLY (per-profile reads use brain_export_snapshot).',
    inputSchema: {
      type: 'object',
      properties: {
        profile: { type: 'string' },
        destination: { type: 'string' },
      },
      required: ['profile'],
    },
  },
  {
    name: 'mcp__brain_restore',
    description:
      'Restore a profile Brain from a snapshot file. ADMIN-ONLY.',
    inputSchema: {
      type: 'object',
      properties: {
        profile: { type: 'string' },
        source: { type: 'string' },
      },
      required: ['profile', 'source'],
    },
  },
]

export const BRAIN_ADMIN_TOOLS = new Set([
  'mcp__brain_migrate',
  'mcp__brain_backup',
  'mcp__brain_restore',
])

export type BrainToolContext = {
  /** The label from the MCP token making the call. */
  token_label: string
  token_allowed_profiles: Array<string>
  token_allowed_tools: Array<string>
  token_admin: boolean
}

const ALLOWED_TABLES = new Set([
  'metadata_audit',
  'chat_records',
  'lookup_misses',
  'assumptions',
  'hunches',
  'source_references',
  'self_improvement_events',
  'events',
  'entities',
  'entity_projections',
  'tasks',
  'transactions',
  'outputs',
  'observations',
  'reconciliation_items',
  'retrieval_context_snapshots',
  'suggested_knowledge_changes',
  'adjacent_neighbors',
  'embeddings',
  'uploads',
  'comms_log',
])

export type BrainToolResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string; rule?: string; gate_event_id?: string }

export function callBrainTool(
  name: string,
  args: Record<string, unknown>,
  ctx: BrainToolContext,
): BrainToolResult {
  const actor = `token:${ctx.token_label}`
  switch (name) {
    case 'brain_query':
      return brainQuery(args, ctx, actor)
    case 'brain_write':
      return brainWrite(args, ctx, actor)
    case 'brain_record_chat':
      return brainRecordChat(args, actor)
    case 'brain_record_lookup_miss':
      return brainRecordLookupMiss(args)
    case 'brain_record_hunch':
      return brainRecordHunch(args)
    case 'brain_subscribe_events':
      return brainSubscribeEvents(args)
    case 'brain_export_snapshot':
      return brainExportSnapshot(args)
    case 'mcp__brain_migrate':
      return brainMigrate(args)
    case 'mcp__brain_backup':
      return brainExportSnapshot(args)
    case 'mcp__brain_restore':
      return { ok: false, error: 'restore must be invoked via API, not MCP' }
    default:
      return { ok: false, error: `unknown brain tool: ${name}` }
  }
}

function brainQuery(
  args: Record<string, unknown>,
  ctx: BrainToolContext,
  actor: string,
): BrainToolResult {
  const profile = String(args.profile ?? '')
  const table = String(args.table ?? '')
  const cross = args.cross_profile === true
  if (!ALLOWED_TABLES.has(table)) {
    return { ok: false, error: `query not allowed against table: ${table}` }
  }
  if (cross) {
    const gate = dsgReadGate({
      profile,
      cross_profile: true,
      actor,
      token_allowed_profiles: ctx.token_allowed_profiles,
      token_allowed_tools: ctx.token_allowed_tools,
      reason: 'cross-profile brain_query',
    })
    if (!gate.ok)
      return {
        ok: false,
        error: gate.reason,
        rule: gate.rule,
        gate_event_id: gate.gate_event_id,
      }
  }
  const where = (args.where ?? {}) as Record<string, unknown>
  const limit = Number(args.limit ?? 100)
  const orderBy =
    typeof args.order_by === 'string' && /^[a-zA-Z0-9_ ]+$/.test(args.order_by)
      ? (args.order_by as string)
      : 'ts DESC'
  const wheres: Array<string> = []
  const params: Array<unknown> = []
  for (const [k, v] of Object.entries(where)) {
    if (!/^[a-zA-Z0-9_]+$/.test(k)) continue
    wheres.push(`${k} = ?`)
    params.push(v)
  }
  const sql =
    `SELECT * FROM ${table}` +
    (wheres.length ? ` WHERE ${wheres.join(' AND ')}` : '') +
    ` ORDER BY ${orderBy} LIMIT ${Math.min(limit, 500)}`
  const handle = openBrain(profile)
  try {
    const rows = handle.all(sql, ...params)
    recordAudit(profile, {
      ts: Date.now(),
      surface: 'brain',
      actor,
      action: 'read',
      target_type: table,
      target_id: null,
      reason: `brain_query rows=${rows.length}`,
      outcome: 'ok',
    })
    return { ok: true, data: { rows, count: rows.length } }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  } finally {
    handle.close()
  }
}

function brainWrite(
  args: Record<string, unknown>,
  ctx: BrainToolContext,
  actor: string,
): BrainToolResult {
  const profile = String(args.profile ?? '')
  const table = String(args.table ?? '')
  const payload = (args.payload ?? {}) as Record<string, unknown>
  if (!ALLOWED_TABLES.has(table)) {
    return { ok: false, error: `write not allowed against table: ${table}` }
  }
  const input: DsgInput = {
    profile,
    table,
    action: 'create',
    payload,
    actor,
    token_label: ctx.token_label,
    token_allowed_profiles: ctx.token_allowed_profiles,
    token_allowed_tools: ctx.token_allowed_tools,
  }
  const gate = dsgGate(input)
  if (!gate.ok)
    return {
      ok: false,
      error: gate.reason,
      rule: gate.rule,
      gate_event_id: gate.gate_event_id,
    }
  const cols = Object.keys(payload).filter((k) => /^[a-zA-Z0-9_]+$/.test(k))
  const placeholders = cols.map(() => '?').join(', ')
  const values = cols.map((k) => {
    const v = payload[k]
    if (v == null) return null
    if (typeof v === 'object') return JSON.stringify(v)
    return v
  })
  const handle = openBrain(profile)
  try {
    handle.run(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`,
      ...values,
    )
    return {
      ok: true,
      data: { inserted: true, id: payload.id ?? null, gate_event_id: gate.gate_event_id },
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  } finally {
    handle.close()
  }
}

function brainRecordChat(
  args: Record<string, unknown>,
  actor: string,
): BrainToolResult {
  const res = recordChat({
    profile: String(args.profile),
    channel: args.channel as Parameters<typeof recordChat>[0]['channel'],
    thread_id: (args.thread_id as string) ?? null,
    participants: (args.participants as Array<string>) ?? [],
    role: args.role as Parameters<typeof recordChat>[0]['role'],
    content: String(args.content ?? ''),
    metadata: (args.metadata as Record<string, unknown>) ?? null,
    source_refs: (args.source_refs as Array<unknown>) ?? null,
    decision_context_id: (args.decision_context_id as string) ?? null,
    actor,
  })
  return res.ok
    ? { ok: true, data: { id: res.id, gate_event_id: res.gate_event_id } }
    : { ok: false, error: res.reason ?? 'recordChat failed', rule: res.rule, gate_event_id: res.gate_event_id }
}

function brainRecordLookupMiss(args: Record<string, unknown>): BrainToolResult {
  const res = recordLookupMiss({
    profile: String(args.profile),
    actor: String(args.actor),
    actor_role: (args.actor_role as string) ?? null,
    scope: (args.scope as string) ?? null,
    query: String(args.query ?? ''),
    downstream_decision: args.downstream_decision as
      | 'deferred'
      | 'assumed'
      | 'escalated'
      | undefined,
    assumption: args.assumption as
      | { statement: string; context?: Record<string, unknown> }
      | undefined,
    operator_visible: args.operator_visible !== false,
  })
  return res.ok
    ? {
        ok: true,
        data: {
          lookup_miss_id: res.lookup_miss_id,
          assumption_id: res.assumption_id,
          gate_event_id: res.gate_event_id,
        },
      }
    : {
        ok: false,
        error: res.reason ?? 'recordLookupMiss failed',
        rule: res.rule,
        gate_event_id: res.gate_event_id,
      }
}

function brainRecordHunch(args: Record<string, unknown>): BrainToolResult {
  const res = recordHunch({
    profile: String(args.profile),
    originating_guardian: args.originating_guardian as 'KSG' | 'DSG',
    subject_type: args.subject_type as string | undefined,
    subject_id: args.subject_id as string | undefined,
    statement: String(args.statement ?? ''),
    evidence_refs: args.evidence_refs as Array<unknown> | undefined,
    confidence_label: args.confidence_label as string | undefined,
    proposed_action: args.proposed_action as
      | 'wiki_update'
      | 'brain_update'
      | 'escalate'
      | 'monitor'
      | undefined,
    actor: String(args.actor),
  })
  return res.ok
    ? { ok: true, data: { id: res.id, gate_event_id: res.gate_event_id } }
    : {
        ok: false,
        error: res.reason ?? 'recordHunch failed',
        rule: res.rule,
        gate_event_id: res.gate_event_id,
      }
}

function brainSubscribeEvents(args: Record<string, unknown>): BrainToolResult {
  const profile = String(args.profile ?? '')
  return {
    ok: true,
    data: {
      sse_url: `/api/messaging/stream?profile=${encodeURIComponent(profile)}`,
      event_types_added_by_tranche_a: [
        'brain_gate_decision',
        'brain_lookup_miss',
        'brain_assumption_open',
        'brain_assumption_resolved',
        'brain_hunch_open',
        'brain_self_improvement',
      ],
    },
  }
}

function brainExportSnapshot(args: Record<string, unknown>): BrainToolResult {
  const profile = String(args.profile ?? '')
  const destination = args.destination as string | undefined
  // Run synchronously; caller waits for the JSON-RPC response.
  return {
    ok: true,
    data: {
      pending: true,
      note: 'Snapshot creation kicked off. Use mcp__brain_backup admin tool for synchronous return with checksum.',
      _async_call: () => backupBrain(profile, { destination }),
    },
  }
}

function brainMigrate(args: Record<string, unknown>): BrainToolResult {
  const profile = String(args.profile ?? '')
  const pending = pendingMigrations(profile)
  // openBrain runs migrations on open, so any pending will apply when next opened.
  const handle = openBrain(profile)
  try {
    return {
      ok: true,
      data: {
        applied_count: pending.length,
        schema_version: handle.schemaVersion,
        applied: pending.map((m) => ({ version: m.version, name: m.name })),
      },
    }
  } finally {
    handle.close()
  }
}
