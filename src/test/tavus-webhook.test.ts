import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome: string
let originalFetch: typeof fetch

beforeEach(async () => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tavus-webhook-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  const dir = path.join(tmpHome, '.hermes', 'profiles', 'serra-honda')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'studio.yaml'),
    [
      'branding:',
      '  persona_name: Serra Honda',
      'lead_notifications:',
      '  adf_email: leads@example.com',
      'notifications:',
      '  lead_format: email',
      '  lead_recipient: leads@example.com',
      '',
    ].join('\n'),
  )
  originalFetch = globalThis.fetch
  globalThis.fetch = vi.fn(async () => {
    return new Response(
      `event: message\ndata: {"result":{"content":[{"text":"{\\"id\\":\\"resend_mock_id\\"}"}]}}\n\n`,
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    )
  }) as typeof fetch
  process.env.CENTRAL_MCP_TOKEN = 'mock-token'
  const mod = await import('@/server/messaging-hub-store')
  mod._resetForTests()
  const bus = await import('@/server/messaging-hub-bus')
  bus._resetMessagingBus()
})

afterEach(() => {
  vi.restoreAllMocks()
  globalThis.fetch = originalFetch
  delete process.env.CENTRAL_MCP_TOKEN
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('/api/webhooks/tavus/$profile', () => {
  it('records a Tavus conversation as an inbound video thread + emits notification (same profile/agent path)', async () => {
    const { Route } = await import('@/routes/api/webhooks/tavus.$profile')
    const handler = Route.options.server.handlers.POST
    const req = new Request('http://localhost/api/webhooks/tavus/serra-honda', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'application.transcription_ready',
        conversation_id: 'tavus_conv_abc123',
        properties: {
          summary: 'Visitor asked about a 2026 CR-V test drive.',
          transcript: [
            { role: 'user', content: 'Can I test drive a CR-V?' },
            { role: 'assistant', content: 'Absolutely, when works for you?' },
          ],
          customer_name: 'Elliott Test',
          customer_phone: '+15555550100',
          persona_id: 'p-nancy',
          recording_url: 'https://tavus.example/rec/abc',
        },
      }),
    })
    const res = await handler({
      request: req,
      params: { profile: 'serra-honda' },
    } as never)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      ok: boolean
      thread_id: string
      notification: { ok: boolean; via: string }
    }
    expect(body.ok).toBe(true)
    expect(body.notification.ok).toBe(true)
    const { getThread } = await import('@/server/messaging-hub-store')
    const thread = getThread('serra-honda', body.thread_id)
    expect(thread?.channel).toBe('video')
    expect(thread?.domain).toBe('sales')
    expect(thread?.messages.length).toBeGreaterThanOrEqual(2)
    expect(thread!.messages[0].content).toContain('CR-V')
  })

  it('does NOT notify the dealer for an empty video session (P2-8)', async () => {
    const { Route } = await import('@/routes/api/webhooks/tavus.$profile')
    const handler = Route.options.server.handlers.POST
    const req = new Request('http://localhost/api/webhooks/tavus/serra-honda', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'conversation.ended',
        conversation_id: 'tavus_conv_empty',
        // No transcript and no summary → an empty session that must NOT fire a
        // phantom "New AI video lead" to the BDC.
        properties: { customer_name: 'Ghost Visitor' },
      }),
    })
    const res = await handler({
      request: req,
      params: { profile: 'serra-honda' },
    } as never)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      ok: boolean
      thread_id: string
      notification: unknown
    }
    expect(body.ok).toBe(true)
    expect(body.notification).toBeNull() // P2-8: no dealer notification for empty session
    const { getThread } = await import('@/server/messaging-hub-store')
    const thread = getThread('serra-honda', body.thread_id)
    const sysNote = thread?.messages.find((m) => m.role === 'system')
    expect(sysNote?.content).toMatch(/empty video session/i)
  })

  it('strips injected system/context turns from the stored transcript (PFF-007)', async () => {
    const { Route } = await import('@/routes/api/webhooks/tavus.$profile')
    const handler = Route.options.server.handlers.POST
    // No `summary` → content falls back to the serialized transcript. The
    // transcript opens with a `system` turn carrying the persona system
    // prompt; it must NOT reach the stored message / dealer preview.
    const req = new Request('http://localhost/api/webhooks/tavus/serra-honda', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'application.transcription_ready',
        conversation_id: 'tavus_conv_sys',
        properties: {
          transcript: [
            { role: 'system', content: 'Core Identity & Mission: You are…' },
            { role: 'user', content: 'Do you have a CR-V in stock?' },
            { role: 'assistant', content: 'Yes — want to come test drive it?' },
          ],
          customer_name: 'Sysleak Test',
          customer_phone: '+15555550111',
        },
      }),
    })
    const res = await handler({
      request: req,
      params: { profile: 'serra-honda' },
    } as never)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; thread_id: string }
    const { getThread } = await import('@/server/messaging-hub-store')
    const thread = getThread('serra-honda', body.thread_id)
    const inbound = thread?.messages.find((m) => m.direction === 'inbound')
    expect(inbound?.content).toContain('CR-V')
    expect(inbound?.content).not.toContain('Core Identity')
    expect(inbound?.content).not.toMatch(/system:/i)
  })

  it('ignores non-terminal Tavus lifecycle events with 200', async () => {
    const { Route } = await import('@/routes/api/webhooks/tavus.$profile')
    const handler = Route.options.server.handlers.POST
    const req = new Request('http://localhost/api/webhooks/tavus/serra-honda', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'system.replica_joined',
        conversation_id: 'tavus_x',
      }),
    })
    const res = await handler({
      request: req,
      params: { profile: 'serra-honda' },
    } as never)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ignored?: boolean }
    expect(body.ignored).toBe(true)
  })

  it('rejects a bad shared secret with 401', async () => {
    fs.writeFileSync(
      path.join(tmpHome, '.hermes/profiles/serra-honda/.env'),
      'TAVUS_WEBHOOK_SECRET=topsecret\n',
    )
    const { Route } = await import('@/routes/api/webhooks/tavus.$profile')
    const handler = Route.options.server.handlers.POST
    const req = new Request('http://localhost/api/webhooks/tavus/serra-honda', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'conversation.ended',
        properties: { summary: 'x' },
      }),
    })
    const res = await handler({
      request: req,
      params: { profile: 'serra-honda' },
    } as never)
    expect(res.status).toBe(401)
  })
})
