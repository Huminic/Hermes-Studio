/**
 * PFF-007 — thread-list preview must never surface persona/system-prompt text.
 *
 * Drives the REAL GET /api/messaging/threads handler. A legacy/video thread can
 * store a serialized transcript whose content still carries injected "system: …"
 * context lines even though the message ROLE is not 'system' (it lands as an
 * inbound 'user' message). The dealer-facing `last_message_preview` must strip
 * those lines so no internal system-prompt text reaches the partner/store user.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome: string
let savedPassword: string | undefined

beforeEach(async () => {
  savedPassword = process.env.HERMES_PASSWORD
  delete process.env.HERMES_PASSWORD // no-auth dev mode → admin session
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'threads-preview-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  const dir = path.join(tmpHome, '.hermes', 'profiles', 'serra-honda')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'studio.yaml'),
    'branding:\n  persona_name: Serra Honda\n',
  )
  const store = await import('@/server/messaging-hub-store')
  store._resetForTests()
  const bus = await import('@/server/messaging-hub-bus')
  bus._resetMessagingBus()
})

afterEach(() => {
  vi.restoreAllMocks()
  if (savedPassword === undefined) delete process.env.HERMES_PASSWORD
  else process.env.HERMES_PASSWORD = savedPassword
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

async function listPreviews() {
  const { Route } = await import('@/routes/api/messaging/threads')
  const handler = Route.options.server.handlers.GET
  const req = new Request(
    'http://localhost/api/messaging/threads?profile=serra-honda',
  )
  const res = await handler({ request: req } as never)
  const body = (await res.json()) as {
    ok: boolean
    threads: Array<{ id: string; last_message_preview: string }>
  }
  return body
}

describe('GET /api/messaging/threads — preview sanitation (PFF-007)', () => {
  it('strips injected "system:" transcript lines from last_message_preview', async () => {
    const { getOrCreateThread, appendMessage } = await import(
      '@/server/messaging-hub-store'
    )
    const thread = getOrCreateThread({
      profile: 'serra-honda',
      domain: 'sales',
      channel: 'video',
      contact_handle: 'video-legacy-1',
      subject: 'Video call',
      assigned_agent_id: null,
    })
    // Stored as a non-system inbound message, but its content is a serialized
    // transcript that opens with the persona system prompt.
    appendMessage({
      thread_id: thread.id,
      direction: 'inbound',
      role: 'user',
      channel: 'video',
      content:
        'system: Core Identity & Mission: You are Caroline…\n' +
        'user: Can I test drive the CR-V?\n' +
        'assistant: Absolutely, when works for you?',
      author: 'video-legacy-1',
    })

    const body = await listPreviews()
    expect(body.ok).toBe(true)
    const t = body.threads.find((x) => x.id === thread.id)
    expect(t).toBeTruthy()
    expect(t!.last_message_preview).not.toContain('Core Identity')
    expect(t!.last_message_preview).not.toMatch(/system:/i)
    expect(t!.last_message_preview).toContain('CR-V')
  })

  it('leaves a normal customer message preview intact', async () => {
    const { getOrCreateThread, appendMessage } = await import(
      '@/server/messaging-hub-store'
    )
    const thread = getOrCreateThread({
      profile: 'serra-honda',
      domain: 'sales',
      channel: 'chat',
      contact_handle: 'visitor-9',
      subject: 'Web chat',
      assigned_agent_id: null,
    })
    appendMessage({
      thread_id: thread.id,
      direction: 'inbound',
      role: 'user',
      channel: 'chat',
      content: 'Hi, is the Accord still available?',
      author: 'visitor-9',
    })
    const body = await listPreviews()
    const t = body.threads.find((x) => x.id === thread.id)
    expect(t!.last_message_preview).toBe('Hi, is the Accord still available?')
  })
})
