/**
 * P0-2 regression guard — lead-notification delivery reliability.
 *
 * Root cause of the ~62% dealer lead-notify failure: the 6-way Promise.all fan-out
 * fired every recipient at once and tripped the Resend/central-mcp per-second rate
 * limit, and a rate-limited send was NOT retried. This test proves:
 *   1. a rate-limited (HTTP 429) send is retried and succeeds on the next attempt;
 *   2. a genuine provider rejection surfaces its reason (which the send path then
 *      persists to comms_log.body_summary) and is NOT retried.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome: string
let originalFetch: typeof fetch

const successPayload =
  `event: message\ndata: {"result":{"content":[{"type":"text","text":"{\\"id\\":\\"ok_email_id\\"}"}]},"jsonrpc":"2.0","id":1}\n\n`

function sseStream(payload: string): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(payload))
      controller.close()
    },
  })
}

beforeEach(() => {
  vi.resetModules()
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'lead-notify-retry-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  const dir = path.join(tmpHome, '.hermes', 'profiles', 'serra-honda')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'studio.yaml'),
    [
      'branding:',
      '  persona_name: Serra Honda',
      'notifications:',
      '  lead_format: email',
      '  lead_recipient: bdc@example.com',
    ].join('\n') + '\n',
  )
  originalFetch = globalThis.fetch
  process.env.CENTRAL_MCP_TOKEN = 'mock-token'
  process.env.RESEND_RETRY_BASE_MS = '0' // no real backoff sleep in tests
})

afterEach(() => {
  vi.restoreAllMocks()
  globalThis.fetch = originalFetch
  delete process.env.CENTRAL_MCP_TOKEN
  delete process.env.RESEND_RETRY_BASE_MS
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('P0-2 lead-notify delivery reliability', () => {
  it('retries a rate-limited (429) send and succeeds on the next attempt', async () => {
    let calls = 0
    globalThis.fetch = vi.fn(async () => {
      calls += 1
      if (calls === 1) {
        return new Response(sseStream('rate limited'), {
          status: 429,
          headers: { 'Content-Type': 'text/event-stream' },
        })
      }
      return new Response(sseStream(successPayload), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }) as typeof fetch

    const { notifyDealer } = await import('@/server/lead-notifications')
    const result = await notifyDealer({
      profile: 'serra-honda',
      event: { customer: { full_name: 'Retry Test', phone: '+15555550100' }, vehicles: [] },
    })

    expect(calls).toBe(2) // first 429 retried
    expect(result.ok).toBe(true)
    expect(result.external_id).toBe('ok_email_id')
  }, 5000)

  it('surfaces the provider rejection reason and does not retry a permanent failure', async () => {
    let calls = 0
    const rejectPayload =
      `event: message\ndata: {"result":{"content":[{"type":"text","text":"{\\"error\\":\\"invalid recipient address\\"}"}]},"jsonrpc":"2.0","id":1}\n\n`
    globalThis.fetch = vi.fn(async () => {
      calls += 1
      return new Response(sseStream(rejectPayload), {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }) as typeof fetch

    const { notifyDealer } = await import('@/server/lead-notifications')
    const result = await notifyDealer({
      profile: 'serra-honda',
      event: { customer: { full_name: 'Reject Test', phone: '+15555550101' }, vehicles: [] },
    })

    expect(calls).toBe(1) // non-transient → no retry
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/invalid recipient/i)
  }, 5000)
})
