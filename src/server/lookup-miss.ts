/**
 * Lookup-miss and assumption surfacing (SRS Tranche A.7).
 *
 * Load-bearing safety feature: when an agent can't find what it needs,
 * it does NOT silently guess. It records the miss, optionally records
 * an assumption it made to proceed, and surfaces that assumption to the
 * operator. The operator can then accept / reject / clarify, and that
 * resolution flows back as a suggested_knowledge_change (Tranche B).
 *
 * This module is the runtime hook the agents call. The Studio operator
 * UI hangs off `listOperatorVisibleAssumptions()` and `resolveAssumption()`.
 */

import { openBrain, now, uuid } from './brain-store'
import { dsgGate } from './dsg-gate'
import { recordAudit } from './metadata-substrate'

export type LookupMissInput = {
  profile: string
  actor: string
  actor_role?: string | null
  scope?: string | null
  query: string
  downstream_decision?: 'deferred' | 'assumed' | 'escalated'
  assumption?: {
    statement: string
    context?: Record<string, unknown>
  }
  operator_visible?: boolean
}

export type LookupMissResult = {
  ok: boolean
  lookup_miss_id?: string
  assumption_id?: string | null
  gate_event_id?: string
  reason?: string
  rule?: string
}

export function recordLookupMiss(
  input: LookupMissInput,
  options: { profileRoot?: string } = {},
): LookupMissResult {
  const id = uuid()
  const ts = now()

  // DSG gate for the lookup_miss insert.
  const gate = dsgGate({
    profile: input.profile,
    table: 'lookup_misses',
    action: 'create',
    payload: {
      id,
      tenant: input.profile,
      // source_refs not required on lookup_misses (it IS itself the source
      // of the assumption); explicitly add the query as its own ref.
      source_refs: [{ kind: 'query', value: input.query }],
    },
    actor: input.actor,
    actor_role: input.actor_role,
  })
  if (!gate.ok) {
    return {
      ok: false,
      reason: gate.reason,
      rule: gate.rule,
      gate_event_id: gate.gate_event_id,
    }
  }

  let assumptionId: string | null = null
  if (input.downstream_decision === 'assumed') {
    if (!input.assumption) {
      return {
        ok: false,
        reason:
          'downstream_decision=assumed requires an assumption.statement.',
        rule: 'policy-blocked',
        gate_event_id: gate.gate_event_id,
      }
    }
    assumptionId = uuid()
  }

  const handle = openBrain(input.profile, {
    profileRoot: options.profileRoot,
  })
  try {
    handle.run(
      `INSERT INTO lookup_misses (
        id, ts, actor, scope, query, downstream_decision,
        assumption_id, operator_visible
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      ts,
      input.actor,
      input.scope ?? null,
      input.query,
      input.downstream_decision ?? null,
      assumptionId,
      input.operator_visible === false ? 0 : 1,
    )

    if (assumptionId && input.assumption) {
      handle.run(
        `INSERT INTO assumptions (
          id, ts, actor, lookup_miss_id, statement, context, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        assumptionId,
        ts,
        input.actor,
        id,
        input.assumption.statement,
        JSON.stringify(input.assumption.context ?? {}),
        'open',
      )
    }

    recordAudit(input.profile, {
      ts,
      surface: 'brain',
      actor: input.actor,
      actor_role: input.actor_role,
      action: 'create',
      target_type: 'lookup_misses',
      target_id: id,
      reason: `lookup miss: ${input.query.slice(0, 96)}`,
      outcome: 'ok',
      gate_event_id: gate.gate_event_id,
    }, options)

    return {
      ok: true,
      lookup_miss_id: id,
      assumption_id: assumptionId,
      gate_event_id: gate.gate_event_id,
    }
  } finally {
    handle.close()
  }
}

export type OperatorVisibleAssumption = {
  id: string
  ts: number
  actor: string
  lookup_miss_id: string | null
  statement: string
  context: Record<string, unknown> | null
  status: 'open' | 'accepted' | 'rejected' | 'clarified'
}

export function listOperatorVisibleAssumptions(
  profile: string,
  options: { profileRoot?: string; includeResolved?: boolean } = {},
): Array<OperatorVisibleAssumption> {
  const handle = openBrain(profile, { profileRoot: options.profileRoot })
  try {
    const rows = options.includeResolved
      ? handle.all<OperatorVisibleAssumption & { context: string | null }>(
          `SELECT id, ts, actor, lookup_miss_id, statement, context, status
           FROM assumptions
           ORDER BY ts DESC LIMIT 500`,
        )
      : handle.all<OperatorVisibleAssumption & { context: string | null }>(
          `SELECT id, ts, actor, lookup_miss_id, statement, context, status
           FROM assumptions
           WHERE status = 'open'
           ORDER BY ts DESC LIMIT 500`,
        )
    return rows.map((r) => ({
      id: r.id,
      ts: r.ts,
      actor: r.actor,
      lookup_miss_id: r.lookup_miss_id,
      statement: r.statement,
      context: safeParseJson(r.context),
      status: r.status,
    }))
  } finally {
    handle.close()
  }
}

