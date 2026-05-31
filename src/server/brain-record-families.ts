/**
 * Typed inserters for the Brain record families (SRS Tranche B.1).
 *
 * Operationalizes Artifact D's record families against the live runtime
 * with strict DSG enforcement: every insert goes through `dsgGate` so
 * source_references, tenant discriminator, and audit substrate
 * propagation are all enforced.
 *
 * Source mappings live in src/server/brain-sync.ts which uses these
 * inserters to mirror messaging-hub / ADF / Vapi / agent-reply-jobs
 * into the Brain as the right record family.
 */

import { openBrain, now, uuid, jsonOrNull } from './brain-store'
import { dsgGate, type DsgInput } from './dsg-gate'

export type SourceRef =
  | { kind: 'wiki'; value: string }
  | { kind: 'upload'; value: string }
  | { kind: 'chat'; value: string }
  | { kind: 'external'; value: string }
  | { kind: 'message'; value: string }
  | { kind: 'thread'; value: string }
  | { kind: 'webhook'; value: string }
  | { kind: 'agent'; value: string }
  | { kind: 'engagement'; value: string }
  | { kind: 'embed'; value: string }
  | { kind: 'self-improvement-event'; value: string }
  | { kind: string; value: string | null }

export type FamilyWriteResult =
  | { ok: true; id: string; gate_event_id: string }
  | { ok: false; reason: string; rule: string; gate_event_id: string }

