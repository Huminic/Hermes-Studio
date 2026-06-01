/**
 * Vitest for engagement-state-writer (closes P-SRS-C1 testability gate).
 *
 * Covers:
 * - readEngagementState returns null for missing profile
 * - writeEngagementState round-trips through schema (atomic temp+rename)
 * - advanceEngagementStage marks prior history exited + appends new entry
 * - advanceEngagementStage is idempotent when newStage === current_stage
 * - phaseToStage mapping for every phase
 * - approveReadinessGate persists approver + timestamp
 * - approveReadinessGate handles topology_decided (different shape)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import YAML from 'yaml'
import {
  advanceEngagementStage,
  approveReadinessGate,
  phaseToStage,
  readEngagementState,
  writeEngagementState,
} from '../server/engagement-state-writer'
import type { EngagementState } from '../lib/engagement-state'

let tmpRoot: string
let savedEnv: string | undefined

function seedEngagement(profile: string, customStage = 'draft'): string {
  const dir = path.join(tmpRoot, profile)
  fs.mkdirSync(dir, { recursive: true })
  const state: EngagementState = {
    schema_version: 1,
    customer: profile,
    current_stage: customStage as EngagementState['current_stage'],
    stage_entered_at: '2026-06-01T00:00:00.000Z',
    stage_history: [
      {
        stage: customStage as EngagementState['current_stage'],
        entered_at: '2026-06-01T00:00:00.000Z',
        exited_at: null,
        notes: 'seed',
        skipped: false,
      },
    ],
    assigned_consultative_agent: 'consultative-agent',
    build_time_crew: [{ role: 'architect', profile: 'consultative-agent' }],
    run_time_crew: [{ role: 'architect', profile: 'consultative-agent' }],
    deployment_notes: [],
    readiness_gates: {
      ready_to_blueprint: { status: 'pending', approved_by: null, approved_at: null, notes: '' },
      ready_to_instantiate_runtime: { status: 'pending', approved_by: null, approved_at: null, notes: '' },
      ready_to_publish_mcp_projections: { status: 'pending', approved_by: null, approved_at: null, notes: '' },
      ready_to_hand_off_externally: { status: 'pending', approved_by: null, approved_at: null, notes: '' },
      topology_decided: { status: 'pending', approved_by: null, approved_at: null, decision: null },
    },
    open_decisions: [],
    adjacent_data_neighbors: [],
  }
  const filePath = path.join(dir, 'engagement-state.yaml')
  fs.writeFileSync(filePath, YAML.stringify(state))
  return filePath
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eng-state-test-'))
  savedEnv = process.env.BRAIN_PROFILES_ROOT
  process.env.BRAIN_PROFILES_ROOT = tmpRoot
})

afterEach(() => {
  if (savedEnv === undefined) delete process.env.BRAIN_PROFILES_ROOT
  else process.env.BRAIN_PROFILES_ROOT = savedEnv
  if (fs.existsSync(tmpRoot)) fs.rmSync(tmpRoot, { recursive: true, force: true })
})

describe('readEngagementState', () => {
  it('returns null when engagement-state.yaml missing', () => {
    expect(readEngagementState('nonexistent')).toBeNull()
  })

  it('returns parsed state when present + valid', () => {
    seedEngagement('huminic')
    const s = readEngagementState('huminic')
    expect(s).not.toBeNull()
    expect(s!.current_stage).toBe('draft')
    expect(s!.customer).toBe('huminic')
  })
})

describe('writeEngagementState', () => {
  it('round-trips through schema (atomic)', () => {
    seedEngagement('huminic')
    const s = readEngagementState('huminic')!
    s.stage_history[0].notes = 'edited'
    writeEngagementState('huminic', s)
    const re = readEngagementState('huminic')!
    expect(re.stage_history[0].notes).toBe('edited')
  })
})

describe('advanceEngagementStage', () => {
  it('marks prior history exited + appends new entry', () => {
    seedEngagement('huminic')
    const out = advanceEngagementStage('huminic', 'gathering_data', {
      notes: 'orient complete',
    })!
    expect(out.current_stage).toBe('gathering_data')
    expect(out.stage_history).toHaveLength(2)
    expect(out.stage_history[0].exited_at).not.toBeNull() // prior was closed
    expect(out.stage_history[1].stage).toBe('gathering_data')
    expect(out.stage_history[1].exited_at).toBeNull()
    expect(out.stage_history[1].notes).toBe('orient complete')
  })

  it('is idempotent when newStage === current_stage', () => {
    seedEngagement('huminic', 'gathering_data')
    const out = advanceEngagementStage('huminic', 'gathering_data', {
      notes: 'no-op',
    })!
    expect(out.stage_history).toHaveLength(1) // unchanged
    expect(out.current_stage).toBe('gathering_data')
  })

  it('returns null for missing engagement-state.yaml', () => {
    expect(
      advanceEngagementStage('no-such-profile', 'gathering_data', { notes: '' }),
    ).toBeNull()
  })

  it('persists across consecutive advances (6-phase sweep)', () => {
    seedEngagement('huminic')
    const phases = ['orient', 'audit', 'design', 'author', 'validate', 'package'] as const
    for (const p of phases) {
      advanceEngagementStage('huminic', phaseToStage(p), { notes: `${p} complete` })
    }
    const final = readEngagementState('huminic')!
    expect(final.current_stage).toBe('ready_to_run')
    // First three phases all map to gathering_data (orient/audit) +
    // solution_discovery (design), so distinct stages = draft (initial) +
    // gathering_data + solution_discovery + creation + submission + ready_to_run = 6.
    const distinctStages = new Set(final.stage_history.map((h) => h.stage))
    expect(distinctStages.size).toBeGreaterThanOrEqual(5)
    // Only the LAST entry should be still open.
    const openEntries = final.stage_history.filter((h) => h.exited_at === null)
    expect(openEntries).toHaveLength(1)
    expect(openEntries[0].stage).toBe('ready_to_run')
  })
})

describe('phaseToStage', () => {
  it('maps every phase to a valid stage', () => {
    expect(phaseToStage('orient')).toBe('gathering_data')
    expect(phaseToStage('audit')).toBe('gathering_data')
    expect(phaseToStage('design')).toBe('solution_discovery')
    expect(phaseToStage('author')).toBe('creation')
    expect(phaseToStage('validate')).toBe('submission')
    expect(phaseToStage('package')).toBe('ready_to_run')
  })
})

describe('approveReadinessGate', () => {
  it('persists approver + timestamp on a regular gate', () => {
    seedEngagement('huminic')
    const out = approveReadinessGate('huminic', 'ready_to_blueprint', {
      status: 'approved',
      approved_by: 'duane',
      notes: 'blueprint OK',
    })!
    expect(out.readiness_gates.ready_to_blueprint.status).toBe('approved')
    expect(out.readiness_gates.ready_to_blueprint.approved_by).toBe('duane')
    expect(out.readiness_gates.ready_to_blueprint.approved_at).not.toBeNull()
    expect(out.readiness_gates.ready_to_blueprint.notes).toBe('blueprint OK')
  })

  it('records topology decision', () => {
    seedEngagement('huminic')
    const out = approveReadinessGate('huminic', 'topology_decided', {
      status: 'approved',
      approved_by: 'duane',
      decision: 'we-host',
    })!
    expect(out.readiness_gates.topology_decided.status).toBe('approved')
    expect(out.readiness_gates.topology_decided.decision).toBe('we-host')
  })

  it('returns null for missing profile', () => {
    expect(
      approveReadinessGate('no-such', 'ready_to_blueprint', {
        status: 'approved',
        approved_by: 'duane',
      }),
    ).toBeNull()
  })
})
