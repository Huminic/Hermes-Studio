/**
 * Data Semantic Guardian (DSG) gate — SRS Tranche A.2.
 *
 * Mirrors the Knowledge Semantic Guardian (src/server/ksg-gate.ts) shape
 * but governs writes against the per-profile Brain instead of the wiki.
 * Same GateOutcome contract, same machine-readable rule IDs, same audit
 * substrate (metadata_audit, the sixth wiki invariant).
 *
 * The DSG is also an advisor: when an action is denied, the response
 * MUST include either a recommended next action, a knowledge gap
 * reference, or a request to create a reconciliation item (SRS A.2).
 *
 * Every Brain write path in the codebase MUST route through dsgGate.
 * Tests verify there is no bypass.
 */

import { recordAudit } from './metadata-substrate'

export type DsgAction =
  | 'create'
  | 'update'
  | 'deprecate'
  | 'archive'
  | 'read'
  | 'cross_profile_read'

export type DsgInput = {
  profile: string
  table: string
  action: DsgAction
  payload?: Record<string, unknown> | null
  actor: string
  actor_role?: string | null
  /** Token label or null when actor is a Studio admin user. */
  token_label?: string | null
  /** Token allowed_profiles list (for cross_profile_read enforcement). */
  token_allowed_profiles?: Array<string>
  /** Token allowed_tools list (for tool surface enforcement). */
  token_allowed_tools?: Array<string>
  context?: Record<string, unknown> | null
}

export type DsgAdvice = {
  next_action?: string
  knowledge_gap_ref?: string
  create_reconciliation_item?: boolean
  notes?: string
}

export type DsgOutcome =
  | {
      ok: true
      warnings: Array<string>
      gate_event_id: string
      advice?: DsgAdvice
    }
  | {
      ok: false
      reason: string
      rule: DsgRuleId
      gate_event_id: string
      advice: DsgAdvice
    }

/**
 * Machine-readable rule IDs. Once introduced these MUST be stable per
 * SRS A.2 ("rule IDs MUST be stable once introduced"). Extensions
 * appended after current set are fine; renames break audit traces.
 */
export type DsgRuleId =
  | 'missing-source-reference'
  | 'cross-profile-write-denied'
  | 'tenant-mismatch'
  | 'confidence-below-threshold'
  | 'frontmatter-link-missing'
  | 'pii-redaction-required'
  | 'append-only-violation'
  | 'unknown-actor'
  | 'unscoped-tool'
  | 'low-confidence-publication'
  | 'reconciliation-required'
  | 'policy-blocked'
  | 'invalid-table'
  | 'unknown-rule'

/**
 * Tables where every write that influences execution, reporting, or
 * knowledge suggestion MUST carry a source_references payload.
 * Per SRS B.1 ("source_references mandatory on any record influencing
 * execution, reporting, or knowledge suggestions").
 */
const SOURCE_REF_REQUIRED_TABLES = new Set([
  'events',
  'entities',
  'observations',
  'outputs',
  'tasks',
  'transactions',
  'suggested_knowledge_changes',
  'hunches',
  'assumptions',
  'adjacent_neighbors',
  'uploads',
])

/**
 * Tables that are append-only — DSG rejects update/deprecate/archive on these.
 */
const APPEND_ONLY_TABLES = new Set([
  'metadata_audit',
  'events',
  'chat_records',
  'self_improvement_events',
  'comms_log',
])

/**
 * Tables whose writes require an explicit admin scope or operator role.
 */
const ADMIN_ONLY_TABLES = new Set([
  'schema_migrations',
])

/**
 * Synchronous gate. Wraps the policy decision and unconditionally writes
 * a metadata_audit record so the gate decision itself is auditable.
 */
export function dsgGate(input: DsgInput): DsgOutcome {
  const decision = evaluate(input)

  const auditEntry = recordAudit(input.profile, {
    ts: Date.now(),
    surface: 'brain',
    actor: input.actor,
    actor_role: input.actor_role,
    action: 'gate_decision',
    target_type: input.table,
    target_id: stringId(input.payload),
    reason: decision.ok
      ? 'allowed'
      : `${decision.rule}: ${decision.reason}`,
    outcome: decision.ok ? 'ok' : 'denied',
    rule: decision.ok ? null : decision.rule,
    source_refs: (input.payload && (input.payload as Record<string, unknown>).source_refs) ?? null,
    confidence_state:
      (input.payload && String((input.payload as Record<string, unknown>).confidence_label ?? '')) || null,
  })

  if (decision.ok) {
    return {
      ok: true,
      warnings: decision.warnings,
      gate_event_id: auditEntry.gate_event_id,
      advice: decision.advice,
    }
  }
  return {
    ok: false,
    reason: decision.reason,
    rule: decision.rule,
    gate_event_id: auditEntry.gate_event_id,
    advice: decision.advice,
  }
}

type Decision =
  | { ok: true; warnings: Array<string>; advice?: DsgAdvice }
  | { ok: false; reason: string; rule: DsgRuleId; advice: DsgAdvice }

