import { describe, it, expect } from 'vitest'
import {
  parseEngagementState,
  nextOpenDeploymentNote,
  gateProgress,
  stageIndex,
  ENGAGEMENT_STAGES,
} from '@/lib/engagement-state'

const VALID_YAML = `
schema_version: 1
customer: strukture
current_stage: draft
stage_entered_at: "2026-05-29T01:49:33Z"
stage_history:
  - stage: draft
    entered_at: "2026-05-29T01:49:33Z"
    exited_at: null
    notes: "seeded"
    skipped: false
assigned_consultative_agent: consultative-agent
build_time_crew:
  - role: architect
    profile: consultative-agent
run_time_crew:
  - role: architect
    profile: consultative-agent
  - role: knowledge-semantic-guardian
    profile: strukture-data-governor
  - role: data-semantic-guardian
    profile: strukture-data-governor
deployment_notes: []
readiness_gates:
  ready_to_blueprint:
    status: pending
    approved_by: null
    approved_at: null
    notes: ""
  ready_to_instantiate_runtime:
    status: pending
    approved_by: null
    approved_at: null
    notes: ""
  ready_to_publish_mcp_projections:
    status: pending
    approved_by: null
    approved_at: null
    notes: ""
  ready_to_hand_off_externally:
    status: pending
    approved_by: null
    approved_at: null
    notes: ""
  topology_decided:
    status: pending
    approved_by: null
    approved_at: null
    decision: null
open_decisions: []
adjacent_data_neighbors: []
`

describe('parseEngagementState', () => {
  it('parses a valid engagement-state YAML', () => {
    const result = parseEngagementState(VALID_YAML)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.state.customer).toBe('strukture')
      expect(result.state.current_stage).toBe('draft')
      expect(result.state.run_time_crew).toHaveLength(3)
    }
  })

  it('rejects invalid YAML', () => {
    const result = parseEngagementState('not: valid: yaml: structure')
    expect(result.ok).toBe(false)
  })

  it('rejects an unknown current_stage', () => {
    const broken = VALID_YAML.replace('current_stage: draft', 'current_stage: not-a-stage')
    const result = parseEngagementState(broken)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.join(' ')).toMatch(/current_stage/)
    }
  })

  it('rejects a missing readiness gate', () => {
    const broken = VALID_YAML.replace(
      /ready_to_blueprint:[\s\S]*?notes: ""\n/,
      '',
    )
    const result = parseEngagementState(broken)
    expect(result.ok).toBe(false)
  })

  it('rejects a wrong schema_version', () => {
    const broken = VALID_YAML.replace('schema_version: 1', 'schema_version: 2')
    const result = parseEngagementState(broken)
    expect(result.ok).toBe(false)
  })
})

describe('helpers', () => {
  it('returns null for nextOpenDeploymentNote when deployment_notes is empty', () => {
    const result = parseEngagementState(VALID_YAML)
    if (!result.ok) throw new Error('seed YAML must parse')
    expect(nextOpenDeploymentNote(result.state)).toBeNull()
  })

  it('counts gate progress correctly when all pending', () => {
    const result = parseEngagementState(VALID_YAML)
    if (!result.ok) throw new Error('seed YAML must parse')
    const p = gateProgress(result.state)
    expect(p.total).toBe(5)
    expect(p.pending).toBe(5)
    expect(p.approved).toBe(0)
    expect(p.rejected).toBe(0)
  })

  it('returns 0 for stageIndex when current_stage is draft', () => {
    const result = parseEngagementState(VALID_YAML)
    if (!result.ok) throw new Error('seed YAML must parse')
    expect(stageIndex(result.state)).toBe(0)
    expect(ENGAGEMENT_STAGES[stageIndex(result.state)]).toBe('draft')
  })

  it('returns the first unresolved deployment note', () => {
    const withNote = VALID_YAML.replace(
      'deployment_notes: []',
      `deployment_notes:
  - area: "Vapi voice routing"
    status: unknown
    impact_if_missing: "Cannot route inbound calls"
    surfaced_at: "2026-05-29T02:00:00Z"
    resolved_at: null
  - area: "Resolved item"
    status: confirmed
    impact_if_missing: "none"
    surfaced_at: "2026-05-29T02:00:00Z"
    resolved_at: "2026-05-29T03:00:00Z"`,
    )
    const result = parseEngagementState(withNote)
    if (!result.ok) throw new Error('mod YAML must parse: ' + result.errors.join(', '))
    const next = nextOpenDeploymentNote(result.state)
    expect(next?.area).toBe('Vapi voice routing')
  })

  it('counts approved/rejected/pending mix correctly', () => {
    const mixed = VALID_YAML
      .replace(
        /ready_to_blueprint:\n    status: pending\n    approved_by: null\n    approved_at: null\n    notes: ""/,
        'ready_to_blueprint:\n    status: approved\n    approved_by: operator\n    approved_at: "2026-05-29T03:00:00Z"\n    notes: "ok"',
      )
      .replace(
        /ready_to_instantiate_runtime:\n    status: pending\n    approved_by: null\n    approved_at: null\n    notes: ""/,
        'ready_to_instantiate_runtime:\n    status: rejected\n    approved_by: operator\n    approved_at: "2026-05-29T03:30:00Z"\n    notes: "missing data"',
      )
    const result = parseEngagementState(mixed)
    if (!result.ok) throw new Error('mod YAML must parse: ' + result.errors.join(', '))
    const p = gateProgress(result.state)
    expect(p.approved).toBe(1)
    expect(p.rejected).toBe(1)
    expect(p.pending).toBe(3)
  })
})
