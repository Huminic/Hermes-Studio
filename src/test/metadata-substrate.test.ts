import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openBrain } from '@/server/brain-store'
import {
  recordAudit,
  listAuditByTarget,
  listAuditByActor,
  listStaleTargets,
  metadataSubstratePresent,
} from '@/server/metadata-substrate'

let tmpRoot: string

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'metadata-test-'))
  process.env.BRAIN_PROFILES_ROOT = path.join(tmpRoot, ".hermes", "profiles")
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

describe('metadata substrate (SRS A.5 — sixth wiki invariant)', () => {
  it('present check passes on a freshly-opened Brain', () => {
    const res = metadataSubstratePresent('fixture')
    expect(res.ok).toBe(true)
  })

  it('appends an audit row with full attribution', () => {
    const res = recordAudit('fixture', {
      ts: Date.now(),
      surface: 'wiki',
      actor: 'user:duane',
      actor_role: 'studio-admin',
      action: 'create',
      target_type: 'page',
      target_id: 'knowledge/inbox/foo.md',
      reason: 'initial draft',
      outcome: 'ok',
    })
    expect(res.id).toBeGreaterThan(0)
    expect(res.gate_event_id).toBeTruthy()
  })

  it('drift query: list every interaction for a target', () => {
    const t = { type: 'page', id: 'knowledge/drafts/escalation.md' }
    for (let i = 0; i < 3; i++) {
      recordAudit('fixture', {
        ts: 1000 + i * 100,
        surface: 'wiki',
        actor: 'user:duane',
        action: 'update',
        target_type: t.type,
        target_id: t.id,
        version_before: `v${i}`,
        version_after: `v${i + 1}`,
        outcome: 'ok',
      })
    }
    const rows = listAuditByTarget('fixture', t)
    expect(rows.length).toBe(3)
    expect(rows[0].version_before).toBe('v0')
    expect(rows[2].version_after).toBe('v3')
  })

  it('actor query: list every action by an actor in time window', () => {
    recordAudit('fixture', {
      ts: 100,
      surface: 'brain',
      actor: 'token:caroline-runtime',
      action: 'create',
      target_type: 'events',
      outcome: 'ok',
    })
    recordAudit('fixture', {
      ts: 200,
      surface: 'brain',
      actor: 'token:caroline-runtime',
      action: 'create',
      target_type: 'outputs',
      outcome: 'ok',
    })
    const rows = listAuditByActor('fixture', 'token:caroline-runtime', {
      since: 150,
    })
    expect(rows.length).toBe(1)
    expect(rows[0].target_type).toBe('outputs')
  })

  it('renewal cadence: list stale targets older than cutoff', () => {
    recordAudit('fixture', {
      ts: 100,
      surface: 'wiki',
      actor: 'system',
      action: 'create',
      target_type: 'page',
      target_id: 'knowledge/drafts/old.md',
      outcome: 'ok',
    })
    recordAudit('fixture', {
      ts: 10_000_000,
      surface: 'wiki',
      actor: 'system',
      action: 'create',
      target_type: 'page',
      target_id: 'knowledge/drafts/fresh.md',
      outcome: 'ok',
    })
    const stale = listStaleTargets('fixture', 5_000_000)
    expect(stale.length).toBe(1)
    expect(stale[0].target_id).toBe('knowledge/drafts/old.md')
  })

  it('records gate decisions when wired by DSG (smoke)', () => {
    // Direct call here; the DSG gate writes one of these per evaluation
    // and is exercised in dsg-gate.test.ts. This is the minimum verifier
    // that the substrate accepts the gate_decision action.
    recordAudit('fixture', {
      ts: Date.now(),
      surface: 'brain',
      actor: 'token:runtime',
      action: 'gate_decision',
      target_type: 'events',
      target_id: 'evt-1',
      reason: 'missing-source-reference: events writes MUST carry source_refs',
      outcome: 'denied',
      rule: 'missing-source-reference',
    })
    const rows = listAuditByTarget('fixture', { type: 'events', id: 'evt-1' })
    expect(rows.length).toBe(1)
    expect(rows[0].rule).toBe('missing-source-reference')
    expect(rows[0].outcome).toBe('denied')
  })
})