function evaluate(input: DsgInput): Decision {
  // Cross-profile reads — must be granted via wildcard scope.
  if (input.action === 'cross_profile_read') {
    const allow = input.token_allowed_profiles ?? []
    if (!allow.includes('*')) {
      return {
        ok: false,
        rule: 'cross-profile-write-denied',
        reason:
          'Cross-profile read requires a token with allowed_profiles: ["*"]. Acquire an admin scope or issue a scoped rollup token.',
        advice: {
          next_action:
            'Request an admin-scoped token via mcp__issue_token or use a profile rollup token.',
        },
      }
    }
  }

  if (!input.table || typeof input.table !== 'string') {
    return {
      ok: false,
      rule: 'invalid-table',
      reason: 'No table specified in DSG input.',
      advice: { notes: 'Caller must pass a non-empty target table.' },
    }
  }

  // Append-only enforcement.
  if (
    APPEND_ONLY_TABLES.has(input.table) &&
    ['update', 'deprecate', 'archive'].includes(input.action)
  ) {
    return {
      ok: false,
      rule: 'append-only-violation',
      reason: `Table ${input.table} is append-only. Use new rows to supersede prior state.`,
      advice: {
        next_action:
          'Insert a new row representing the corrected state; downstream queries should read latest by timestamp.',
      },
    }
  }

  // Admin-only tables — verify admin tool surface.
  if (ADMIN_ONLY_TABLES.has(input.table)) {
    const tools = input.token_allowed_tools ?? []
    if (!tools.some((t) => t === '*' || t.startsWith('mcp__'))) {
      return {
        ok: false,
        rule: 'unscoped-tool',
        reason: `Table ${input.table} requires an admin-scope tool.`,
        advice: { next_action: 'Use an mcp__* tool with admin token.' },
      }
    }
  }

  // Source reference requirement.
  if (
    SOURCE_REF_REQUIRED_TABLES.has(input.table) &&
    ['create', 'update'].includes(input.action)
  ) {
    const refs = (input.payload &&
      (input.payload as Record<string, unknown>).source_refs) as
      | unknown
      | undefined
    if (!hasSourceRefs(refs)) {
      return {
        ok: false,
        rule: 'missing-source-reference',
        reason: `${input.table} writes MUST carry source_refs.`,
        advice: {
          next_action:
            'Attach at least one source_reference id (wiki path, upload id, chat record, or external URI) before retrying.',
          knowledge_gap_ref: 'see knowledge/policy/source-references.md',
        },
      }
    }
  }

  // Tenant discriminator (every payload must carry tenant matching profile).
  const payload = input.payload as Record<string, unknown> | undefined
  if (payload && payload.tenant && payload.tenant !== input.profile) {
    return {
      ok: false,
      rule: 'tenant-mismatch',
      reason: `payload.tenant (${payload.tenant}) does not match profile (${input.profile}).`,
      advice: { next_action: 'Re-issue write under the correct profile.' },
    }
  }

  // Unknown actor — actor must be a known identity (token:<label>, user:<name>, or system).
  if (!isKnownActor(input.actor)) {
    return {
      ok: false,
      rule: 'unknown-actor',
      reason: `Actor ${input.actor} is not a recognized identity form.`,
      advice: {
        next_action:
          'Use actor strings of the form "user:<username>", "token:<label>", or "system:<subsystem>".',
      },
    }
  }

  // Confidence threshold check on publication actions.
  if (
    payload &&
    payload.status === 'canonical' &&
    payload.confidence_label &&
    payload.confidence_label === 'F'
  ) {
    return {
      ok: false,
      rule: 'low-confidence-publication',
      reason:
        'Cannot publish a record with confidence_label=F as canonical. Promote via reconciliation flow.',
      advice: { create_reconciliation_item: true },
    }
  }

  const warnings: Array<string> = []
  if (
    SOURCE_REF_REQUIRED_TABLES.has(input.table) &&
    input.action === 'create' &&
    !payload?.confidence_label
  ) {
    warnings.push(
      'No confidence_label supplied. Defaulting to under-review.',
    )
  }

  return { ok: true, warnings }
}

function hasSourceRefs(v: unknown): boolean {
  if (!v) return false
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v)
      return Array.isArray(parsed) && parsed.length > 0
    } catch {
      return v.trim().length > 0
    }
  }
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') return Object.keys(v as object).length > 0
  return false
}

function isKnownActor(actor: string): boolean {
  if (!actor || typeof actor !== 'string') return false
  return (
    actor.startsWith('user:') ||
    actor.startsWith('token:') ||
    actor.startsWith('system:') ||
    actor === 'system'
  )
}

function stringId(payload?: Record<string, unknown> | null): string | null {
  if (!payload) return null
  const id = (payload as Record<string, unknown>).id
  return typeof id === 'string' ? id : null
}

/**
 * Read-side gate. Called when a Brain query crosses profiles or escalates
 * scope. Returns the same shape as the write gate.
 */
export function dsgReadGate(input: {
  profile: string
  cross_profile: boolean
  actor: string
  token_allowed_profiles?: Array<string>
  token_allowed_tools?: Array<string>
  reason?: string
}): DsgOutcome {
  return dsgGate({
    profile: input.profile,
    table: '__read_gate__',
    action: input.cross_profile ? 'cross_profile_read' : 'read',
    payload: null,
    actor: input.actor,
    token_allowed_profiles: input.token_allowed_profiles,
    token_allowed_tools: input.token_allowed_tools,
    context: { reason: input.reason },
  })
}
