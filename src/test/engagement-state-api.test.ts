import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parse as parseYaml } from 'yaml'

let tmpHome: string

const VALID_YAML = `
schema_version: 1
customer: huminic
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

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'es-api-test-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  const dir = path.join(tmpHome, '.hermes', 'profiles', 'huminic')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'engagement-state.yaml'), VALID_YAML)
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('/api/customer/engagement-state', () => {
  it('returns the parsed state', async () => {
    const { Route } = await import('@/routes/api/customer/engagement-state')
    const handler = Route.options.server.handlers.GET
    const req = new Request(
      'http://localhost/api/customer/engagement-state?profile=huminic',
    )
    const res = await handler({ request: req } as never)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; state: { current_stage: string } }
    expect(body.ok).toBe(true)
    expect(body.state.current_stage).toBe('draft')
  })

  it('advances stage on action: advance', async () => {
    const { Route } = await import('@/routes/api/customer/engagement-state')
    const handler = Route.options.server.handlers.POST
    const req = new Request('http://localhost/api/customer/engagement-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile: 'huminic',
        action: 'advance',
        to_stage: 'gathering_data',
      }),
    })
    const res = await handler({ request: req } as never)
    expect(res.status).toBe(200)
    const updated = fs.readFileSync(
      path.join(tmpHome, '.hermes/profiles/huminic/engagement-state.yaml'),
      'utf8',
    )
    const parsed = parseYaml(updated) as { current_stage: string; stage_history: Array<{ stage: string }> }
    expect(parsed.current_stage).toBe('gathering_data')
    expect(parsed.stage_history.at(-1)?.stage).toBe('gathering_data')
  })

  it('approves a readiness gate', async () => {
    const { Route } = await import('@/routes/api/customer/engagement-state')
    const handler = Route.options.server.handlers.POST
    const req = new Request('http://localhost/api/customer/engagement-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile: 'huminic',
        action: 'approve_gate',
        gate: 'ready_to_blueprint',
        approver: 'duane',
        notes: 'design verified',
      }),
    })
    const res = await handler({ request: req } as never)
    expect(res.status).toBe(200)
    const updated = fs.readFileSync(
      path.join(tmpHome, '.hermes/profiles/huminic/engagement-state.yaml'),
      'utf8',
    )
    const parsed = parseYaml(updated) as { readiness_gates: { ready_to_blueprint: { status: string; approved_by: string } } }
    expect(parsed.readiness_gates.ready_to_blueprint.status).toBe('approved')
    expect(parsed.readiness_gates.ready_to_blueprint.approved_by).toBe('duane')
  })

  it('rejects an unknown gate', async () => {
    const { Route } = await import('@/routes/api/customer/engagement-state')
    const handler = Route.options.server.handlers.POST
    const req = new Request('http://localhost/api/customer/engagement-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile: 'huminic',
        action: 'approve_gate',
        gate: 'fake_gate',
      }),
    })
    const res = await handler({ request: req } as never)
    expect(res.status).toBe(400)
  })
})
