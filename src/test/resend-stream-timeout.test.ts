/**
 * Regression guard for the sendViaResend hang: central-mcp emits the JSON-RPC
 * result early but can hold the SSE stream open. The old `await res.text()`
 * blocked until the connection idle-timed-out (~10 min in prod). notifyDealer
 * must resolve as soon as the result line is buffered, WITHOUT waiting for the
 * stream to close.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome: string
let originalFetch: typeof fetch

beforeEach(() => {
  vi.resetModules()
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'resend-stream-'))
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
})

afterEach(() => {
  vi.restoreAllMocks()
  globalThis.fetch = originalFetch
  delete process.env.CENTRAL_MCP_TOKEN
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

it('resolves with the email id even when the broker never closes the stream', async () => {
  globalThis.fetch = vi.fn(async () => {
    const payload =
      `event: message\ndata: {"result":{"content":[{"type":"text","text":"{\\"id\\":\\"stream_open_id\\"}"}]},"jsonrpc":"2.0","id":1}\n\n`
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(payload))
        // Intentionally NOT closed — simulates central-mcp holding the stream open.
      },
    })
    return new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }) as typeof fetch

  const { notifyDealer } = await import('@/server/lead-notifications')
  const result = await notifyDealer({
    profile: 'serra-honda',
    event: { customer: { full_name: 'Stream Test', phone: '+15555550100' }, vehicles: [] },
  })

  expect(result.ok).toBe(true)
  expect(result.external_id).toBe('stream_open_id')
}, 5000) // would hit this timeout (and fail) if it waited for stream close