export type AssumptionResolution = 'accepted' | 'rejected' | 'clarified'

export type ResolveAssumptionInput = {
  profile: string
  assumption_id: string
  resolution: AssumptionResolution
  resolved_by: string
  resolution_notes?: string
  /** When provided + resolution=clarified, opens a suggested_knowledge_change. */
  suggested_change?: {
    target_wiki_path: string
    change_type: 'add' | 'modify' | 'deprecate'
    diff: string
    rationale: string
  }
}

export type ResolveAssumptionResult = {
  ok: boolean
  reason?: string
  rule?: string
  gate_event_id?: string
  suggested_knowledge_change_id?: string
}

export function resolveAssumption(
  input: ResolveAssumptionInput,
  options: { profileRoot?: string } = {},
): ResolveAssumptionResult {
  const gate = dsgGate({
    profile: input.profile,
    table: 'assumptions',
    action: 'update',
    payload: {
      id: input.assumption_id,
      tenant: input.profile,
      source_refs: [{ kind: 'operator-resolution', value: input.resolved_by }],
    },
    actor: input.resolved_by.startsWith('user:')
      ? input.resolved_by
      : `user:${input.resolved_by}`,
  })
  if (!gate.ok) {
    return {
      ok: false,
      reason: gate.reason,
      rule: gate.rule,
      gate_event_id: gate.gate_event_id,
    }
  }

  const handle = openBrain(input.profile, {
    profileRoot: options.profileRoot,
  })
  try {
    let suggestedId: string | undefined
    if (input.resolution === 'clarified' && input.suggested_change) {
      suggestedId = uuid()
      try {
        handle.run(
          `INSERT INTO suggested_knowledge_changes (
            id, ts, proposer, target_wiki_path, change_type, diff, rationale,
            source_refs, status, tenant
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          suggestedId,
          now(),
          input.resolved_by,
          input.suggested_change.target_wiki_path,
          input.suggested_change.change_type,
          input.suggested_change.diff,
          input.suggested_change.rationale,
          JSON.stringify([
            { kind: 'assumption', value: input.assumption_id },
          ]),
          'open',
          input.profile,
        )
      } catch {
        // Tranche B migration not applied yet — skip silently rather than fail
        // the operator's resolution; the suggested-change is a nice-to-have.
        suggestedId = undefined
      }
    }

    handle.run(
      `UPDATE assumptions SET
         status = ?,
         resolved_at = ?,
         resolved_by = ?,
         resolution_notes = ?,
         suggested_knowledge_change_id = ?
       WHERE id = ?`,
      input.resolution,
      now(),
      input.resolved_by,
      input.resolution_notes ?? null,
      suggestedId ?? null,
      input.assumption_id,
    )

    // Mirror status on the parent lookup_miss row.
    handle.run(
      `UPDATE lookup_misses SET
         resolved_at = ?, resolution = ?, resolution_notes = ?
       WHERE assumption_id = ?`,
      now(),
      input.resolution,
      input.resolution_notes ?? null,
      input.assumption_id,
    )

    recordAudit(input.profile, {
      ts: now(),
      surface: 'brain',
      actor: input.resolved_by.startsWith('user:')
        ? input.resolved_by
        : `user:${input.resolved_by}`,
      action: 'update',
      target_type: 'assumptions',
      target_id: input.assumption_id,
      version_after: input.resolution,
      reason: input.resolution_notes ?? `resolved as ${input.resolution}`,
      outcome: 'ok',
      gate_event_id: gate.gate_event_id,
    }, options)

    return {
      ok: true,
      gate_event_id: gate.gate_event_id,
      suggested_knowledge_change_id: suggestedId,
    }
  } finally {
    handle.close()
  }
}

function safeParseJson(v: string | null | undefined): Record<string, unknown> | null {
  if (!v) return null
  try {
    return JSON.parse(v) as Record<string, unknown>
  } catch {
    return null
  }
}

export function listOpenLookupMisses(
  profile: string,
  options: { profileRoot?: string; limit?: number } = {},
): Array<{
  id: string
  ts: number
  actor: string
  scope: string | null
  query: string
  downstream_decision: string | null
}> {
  const handle = openBrain(profile, { profileRoot: options.profileRoot })
  try {
    return handle.all(
      `SELECT id, ts, actor, scope, query, downstream_decision
       FROM lookup_misses
       WHERE resolved_at IS NULL AND operator_visible = 1
       ORDER BY ts DESC LIMIT ?`,
      options.limit ?? 200,
    )
  } finally {
    handle.close()
  }
}
