import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const VALID_YAML = `
schema_version: 1
customer: __NAME__
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
    profile: __NAME__-data-governor
  - role: data-semantic-guardian
    profile: __NAME__-data-governor
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

let tmpHome: string

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'engagements-test-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

function seedProfile(name: string, withState: boolean, broken = false) {
  const dir = path.join(tmpHome, '.hermes', 'profiles', name)
  fs.mkdirSync(dir, { recursive: true })
  if (withState) {
    const text = broken
      ? '---\nnot: valid: yaml: structure'
      : VALID_YAML.replace(/__NAME__/g, name)
    fs.writeFileSync(path.join(dir, 'engagement-state.yaml'), text)
  }
}

describe('listEngagements', () => {
  it('returns an empty list when no profiles have engagement-state.yaml', async () => {
    fs.mkdirSync(path.join(tmpHome, '.hermes', 'profiles', 'consultative-agent'), {
      recursive: true,
    })
    const { listEngagements } = await import('@/server/engagements')
    const result = listEngagements()
    expect(result.customers).toEqual([])
  })

  it('returns engagement entries sorted by customer name', async () => {
    seedProfile('strukture', true)
    seedProfile('huminic', true)
    seedProfile('serra-automotive', true)
    seedProfile('consultative-agent', false) // no state file → omitted
    seedProfile('huminic-data-governor', false)

    const { listEngagements } = await import('@/server/engagements')
    const result = listEngagements()
    expect(result.customers.map((c) => c.customer)).toEqual([
      'huminic',
      'serra-automotive',
      'strukture',
    ])
    expect(result.customers[0].state?.current_stage).toBe('draft')
  })

  it('records parseErrors for malformed engagement-state.yaml', async () => {
    seedProfile('broken-customer', true, true)
    const { listEngagements } = await import('@/server/engagements')
    const result = listEngagements()
    expect(result.customers).toHaveLength(1)
    expect(result.customers[0].state).toBeUndefined()
    expect(result.customers[0].parseErrors?.length ?? 0).toBeGreaterThan(0)
  })

  it('returns empty when the profiles root does not exist', async () => {
    const { listEngagements } = await import('@/server/engagements')
    const result = listEngagements()
    expect(result.customers).toEqual([])
  })
})