function writeOne(
  table: string,
  profile: string,
  actor: string,
  payload: Record<string, unknown>,
  options: { profileRoot?: string } = {},
): FamilyWriteResult {
  const id = (payload.id as string) ?? uuid()
  const tenanted = { ...payload, id, tenant: profile }
  const gate = dsgGate({
    profile,
    table,
    action: 'create',
    payload: tenanted,
    actor,
  })
  if (!gate.ok) {
    return {
      ok: false,
      reason: gate.reason,
      rule: gate.rule,
      gate_event_id: gate.gate_event_id,
    }
  }
  const cols = Object.keys(tenanted).filter((k) =>
    /^[a-zA-Z0-9_]+$/.test(k),
  )
  const placeholders = cols.map(() => '?').join(', ')
  const values = cols.map((k) => {
    const v = (tenanted as Record<string, unknown>)[k]
    if (v == null) return null
    if (typeof v === 'object') return JSON.stringify(v)
    return v
  })
  const handle = openBrain(profile, { profileRoot: options.profileRoot })
  try {
    handle.run(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`,
      ...values,
    )
    return { ok: true, id, gate_event_id: gate.gate_event_id }
  } catch (err) {
    return {
      ok: false,
      reason: (err as Error).message,
      rule: 'policy-blocked',
      gate_event_id: gate.gate_event_id,
    }
  } finally {
    handle.close()
  }
}

// ─── events ────────────────────────────────────────────────────────

export type EventInput = {
  profile: string
  actor: string
  ts?: number
  type: string
  source: string
  subject_type?: string
  subject_id?: string
  payload: Record<string, unknown>
  source_refs: Array<SourceRef>
}

export function insertEvent(
  e: EventInput,
  options: { profileRoot?: string } = {},
): FamilyWriteResult {
  return writeOne(
    'events',
    e.profile,
    e.actor,
    {
      ts: e.ts ?? now(),
      type: e.type,
      source: e.source,
      subject_type: e.subject_type ?? null,
      subject_id: e.subject_id ?? null,
      payload: e.payload,
      source_refs: e.source_refs,
    },
    options,
  )
}

// ─── entities ──────────────────────────────────────────────────────

export type EntityInput = {
  profile: string
  actor: string
  id?: string
  type: string
  external_id?: string
  display_name?: string
  attributes: Record<string, unknown>
  source_refs: Array<SourceRef>
}

export function upsertEntity(
  e: EntityInput,
  options: { profileRoot?: string } = {},
): FamilyWriteResult {
  // Try existing entity first (idempotency by external_id when supplied).
  if (e.external_id) {
    const handle = openBrain(e.profile, { profileRoot: options.profileRoot })
    try {
      const existing = handle.get<{ id: string }>(
        `SELECT id FROM entities WHERE type = ? AND external_id = ?`,
        e.type,
        e.external_id,
      )
      if (existing?.id) {
        const ts = now()
        handle.run(
          `UPDATE entities SET attributes = ?, updated_at = ?, source_refs = ?, display_name = COALESCE(?, display_name)
           WHERE id = ?`,
          JSON.stringify(e.attributes),
          ts,
          JSON.stringify(e.source_refs),
          e.display_name ?? null,
          existing.id,
        )
        return { ok: true, id: existing.id, gate_event_id: 'upsert-existing' }
      }
    } finally {
      handle.close()
    }
  }
  const ts = now()
  return writeOne(
    'entities',
    e.profile,
    e.actor,
    {
      id: e.id,
      type: e.type,
      external_id: e.external_id ?? null,
      display_name: e.display_name ?? null,
      attributes: e.attributes,
      source_refs: e.source_refs,
      created_at: ts,
      updated_at: ts,
    },
    options,
  )
}

// ─── observations ──────────────────────────────────────────────────

export type ObservationInput = {
  profile: string
  actor: string
  ts?: number
  observer: string
  subject_type?: string
  subject_id?: string
  observation: string
  confidence_label?: string
  source_refs: Array<SourceRef>
}

export function insertObservation(
  o: ObservationInput,
  options: { profileRoot?: string } = {},
): FamilyWriteResult {
  return writeOne(
    'observations',
    o.profile,
    o.actor,
    {
      ts: o.ts ?? now(),
      observer: o.observer,
      subject_type: o.subject_type ?? null,
      subject_id: o.subject_id ?? null,
      observation: o.observation,
      confidence_label: o.confidence_label ?? null,
      source_refs: o.source_refs,
    },
    options,
  )
}

// ─── outputs ───────────────────────────────────────────────────────

export type OutputInput = {
  profile: string
  actor: string
  ts?: number
  producer_actor: string
  output_type: string
  content: string
  metadata?: Record<string, unknown>
  source_refs: Array<SourceRef>
}

export function insertOutput(
  o: OutputInput,
  options: { profileRoot?: string } = {},
): FamilyWriteResult {
  return writeOne(
    'outputs',
    o.profile,
    o.actor,
    {
      ts: o.ts ?? now(),
      producer_actor: o.producer_actor,
      output_type: o.output_type,
      content: o.content,
      metadata: o.metadata ?? null,
      source_refs: o.source_refs,
    },
    options,
  )
}

// ─── transactions ──────────────────────────────────────────────────

export type TransactionInput = {
  profile: string
  actor: string
  ts?: number
  type: string
  amount_value?: number
  amount_currency?: string
  payload: Record<string, unknown>
  source_refs: Array<SourceRef>
}

export function insertTransaction(
  t: TransactionInput,
  options: { profileRoot?: string } = {},
): FamilyWriteResult {
  return writeOne(
    'transactions',
    t.profile,
    t.actor,
    {
      ts: t.ts ?? now(),
      type: t.type,
      amount_value: t.amount_value ?? null,
      amount_currency: t.amount_currency ?? null,
      payload: t.payload,
      source_refs: t.source_refs,
    },
    options,
  )
}

// ─── tasks ─────────────────────────────────────────────────────────

export type TaskInput = {
  profile: string
  actor: string
  id?: string
  status: 'open' | 'in_progress' | 'done' | 'blocked' | 'cancelled'
  assigned_to?: string
  subject_type?: string
  subject_id?: string
  description: string
  due_at?: number
  source_refs: Array<SourceRef>
}

export function insertTask(
  t: TaskInput,
  options: { profileRoot?: string } = {},
): FamilyWriteResult {
  const ts = now()
  return writeOne(
    'tasks',
    t.profile,
    t.actor,
    {
      id: t.id,
      status: t.status,
      assigned_to: t.assigned_to ?? null,
      subject_type: t.subject_type ?? null,
      subject_id: t.subject_id ?? null,
      description: t.description,
      due_at: t.due_at ?? null,
      source_refs: t.source_refs,
      created_at: ts,
      updated_at: ts,
    },
    options,
  )
}

// ─── retrieval context snapshots (memory layer scaffold) ──────────

export type RetrievalSnapshotInput = {
  profile: string
  actor: string
  ts?: number
  decision_id?: string
  query?: string
  retrieved_refs: Array<SourceRef>
  reasoning?: string
}

export function insertRetrievalSnapshot(
  s: RetrievalSnapshotInput,
  options: { profileRoot?: string } = {},
): FamilyWriteResult {
  // retrieval_context_snapshots is NOT source-ref-required (the
  // retrieved_refs field IS the source). DSG enforces tenant + actor
  // form only here.
  const id = uuid()
  const tenanted = {
    id,
    ts: s.ts ?? now(),
    actor: s.actor,
    decision_id: s.decision_id ?? null,
    query: s.query ?? null,
    retrieved_refs: s.retrieved_refs,
    reasoning: s.reasoning ?? null,
    tenant: s.profile,
  }
  const gate = dsgGate({
    profile: s.profile,
    table: 'retrieval_context_snapshots',
    action: 'create',
    payload: tenanted,
    actor: s.actor,
  })
  if (!gate.ok) {
    return {
      ok: false,
      reason: gate.reason,
      rule: gate.rule,
      gate_event_id: gate.gate_event_id,
    }
  }
  const handle = openBrain(s.profile, { profileRoot: options.profileRoot })
  try {
    handle.run(
      `INSERT INTO retrieval_context_snapshots (id, ts, actor, decision_id, query, retrieved_refs, reasoning, tenant)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      tenanted.ts,
      tenanted.actor,
      tenanted.decision_id,
      tenanted.query,
      JSON.stringify(tenanted.retrieved_refs),
      tenanted.reasoning,
      s.profile,
    )
    return { ok: true, id, gate_event_id: gate.gate_event_id }
  } finally {
    handle.close()
  }
}

