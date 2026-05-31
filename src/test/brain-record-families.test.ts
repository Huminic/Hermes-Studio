import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openBrain } from '@/server/brain-store'
import {
  insertEvent,
  upsertEntity,
  insertObservation,
  insertOutput,
  insertTransaction,
  insertTask,
  insertRetrievalSnapshot,
  openReconciliation,
  recordAdjacentNeighbor,
  recordSuggestedKnowledgeChange,
} from '@/server/brain-record-families'

let tmpRoot: string

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'record-families-test-'))
  process.env.BRAIN_PROFILES_ROOT = path.join(tmpRoot, '.hermes', 'profiles')
  const profileRoot = path.join(tmpRoot, '.hermes', 'profiles', 'fixture')
  fs.mkdirSync(profileRoot, { recursive: true })
  const handle = openBrain('fixture', { profileRoot })
  handle.close()
})

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
})

describe('brain record families (SRS B.1)', () => {
  it('insertEvent succeeds with source_refs and recorded gate event', () => {
    const r = insertEvent({
      profile: 'fixture',
      actor: 'token:test',
      type: 'message',
      source: 'messaging-hub',
      subject_type: 'thread',
      subject_id: 'thr-1',
      payload: { content_preview: 'hi' },
      source_refs: [{ kind: 'message', value: 'msg-1' }],
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.id).toBeTruthy()
  })

  it('insertEvent rejects when source_refs missing', () => {
    const r = insertEvent({
      profile: 'fixture',
      actor: 'token:test',
      type: 'message',
      source: 'messaging-hub',
      payload: {},
      source_refs: [],
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.rule).toBe('missing-source-reference')
  })

  it('upsertEntity creates then updates on second call with same external_id', () => {
    const r1 = upsertEntity({
      profile: 'fixture',
      actor: 'token:test',
      type: 'contact',
      external_id: 'ext-1',
      display_name: 'Test Person',
      attributes: { v: 1 },
      source_refs: [{ kind: 'message', value: 'contact:ext-1' }],
    })
    expect(r1.ok).toBe(true)
    const r2 = upsertEntity({
      profile: 'fixture',
      actor: 'token:test',
      type: 'contact',
      external_id: 'ext-1',
      display_name: 'Test Person',
      attributes: { v: 2 },
      source_refs: [{ kind: 'message', value: 'contact:ext-1' }],
    })
    expect(r2.ok).toBe(true)
    if (r1.ok && r2.ok) expect(r1.id).toBe(r2.id) // same row
    const handle = openBrain('fixture')
    try {
      const row = handle.get<{ attributes: string }>(
        `SELECT attributes FROM entities WHERE external_id = ?`,
        'ext-1',
      )
      const parsed = JSON.parse(row!.attributes)
      expect(parsed.v).toBe(2)
    } finally {
      handle.close()
    }
  })

  it('insertObservation supports confidence labels', () => {
    const r = insertObservation({
      profile: 'fixture',
      actor: 'token:dsg',
      observer: 'DSG',
      subject_type: 'entity',
      subject_id: 'ent-1',
      observation: 'Service hours appear inconsistent across sources.',
      confidence_label: 'C-4',
      source_refs: [{ kind: 'wiki', value: 'knowledge/data/service-hours.md' }],
    })
    expect(r.ok).toBe(true)
  })

  it('insertOutput captures producer + metadata', () => {
    const r = insertOutput({
      profile: 'fixture',
      actor: 'token:caroline',
      producer_actor: 'agent:caroline',
      output_type: 'sms_reply',
      content: 'Thank you for reaching out. Our service team will be in touch.',
      metadata: { thread_id: 'thr-1', channel: 'sms' },
      source_refs: [
        { kind: 'thread', value: 'thr-1' },
        { kind: 'agent', value: 'caroline' },
      ],
    })
    expect(r.ok).toBe(true)
  })

  it('insertTransaction stores amount + currency', () => {
    const r = insertTransaction({
      profile: 'fixture',
      actor: 'token:billing',
      type: 'invoice_paid',
      amount_value: 250.0,
      amount_currency: 'USD',
      payload: { invoice_id: 'inv-100' },
      source_refs: [{ kind: 'external', value: 'invoice:inv-100' }],
    })
    expect(r.ok).toBe(true)
  })

  it('insertTask supports lifecycle status', () => {
    const r = insertTask({
      profile: 'fixture',
      actor: 'token:scheduler',
      status: 'open',
      description: 'Follow up with lead in 3 days',
      due_at: Date.now() + 3 * 24 * 60 * 60 * 1000,
      source_refs: [{ kind: 'thread', value: 'thr-99' }],
    })
    expect(r.ok).toBe(true)
  })

  it('insertRetrievalSnapshot does NOT require source_refs (refs ARE the source)', () => {
    const r = insertRetrievalSnapshot({
      profile: 'fixture',
      actor: 'token:caroline',
      decision_id: 'dec-1',
      query: 'service hours sunday',
      retrieved_refs: [
        { kind: 'wiki', value: 'knowledge/published/service-hours.md' },
        { kind: 'embed', value: 'embeddings:abc' },
      ],
      reasoning: 'Pulled the canonical hours page + a 2025 ops memo.',
    })
    expect(r.ok).toBe(true)
  })

  it('openReconciliation stores both wiki + brain refs and full lineage', () => {
    const r = openReconciliation({
      profile: 'fixture',
      actor: 'system:reconciliation',
      conflict_type: 'service_hours_mismatch',
      wiki_ref: 'canon/service-hours.md#L4',
      brain_ref: 'observations/obs-12',
      lineage: { wiki_value: '7:30-18:00', brain_value: '8:00-17:00' },
      proposed_resolution: 'Have ops manager confirm authoritative value.',
    })
    expect(r.ok).toBe(true)
  })

  it('recordAdjacentNeighbor classifies federated vs absorbed', () => {
    const r = recordAdjacentNeighbor({
      profile: 'fixture',
      actor: 'system:consultative',
      name: 'VinSolutions',
      source_type: 'crm',
      likelihood: 'high',
      classification: 'federated_externally',
      notes: 'Customer owns the CRM. Federate via MindsDB / MCP.',
    })
    expect(r.ok).toBe(true)
  })

  it('recordSuggestedKnowledgeChange opens an editable change record', () => {
    const r = recordSuggestedKnowledgeChange({
      profile: 'fixture',
      actor: 'token:dsg',
      proposer: 'DSG',
      target_wiki_path: 'knowledge/inbox/service-hours-correction.md',
      change_type: 'modify',
      diff: '- 8:00-17:00\n+ 7:30-18:00',
      rationale: 'Match operational reality observed across 30 days.',
      source_refs: [
        { kind: 'wiki', value: 'canon/service-hours.md' },
        { kind: 'embed', value: 'observations:agg-30d' },
      ],
    })
    expect(r.ok).toBe(true)
  })
})
