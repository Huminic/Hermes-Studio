import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * C — Information-Store grounding for the PUBLIC widget chat.
 *
 * The public widget chat must recall the store's company-wiki (Information
 * Store) the same way the authenticated in-app chat does, but only inject it
 * when the visitor's question matches strongly enough — a safe score threshold
 * so thin/boilerplate scaffold pages aren't force-fed into shopper answers.
 *
 * We capture the system prompt sent to the provider and assert the wiki content
 * is present on a strong match and absent on a weak (sub-threshold) one. The
 * provider is mocked so no real model is called.
 */

let tmpHome: string
const PROFILE = 'serra-honda'
let capturedSystemPrompt = ''

beforeAll(() => {
  // widget-chat freezes HERMES_KEY / OPENAI_KEY at import time — set before the
  // first dynamic import so the provider branch is reachable.
  process.env.API_SERVER_KEY = 'test-hermes-key'
  process.env.OPENAI_API_KEY = 'sk-test'
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'widget-grounding-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  const dir = path.join(tmpHome, '.hermes', 'profiles', PROFILE)
  fs.mkdirSync(path.join(dir, 'knowledge', 'widgets'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'company-wiki'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'studio.yaml'),
    [
      'branding:',
      '  persona_name: Serra Honda',
      'widgets:',
      '  - slug: serra-honda-sales-chat',
      '    mode: chat',
      '',
    ].join('\n'),
  )
  fs.writeFileSync(
    path.join(dir, 'knowledge', 'widgets', 'serra-honda-sales-chat.md'),
    '---\nslug: serra-honda-sales-chat\nmode: chat\nagent: caroline\ndomain: sales\ntitle: Chat with Serra Honda\ntype: widget\nstatus: published\n---\nChat body.',
  )
  // The Information-Store page the grounding should surface on a strong match.
  fs.writeFileSync(
    path.join(dir, 'company-wiki', 'service-hours.md'),
    [
      '---',
      'type: reference',
      'status: published',
      'title: Service Hours',
      '---',
      '# Service Hours',
      '',
      'Our service department is open Monday to Friday, 7am to 6pm.',
      'Oil changes and recall work welcome — no appointment needed before 4pm.',
      '',
    ].join('\n'),
  )
})

beforeEach(async () => {
  capturedSystemPrompt = ''
  const mod = await import('@/server/messaging-hub-store')
  mod._resetForTests()
})

afterAll(() => {
  delete process.env.API_SERVER_KEY
  delete process.env.OPENAI_API_KEY
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

async function askWidget(question: string) {
  const realFetch = globalThis.fetch
  globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).includes('/v1/chat/completions')) {
      const payload = JSON.parse(String(init?.body ?? '{}')) as {
        messages?: Array<{ role: string; content: string }>
      }
      capturedSystemPrompt =
        payload.messages?.find((m) => m.role === 'system')?.content ?? ''
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'Happy to help!' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }
    return realFetch(url as RequestInfo)
  }) as typeof fetch
  try {
    const { Route } = await import('@/routes/api/public/widget-chat')
    const handler = Route.options.server.handlers.POST
    const req = new Request('http://localhost/api/public/widget-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: 'serra-honda-sales-chat',
        session_id: `sess-${question.length}`,
        history: [{ role: 'user', content: question }],
      }),
    })
    const res = await handler({ request: req } as never)
    expect(res.status).toBe(200)
  } finally {
    globalThis.fetch = realFetch
  }
}

describe('public widget chat — Information-Store grounding (C)', () => {
  it('injects wiki content when the question strongly matches the Information Store', async () => {
    await askWidget('What are your service hours for an oil change?')
    expect(capturedSystemPrompt).toContain('Dealership knowledge')
    expect(capturedSystemPrompt).toContain('Service Hours')
    expect(capturedSystemPrompt).toContain('Monday to Friday')
  })

  it('omits grounding when the match is weak/sub-threshold (no boilerplate force-feed)', async () => {
    // "welcome" appears once in the page body → score 1, below the threshold.
    await askWidget('welcome')
    expect(capturedSystemPrompt).not.toContain('Dealership knowledge')
    expect(capturedSystemPrompt).not.toContain('Monday to Friday')
  })

  it('still preserves the vendor guardrail in the system prompt', async () => {
    await askWidget('What are your service hours?')
    expect(capturedSystemPrompt).toContain('Confidentiality')
  })
})
