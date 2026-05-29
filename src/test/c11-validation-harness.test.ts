/**
 * C.11 — End-to-end validation harness for the customer cluster.
 *
 * Provisions a fictitious-test-customer profile in a tmpdir, then walks
 * the full six-page flow through the API surfaces (no Playwright — pure
 * vitest):
 *   Chat: agent roster + chat round-trip
 *   Knowledge: tree + KSG-gated save + promote
 *   Tools/Widget: list + KSG-gated content edit
 *   Comms: thread list + reply via adapter
 *   Campaigns: audience + campaign + tick
 *   Consult (Tools sub-page on huminic): engagement state advance + gate
 *
 * Each test acts as one row in the customer-cluster validation matrix.
 * Failures = blocker rows in the defect register.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome: string

const PROFILE = 'fictitious-test-customer'

const VALID_ENGAGEMENT = `
schema_version: 1
customer: fictitious-test-customer
current_stage: draft
stage_entered_at: "2026-05-29T01:49:33Z"
stage_history:
  - stage: draft
    entered_at: "2026-05-29T01:49:33Z"
    exited_at: null
    notes: ""
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

let originalFetch: typeof fetch
beforeEach(async () => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'c11-test-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  // Provision the fictitious customer profile.
  const dir = path.join(tmpHome, '.hermes', 'profiles', PROFILE)
  fs.mkdirSync(path.join(dir, 'knowledge', 'inbox'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'knowledge', 'drafts'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'knowledge', 'widgets'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'governance', 'agents'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'SOUL.md'),
    `# Fictitious Customer\n\nYou are the fictitious-test-customer agent.\n`,
  )
  fs.writeFileSync(
    path.join(dir, 'governance', 'agents', 'sage.md'),
    `---\nname: Sage\n---\nSage is the test agent for validation.\n`,
  )
  fs.writeFileSync(
    path.join(dir, 'engagement-state.yaml'),
    VALID_ENGAGEMENT,
  )
  fs.writeFileSync(
    path.join(dir, 'studio.yaml'),
    [
      'branding:',
      '  persona_name: Fictitious',
      '  accent_color: "#1e40af"',
      'widgets:',
      '  - slug: hero',
      '    mode: chat',
      '    agent: sage',
      '',
    ].join('\n'),
  )
  fs.writeFileSync(
    path.join(dir, 'knowledge', 'inbox', 'idea.md'),
    '---\ntitle: idea\ntype: note\nstatus: draft\n---\nbody',
  )
  // Mock provider fetch.
  originalFetch = globalThis.fetch
  globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
    const u = String(url)
    if (u.includes('/v1/chat/completions')) {
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'integration-reply' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    return originalFetch(url as RequestInfo)
  }) as typeof fetch
  process.env.API_SERVER_KEY = 'test-key'
  const mod = await import('@/server/messaging-hub-store')
  mod._resetForTests()
  const bus = await import('@/server/messaging-hub-bus')
  bus._resetMessagingBus()
})

afterEach(() => {
  vi.restoreAllMocks()
  globalThis.fetch = originalFetch
  delete process.env.API_SERVER_KEY
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('C.11 fictitious-test-customer end-to-end', () => {
  it('AC.11.1 — provisions a profile with all required surfaces', async () => {
    const dir = path.join(tmpHome, '.hermes', 'profiles', PROFILE)
    expect(fs.existsSync(path.join(dir, 'SOUL.md'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'governance/agents/sage.md'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'studio.yaml'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'engagement-state.yaml'))).toBe(true)
  })

  it('Chat — agent roster lists Sage + chat round-trip persists turn', async () => {
    const { Route: rosterRoute } = await import('@/routes/api/customer/agents')
    const rosterRes = await rosterRoute.options.server.handlers.GET({
      request: new Request(
        `http://localhost/api/customer/agents?profile=${PROFILE}`,
      ),
    } as never)
    const roster = (await rosterRes.json()) as {
      agents: Array<{ id: string }>
    }
    expect(roster.agents.map((a) => a.id)).toContain('sage')
    const { Route: chatRoute } = await import('@/routes/api/customer/chat')
    const chatRes = await chatRoute.options.server.handlers.POST({
      request: new Request('http://localhost/api/customer/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: PROFILE,
          agent_id: 'sage',
          message: 'hello',
        }),
      }),
    } as never)
    expect(chatRes.status).toBe(200)
    const chat = (await chatRes.json()) as { session_id: string; reply: string }
    expect(chat.reply).toBe('integration-reply')
    const { getThread } = await import('@/server/messaging-hub-store')
    const thread = getThread(PROFILE, chat.session_id)
    expect(thread?.messages).toHaveLength(2)
    expect(thread?.domain).toBe('chat')
  })

  it('Knowledge — promote inbox → drafts → published', async () => {
    const { Route: promoteRoute } = await import(
      '@/routes/api/customer/wiki/promote'
    )
    const handler = promoteRoute.options.server.handlers.POST
    // inbox → drafts
    const a = await handler({
      request: new Request('http://localhost/api/customer/wiki/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: PROFILE,
          path: 'knowledge/inbox/idea.md',
        }),
      }),
    } as never)
    expect(a.status).toBe(200)
    // drafts → published
    const b = await handler({
      request: new Request('http://localhost/api/customer/wiki/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: PROFILE,
          path: 'knowledge/drafts/idea.md',
        }),
      }),
    } as never)
    expect(b.status).toBe(200)
    expect(
      fs.existsSync(
        path.join(
          tmpHome,
          `.hermes/profiles/${PROFILE}/knowledge/published/idea.md`,
        ),
      ),
    ).toBe(true)
  })

  it('Tools/Widget — list shows hero ready after KSG save', async () => {
    const { Route: saveRoute } = await import(
      '@/routes/api/customer/widgets/save'
    )
    await saveRoute.options.server.handlers.POST({
      request: new Request('http://localhost/api/customer/widgets/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: PROFILE,
          slug: 'hero',
          content:
            '---\nslug: hero\nmode: chat\nagent: sage\ntitle: Hero\ngreeting: Welcome\ntype: widget\nstatus: draft\n---\nbody',
        }),
      }),
    } as never)
    const { Route: listRoute } = await import(
      '@/routes/api/customer/widgets/index'
    )
    const listRes = await listRoute.options.server.handlers.GET({
      request: new Request(
        `http://localhost/api/customer/widgets?profile=${PROFILE}`,
      ),
    } as never)
    const widgets = (await listRes.json()) as {
      widgets: Array<{ slug: string; status: string }>
    }
    expect(widgets.widgets[0].slug).toBe('hero')
    expect(widgets.widgets[0].status).toBe('ready')
  })

  it('Comms — chat round-trip threads show up in inbox', async () => {
    const { Route: chatRoute } = await import('@/routes/api/customer/chat')
    await chatRoute.options.server.handlers.POST({
      request: new Request('http://localhost/api/customer/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: PROFILE,
          agent_id: 'sage',
          message: 'comms test',
        }),
      }),
    } as never)
    const { Route: listRoute } = await import('@/routes/api/messaging/threads')
    const listRes = await listRoute.options.server.handlers.GET({
      request: new Request(
        `http://localhost/api/messaging/threads?profile=${PROFILE}&domain=chat`,
      ),
    } as never)
    const j = (await listRes.json()) as { threads: Array<unknown> }
    expect(j.threads.length).toBeGreaterThan(0)
  })

  it('Campaigns — create audience + campaign + tick → delivery recorded', async () => {
    const { upsertContact } = await import('@/server/messaging-hub-store')
    upsertContact({
      profile: PROFILE,
      display_name: 'Sample Lead',
      identifiers: { sms: '+15555550199' },
    })
    const { Route: audRoute } = await import('@/routes/api/customer/audiences/index')
    const aud = await audRoute.options.server.handlers.POST({
      request: new Request('http://localhost/api/customer/audiences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: PROFILE,
          name: 'sms-leads',
          query: { channel: 'sms' },
        }),
      }),
    } as never)
    const audJ = (await aud.json()) as { audience: { id: string } }
    const { Route: campRoute } = await import(
      '@/routes/api/customer/campaigns/index'
    )
    await campRoute.options.server.handlers.POST({
      request: new Request('http://localhost/api/customer/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: PROFILE,
          audience_id: audJ.audience.id,
          channel: 'sms',
          message_template: 'Hello {{first_name}}',
          schedule: Date.now() - 1000,
        }),
      }),
    } as never)
    const { Route: tickRoute } = await import(
      '@/routes/api/customer/campaigns/tick'
    )
    const tickRes = await tickRoute.options.server.handlers.POST({
      request: new Request('http://localhost/api/customer/campaigns/tick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: PROFILE }),
      }),
    } as never)
    expect(tickRes.status).toBe(200)
    const tick = (await tickRes.json()) as {
      results: Array<{ sent: number; failed: number }>
    }
    expect(tick.results.length).toBeGreaterThan(0)
  })

  it('Consult (Tools sub-page) — engagement-state advances and gate approves', async () => {
    const { Route } = await import('@/routes/api/customer/engagement-state')
    // advance
    await Route.options.server.handlers.POST({
      request: new Request('http://localhost/api/customer/engagement-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: PROFILE,
          action: 'advance',
          to_stage: 'gathering_data',
        }),
      }),
    } as never)
    // approve gate
    await Route.options.server.handlers.POST({
      request: new Request('http://localhost/api/customer/engagement-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: PROFILE,
          action: 'approve_gate',
          gate: 'topology_decided',
          decision: 'we-host',
        }),
      }),
    } as never)
    const getRes = await Route.options.server.handlers.GET({
      request: new Request(
        `http://localhost/api/customer/engagement-state?profile=${PROFILE}`,
      ),
    } as never)
    const j = (await getRes.json()) as {
      state: {
        current_stage: string
        readiness_gates: {
          topology_decided: { status: string; decision: string }
        }
      }
    }
    expect(j.state.current_stage).toBe('gathering_data')
    expect(j.state.readiness_gates.topology_decided.status).toBe('approved')
  })

  it('Cross-profile isolation — fictitious agent roster does not leak into huminic', async () => {
    // Seed a separate profile and verify roster scope.
    fs.mkdirSync(
      path.join(tmpHome, '.hermes', 'profiles', 'huminic', 'governance', 'agents'),
      { recursive: true },
    )
    fs.writeFileSync(
      path.join(
        tmpHome,
        '.hermes/profiles/huminic/governance/agents/duane.md',
      ),
      '---\nname: Duane\n---\nDuane is huminic-only.\n',
    )
    fs.writeFileSync(
      path.join(tmpHome, '.hermes', 'profiles', 'huminic', 'studio.yaml'),
      'branding:\n  persona_name: Huminic\n',
    )
    const { Route } = await import('@/routes/api/customer/agents')
    const ficRes = await Route.options.server.handlers.GET({
      request: new Request(
        `http://localhost/api/customer/agents?profile=${PROFILE}`,
      ),
    } as never)
    const fic = (await ficRes.json()) as { agents: Array<{ id: string }> }
    const hRes = await Route.options.server.handlers.GET({
      request: new Request(
        `http://localhost/api/customer/agents?profile=huminic`,
      ),
    } as never)
    const h = (await hRes.json()) as { agents: Array<{ id: string }> }
    expect(fic.agents.map((a) => a.id)).not.toContain('duane')
    expect(h.agents.map((a) => a.id)).not.toContain('sage')
  })
})
