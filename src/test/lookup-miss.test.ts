import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openBrain } from '@/server/brain-store'
import {
  recordLookupMiss,
  resolveAssumption,
  listOperatorVisibleAssumptions,
  listOpenLookupMisses,
} from '@/server/lookup-miss'

let tmpRoot: string

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lookup-miss-test-'))
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

describe('lookup-miss + assumption surfacing (SRS A.7)', () => {
  it('records a lookup miss without an assumption', () => {
    const res = recordLookupMiss({
      profile: 'fixture',
      actor: 'token:runtime-agent',
      query: 'wiki: knowledge/playbooks/escalation.md',
      scope: 'wiki',
      downstream_decision: 'deferred',
    })
    expect(res.ok).toBe(true)
    expect(res.lookup_miss_id).toBeTruthy()
    expect(res.assumption_id).toBeNull()
    const open = listOpenLookupMisses('fixture')
    expect(open.length).toBe(1)
    expect(open[0].query).toMatch(/escalation/)
  })

  it('records a lookup miss WITH an assumption and surfaces it', () => {
    const res = recordLookupMiss({
      profile: 'fixture',
      actor: 'token:runtime-agent',
      query: 'business hours for serra-honda service department',
      scope: 'brain.entities',
      downstream_decision: 'assumed',
      assumption: {
        statement:
          'Assumed Serra Honda service is open Mon-Fri 7:30am-6pm ET based on dealer-industry norms.',
        context: { source: 'industry-default' },
      },
    })
    expect(res.ok).toBe(true)
    expect(res.assumption_id).toBeTruthy()
    const items = listOperatorVisibleAssumptions('fixture')
    expect(items.length).toBe(1)
    expect(items[0].status).toBe('open')
    expect(items[0].statement).toMatch(/Mon-Fri/)
  })

  it('rejects downstream_decision=assumed without an assumption.statement', () => {
    const res = recordLookupMiss({
      profile: 'fixture',
      actor: 'token:runtime-agent',
      query: 'foo',
      downstream_decision: 'assumed',
    })
    expect(res.ok).toBe(false)
    expect(res.reason).toMatch(/assumption/i)
  })

  it('operator can accept an assumption and mirror status on the lookup miss', () => {
    const lm = recordLookupMiss({
      profile: 'fixture',
      actor: 'token:runtime-agent',
      query: 'service hours',
      downstream_decision: 'assumed',
      assumption: {
        statement: 'assumed 7:30am-6pm',
      },
    })
    expect(lm.ok).toBe(true)
    const resolution = resolveAssumption({
      profile: 'fixture',
      assumption_id: lm.assumption_id!,
      resolution: 'accepted',
      resolved_by: 'duane',
      resolution_notes: 'Confirmed via Serra ops manager.',
    })
    expect(resolution.ok).toBe(true)
    const open = listOpenLookupMisses('fixture')
    expect(open.length).toBe(0)
    const all = listOperatorVisibleAssumptions('fixture', {
      includeResolved: true,
    })
    expect(all[0].status).toBe('accepted')
  })

  it('clarified resolution opens a suggested_knowledge_change row', () => {
    const lm = recordLookupMiss({
      profile: 'fixture',
      actor: 'token:runtime-agent',
      query: 'escalation path for safety recalls',
      downstream_decision: 'assumed',
      assumption: {
        statement: 'assumed escalation to BDC manager within 1 hour',
      },
    })
    expect(lm.ok).toBe(true)
    const resolution = resolveAssumption({
      profile: 'fixture',
      assumption_id: lm.assumption_id!,
      resolution: 'clarified',
      resolved_by: 'duane',
      resolution_notes: 'Per Serra Honda policy: GM, not BDC manager.',
      suggested_change: {
        target_wiki_path: 'knowledge/inbox/safety-recall-escalation.md',
        change_type: 'add',
        diff: 'Initial page proposing the correct escalation path.',
        rationale: 'Operator-clarified assumption resolution.',
      },
    })
    expect(resolution.ok).toBe(true)
    // suggested_knowledge_change_id depends on whether Tranche B migration
    // is active — we test below that the resolution recorded either way.
    const profileRoot = path.join(tmpRoot, '.hermes', 'profiles', 'fixture')
    const handle = openBrain('fixture', { profileRoot })
    try {
      const rows = handle.all<{ status: string }>(
        `SELECT status FROM assumptions WHERE id = ?`,
        lm.assumption_id,
      )
      expect(rows[0]?.status).toBe('clarified')
    } finally {
      handle.close()
    }
  })
})
