import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome: string
let originalFetch: typeof fetch

beforeEach(async () => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'webhook-test-'))
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

describe('/api/webhooks/vapi/$profile', () => {
  it('records a Vapi end-of-call event as an inbound voice thread and emits a lead notification', async () => {
    const { Route } = await import(
      '@/routes/api/webhooks/vapi.$profile'
    )
    const handler = Route.options.server.handlers.POST
    const req = new Request(
      'http://localhost/api/webhooks/vapi/serra-honda',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            type: 'end-of-call-report',
            transcript: 'Caller asked about Civic availability.',
            summary: 'Caller is interested in 2026 Civic.',
            call: {
              id: 'vapi_call_abc',
              assistantId: 'c303d993-bf42-4784-a8cb-247477b1cbdd',
              customer: { number: '+15555550100', name: 'Elliott Test' },
              phoneNumber: { number: '+19012038267' },
              startedAt: '2026-05-30T16:00:00Z',
              endedAt: '2026-05-30T16:01:30Z',
            },
          },
        }),
      },
    )
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
    expect(body.notification.via).toBe('resend')
    const { getThread } = await import('@/server/messaging-hub-store')
    const thread = getThread('serra-honda', body.thread_id)
    expect(thread?.channel).toBe('voice')
    expect(thread?.domain).toBe('sales')
    expect(thread?.messages.length).toBeGreaterThanOrEqual(2)
    const inbound = thread!.messages[0]
    expect(inbound.content).toContain('Civic')
  })

  it('ignores non-terminal Vapi events with 200', async () => {
    const { Route } = await import('@/routes/api/webhooks/vapi.$profile')
    const handler = Route.options.server.handlers.POST
    const req = new Request(
      'http://localhost/api/webhooks/vapi/serra-honda',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: { type: 'speech-update', call: { id: 'vapi_x' } },
        }),
      },
    )
    const res = await handler({
      request: req,
      params: { profile: 'serra-honda' },
    } as never)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ignored: boolean }
    expect(body.ignored).toBe(true)
  })

  it('returns notification:unconfigured when adf_email is missing', async () => {
    // Replace the studio.yaml with one that has no lead_notifications.
    fs.writeFileSync(
      path.join(tmpHome, '.hermes/profiles/serra-honda/studio.yaml'),
      'branding:\n  persona_name: Serra Honda\n',
    )
    const { Route } = await import('@/routes/api/webhooks/vapi.$profile')
    const handler = Route.options.server.handlers.POST
    const req = new Request(
      'http://localhost/api/webhooks/vapi/serra-honda',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'end-of-call-report',
          call: { id: 'x', customer: { number: '+1' } },
        }),
      },
    )
    const res = await handler({
      request: req,
      params: { profile: 'serra-honda' },
    } as never)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      notification: { ok: boolean; via: string }
    }
    expect(body.notification.ok).toBe(false)
    expect(body.notification.via).toBe('unconfigured')
  })
})

describe('/api/webhooks/textmagic/$profile', () => {
  it('records an inbound SMS as messaging-hub thread', async () => {
    const { Route } = await import('@/routes/api/webhooks/textmagic.$profile')
    const handler = Route.options.server.handlers.POST
    const req = new Request(
      'http://localhost/api/webhooks/textmagic/serra-honda',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: '+15555550100',
          receiver: '+19012038267',
          text: 'Yes I want to schedule service.',
          messageId: 'tm_123',
        }),
      },
    )
    const res = await handler({
      request: req,
      params: { profile: 'serra-honda' },
    } as never)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      thread_id: string
      message_id: string
    }
    const { getThread } = await import('@/server/messaging-hub-store')
    const thread = getThread('serra-honda', body.thread_id)
    expect(thread?.channel).toBe('sms')
    // Find the inbound SMS by direction (a Slice-A delivery-annotation system
    // message also lives on the thread; message order is newest-first).
    const inbound = thread?.messages.find((m) => m.direction === 'inbound')
    expect(inbound?.content).toContain('schedule service')
  })

  it('routes inbound to the profile-configured domain (sales) without a query param', async () => {
    // serra-honda is a SALES store (Caroline). Its studio.yaml declares
    // sms.inbound_domain: sales so texts do NOT fall into the Service tab.
    const dir = path.join(tmpHome, '.hermes/profiles/serra-honda')
    fs.writeFileSync(
      path.join(dir, 'studio.yaml'),
      [
        'branding:',
        '  persona_name: Serra Honda',
        'sms:',
        '  inbound_domain: sales',
        'lead_notifications:',
        '  adf_email: leads@example.com',
        '',
      ].join('\n'),
    )
    const { Route } = await import('@/routes/api/webhooks/textmagic.$profile')
    const handler = Route.options.server.handlers.POST
    const req = new Request(
      'http://localhost/api/webhooks/textmagic/serra-honda',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: '+15555550100',
          receiver: '+19012038267',
          text: 'Looking to buy a Civic',
          id: 'tm_inbound_777',
        }),
      },
    )
    const res = await handler({
      request: req,
      params: { profile: 'serra-honda' },
    } as never)
    const body = (await res.json()) as { thread_id: string }
    const { getThread } = await import('@/server/messaging-hub-store')
    const thread = getThread('serra-honda', body.thread_id)
    expect(thread?.domain).toBe('sales')
    // BUG-3 fix: TextMagic posts the id as `id`; it is captured as external_id.
    // Assert on the inbound message specifically (a Slice-A delivery-annotation
    // system message also lives on the thread; order is newest-first).
    const inbound = thread?.messages.find((m) => m.direction === 'inbound')
    expect(inbound?.metadata?.external_id).toBe('tm_inbound_777')
  })

  it('honors an explicit ?domain= override over the configured default', async () => {
    const dir = path.join(tmpHome, '.hermes/profiles/serra-honda')
    fs.writeFileSync(
      path.join(dir, 'studio.yaml'),
      ['branding:', '  persona_name: Serra Honda', 'sms:', '  inbound_domain: sales', ''].join('\n'),
    )
    const { Route } = await import('@/routes/api/webhooks/textmagic.$profile')
    const handler = Route.options.server.handlers.POST
    const req = new Request(
      'http://localhost/api/webhooks/textmagic/serra-honda?domain=service',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: '+15555550199', text: 'oil change please' }),
      },
    )
    const res = await handler({
      request: req,
      params: { profile: 'serra-honda' },
    } as never)
    const body = (await res.json()) as { thread_id: string }
    const { getThread } = await import('@/server/messaging-hub-store')
    expect(getThread('serra-honda', body.thread_id)?.domain).toBe('service')
  })

  it('rejects when secret is required but not supplied', async () => {
    const dir = path.join(tmpHome, '.hermes/profiles/serra-honda')
    fs.writeFileSync(
      path.join(dir, '.env'),
      'TEXTMAGIC_WEBHOOK_SECRET=topsecret\n',
    )
    const { Route } = await import('@/routes/api/webhooks/textmagic.$profile')
    const handler = Route.options.server.handlers.POST
    const req = new Request(
      'http://localhost/api/webhooks/textmagic/serra-honda',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: '+1', text: 'hi' }),
      },
    )
    const res = await handler({
      request: req,
      params: { profile: 'serra-honda' },
    } as never)
    expect(res.status).toBe(401)
  })
})
