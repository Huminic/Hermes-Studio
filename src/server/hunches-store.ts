/**
 * Hunches store (SRS Tranche B.2 — implemented in Tranche A because A.8
 * Hermes self-improvement integration needs a place to drop hunches).
 *
 * A "hunch" is a recorded suspicion, observation, or proposed improvement
 * from a Semantic Guardian. It is NOT a silent edit. The Knowledge Agent
 * (KSG) writes hunches destined to update the wiki; the Data Agent (DSG)
 * writes hunches destined to update the Brain. All hunches are auditable
 * under the same metadata substrate as the rest of the Brain.
 */

import { openBrain, now, uuid, jsonOrNull } from './brain-store'
import { dsgGate } from './dsg-gate'
import { recordAudit } from './metadata-substrate'

export type HunchProposal = {
  profile: string
  originating_guardian: 'KSG' | 'DSG'
  subject_type?: string
  subject_id?: string
  statement: string
  evidence_refs?: Array<unknown>
  confidence_label?: string
  proposed_action?: 'wiki_update' | 'brain_update' | 'escalate' | 'monitor'
  actor: string
}

export type HunchRecord = {
  id: string
  ts: number
  originating_guardian: 'KSG' | 'DSG'
  subject_type: string | null
  subject_id: string | null
  statement: string
  evidence_refs: Array<unknown> | null
  confidence_label: string | null
  status: 'open' | 'resolved' | 'dismissed'
  proposed_action: string | null
  resolver_actor: string | null
  resolved_at: number | null
  resolution_notes: string | null
}

export type RecordHunchResult = {
  ok: boolean
  id?: string
  gate_event_id?: string
  reason?: string
  rule?: string
}

export function recordHunch(
  input: HunchProposal,
  options: { profileRoot?: string } = {},
): RecordHunchResult {
  const id = uuid()
  const ts = now()
  const evidence = input.evidence_refs ?? [
    { kind: 'guardian-observation', value: input.originating_guardian },
  ]

  const gate = dsgGate({
    profile: input.profile,
    table: 'hunches',
    action: 'create',
    payload: {
      id,
      tenant: input.profile,
      source_refs: evidence,
      confidence_label: input.confidence_label,
    },
    actor: input.actor,
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
    handle.run(
      `INSERT INTO hunches (
        id, ts, originating_guardian, subject_type, subject_id, statement,
        evidence_refs, confidence_label, status, proposed_action
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      ts,
      input.originating_guardian,
      input.subject_type ?? null,
      input.subject_id ?? null,
      input.statement,
      jsonOrNull(evidence),
      input.confidence_label ?? null,
      'open',
      input.proposed_action ?? 'monitor',
    )

    recordAudit(input.profile, {
      ts,
      surface: 'brain',
      actor: input.actor,
      action: 'create',
      target_type: 'hunches',
      target_id: id,
      version_after: input.statement.slice(0, 128),
      reason: `${input.originating_guardian} hunch`,
      outcome: 'ok',
      gate_event_id: gate.gate_event_id,
      confidence_state: input.confidence_label ?? null,
      source_refs: evidence,
    }, options)

    return { ok: true, id, gate_event_id: gate.gate_event_id }
  } finally {
    handle.close()
  }
}

export function listHunches(
  profile: string,
  options: { profileRoot?: string; status?: HunchRecord['status']; limit?: number } = {},
): Array<HunchRecord> {
  const handle = openBrain(profile, { profileRoot: options.profileRoot })
  try {
    const rows = options.status
      ? handle.all<HunchRecord & { evidence_refs: string | null }>(
          `SELECT id, ts, originating_guardian, subject_type, subject_id, statement,
                  evidence_refs, confidence_label, status, proposed_action,
                  resolver_actor, resolved_at, resolution_notes
           FROM hunches WHERE status = ? ORDER BY ts DESC LIMIT ?`,
          options.status,
          options.limit ?? 200,
        )
      : handle.all<HunchRecord & { evidence_refs: string | null }>(
          `SELECT id, ts, originating_guardian, subject_type, subject_id, statement,
                  evidence_refs, confidence_label, status, proposed_action,
                  resolver_actor, resolved_at, resolution_notes
           FROM hunches ORDER BY ts DESC LIMIT ?`,
          options.limit ?? 200,
        )
    return rows.map((r) => ({
      ...r,
      evidence_refs: safeParseArr(r.evidence_refs),
    })) as Array<HunchRecord>
  } finally {
    handle.close()
  }
}

export type ResolveHunchInput = {
  profile: string
  id: string
  resolver_actor: string
  resolution: 'resolved' | 'dismissed'
  resolution_notes?: string
}

export function resolveHunch(
  input: ResolveHunchInput,
  options: { profileRoot?: string } = {},
): { ok: boolean; reason?: string; rule?: string; gate_event_id?: string } {
  const gate = dsgGate({
    profile: input.profile,
    table: 'hunches',
    action: 'update',
    payload: {
      id: input.id,
      tenant: input.profile,
      source_refs: [{ kind: 'resolver', value: input.resolver_actor }],
    },
    actor: input.resolver_actor.startsWith('user:')
      ? input.resolver_actor
      : `user:${input.resolver_actor}`,
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
    handle.run(
      `UPDATE hunches SET
         status = ?,
         resolver_actor = ?,
         resolved_at = ?,
         resolution_notes = ?
       WHERE id = ?`,
      input.resolution,
      input.resolver_actor,
      now(),
      input.resolution_notes ?? null,
      input.id,
    )
    recordAudit(input.profile, {
      ts: now(),
      surface: 'brain',
      actor: input.resolver_actor.startsWith('user:')
        ? input.resolver_actor
        : `user:${input.resolver_actor}`,
      action: 'update',
      target_type: 'hunches',
      target_id: input.id,
      version_after: input.resolution,
      reason: input.resolution_notes ?? `resolved as ${input.resolution}`,
      outcome: 'ok',
      gate_event_id: gate.gate_event_id,
    }, options)
    return { ok: true, gate_event_id: gate.gate_event_id }
  } finally {
    handle.close()
  }
}

function safeParseArr(v: string | null | undefined): Array<unknown> | null {
  if (!v) return null
  try {
    const p = JSON.parse(v)
    return Array.isArray(p) ? p : null
  } catch {
    return null
  }
}