// ─── reconciliation items ─────────────────────────────────────────

export type ReconciliationInput = {
  profile: string
  actor: string
  conflict_type: string
  wiki_ref?: string
  brain_ref?: string
  lineage: Record<string, unknown>
  proposed_resolution?: string
}

export function openReconciliation(
  r: ReconciliationInput,
  options: { profileRoot?: string } = {},
): FamilyWriteResult {
  const id = uuid()
  const tenanted = {
    id,
    ts: now(),
    conflict_type: r.conflict_type,
    wiki_ref: r.wiki_ref ?? null,
    brain_ref: r.brain_ref ?? null,
    lineage: r.lineage,
    status: 'open',
    proposed_resolution: r.proposed_resolution ?? null,
    tenant: r.profile,
  }
  const gate = dsgGate({
    profile: r.profile,
    table: 'reconciliation_items',
    action: 'create',
    payload: tenanted,
    actor: r.actor,
  })
  if (!gate.ok) {
    return {
      ok: false,
      reason: gate.reason,
      rule: gate.rule,
      gate_event_id: gate.gate_event_id,
    }
  }
  const handle = openBrain(r.profile, { profileRoot: options.profileRoot })
  try {
    handle.run(
      `INSERT INTO reconciliation_items (
        id, ts, conflict_type, wiki_ref, brain_ref, lineage,
        status, proposed_resolution, tenant
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      tenanted.ts,
      tenanted.conflict_type,
      tenanted.wiki_ref,
      tenanted.brain_ref,
      JSON.stringify(tenanted.lineage),
      tenanted.status,
      tenanted.proposed_resolution,
      r.profile,
    )
    return { ok: true, id, gate_event_id: gate.gate_event_id }
  } finally {
    handle.close()
  }
}

// ─── adjacent neighbors ───────────────────────────────────────────

export type AdjacentNeighborInput = {
  profile: string
  actor: string
  id?: string
  name: string
  source_type: 'crm' | 'survey' | 'doc-store' | 'analytics' | 'scraper' | 'other'
  likelihood?: 'low' | 'medium' | 'high'
  classification: 'federated_externally' | 'absorbed_into_brain' | 'ignored'
  notes?: string
}

export function recordAdjacentNeighbor(
  n: AdjacentNeighborInput,
  options: { profileRoot?: string } = {},
): FamilyWriteResult {
  return writeOne(
    'adjacent_neighbors',
    n.profile,
    n.actor,
    {
      id: n.id,
      ts: now(),
      name: n.name,
      source_type: n.source_type,
      likelihood: n.likelihood ?? null,
      classification: n.classification,
      notes: n.notes ?? null,
      // adjacent_neighbors requires source_refs per DSG.
      source_refs: [
        { kind: 'engagement', value: 'engagement-state.yaml' },
      ],
    },
    options,
  )
}

// ─── suggested knowledge changes ──────────────────────────────────

export type SuggestedKnowledgeChangeInput = {
  profile: string
  actor: string
  proposer: string
  target_wiki_path: string
  change_type: 'add' | 'modify' | 'deprecate'
  diff: string
  rationale: string
  source_refs: Array<SourceRef>
}

export function recordSuggestedKnowledgeChange(
  s: SuggestedKnowledgeChangeInput,
  options: { profileRoot?: string } = {},
): FamilyWriteResult {
  const id = uuid()
  return writeOne(
    'suggested_knowledge_changes',
    s.profile,
    s.actor,
    {
      id,
      ts: now(),
      proposer: s.proposer,
      target_wiki_path: s.target_wiki_path,
      change_type: s.change_type,
      diff: s.diff,
      rationale: s.rationale,
      source_refs: s.source_refs,
      status: 'open',
    },
    options,
  )
}
