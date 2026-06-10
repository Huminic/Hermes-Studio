import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome: string

beforeEach(async () => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cwidgets-test-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  const dir = path.join(tmpHome, '.hermes', 'profiles', 'huminic')
  fs.mkdirSync(path.join(dir, 'knowledge', 'widgets'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'studio.yaml'),
    [
      'branding:',
      '  persona_name: Huminic',
      '  accent_color: "#1e40af"',
      'widgets:',
      '  - slug: hero-chat',
      '    mode: chat',
      '    agent: huminic',
      '  - slug: lead-form',
      '    mode: form',
      '    agent: huminic',
      '',
    ].join('\n'),
  )
  fs.writeFileSync(
    path.join(dir, 'knowledge/widgets/hero-chat.md'),
    '---\nslug: hero-chat\nmode: chat\nagent: huminic\ntitle: Hero\ngreeting: Hi there\ntype: widget\nstatus: draft\n---\nbody',
  )
  // lead-form NOT created → status should be missing-file
  const mod = await import('@/server/messaging-hub-store')
  mod._resetForTests()
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('/api/customer/widgets', () => {
  it('returns ready + missing-file states per widget', async () => {
    const { Route } = await import('@/routes/api/customer/widgets/index')
    const handler = Route.options.server.handlers.GET
    const req = new Request(
      'http://localhost/api/customer/widgets?profile=huminic',
    )
    const res = await handler({ request: req } as never)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      ok: boolean
      widgets: Array<{ slug: string; status: string; embed_snippet: string }>
    }
    expect(body.ok).toBe(true)
    const hero = body.widgets.find((w) => w.slug === 'hero-chat')
    const form = body.widgets.find((w) => w.slug === 'lead-form')
    expect(hero?.status).toBe('ready')
    expect(form?.status).toBe('missing-file')
    // Unified dealer embed snippet uses current Huminic path
    expect(hero?.embed_snippet).toContain('/widget/dealer/huminic.js')
    // D-06: the absolute server filePath must NEVER reach the customer client.
    for (const w of body.widgets as Array<Record<string, unknown>>) {
      expect(w.filePath).toBeUndefined()
    }
    expect(JSON.stringify(body)).not.toContain('/root/.hermes')
    expect(JSON.stringify(body)).not.toContain(os.tmpdir())
  })
})

describe('/api/customer/widgets/save', () => {
  it('creates a new widget file via KSG-gated save', async () => {
    const { Route } = await import('@/routes/api/customer/widgets/save')
    const handler = Route.options.server.handlers.POST
    const req = new Request('http://localhost/api/customer/widgets/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile: 'huminic',
        slug: 'lead-form',
        content:
          '---\nslug: lead-form\nmode: form\nagent: huminic\ntitle: Lead\ngreeting: hi\ntype: widget\nstatus: draft\n---\nform body',
      }),
    })
    const res = await handler({ request: req } as never)
    expect(res.status).toBe(200)
    expect(
      fs.existsSync(
        path.join(
          tmpHome,
          '.hermes/profiles/huminic/knowledge/widgets/lead-form.md',
        ),
      ),
    ).toBe(true)
  })

  it('rejects a save with no frontmatter', async () => {
    const { Route } = await import('@/routes/api/customer/widgets/save')
    const handler = Route.options.server.handlers.POST
    const req = new Request('http://localhost/api/customer/widgets/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile: 'huminic',
        slug: 'lead-form',
        content: 'just plain body, no frontmatter',
      }),
    })
    const res = await handler({ request: req } as never)
    expect(res.status).toBe(422)
  })
})

describe('/api/public/widget-form (AC.4.4)', () => {
  it('records a form submission as an inbound message in the right domain', async () => {
    const { Route } = await import('@/routes/api/public/widget-form')
    const handler = Route.options.server.handlers.POST
    // First save the widget so findPublicWidget can resolve it.
    const { Route: saveRoute } = await import(
      '@/routes/api/customer/widgets/save'
    )
    await saveRoute.options.server.handlers.POST({
      request: new Request('http://localhost/api/customer/widgets/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: 'huminic',
          slug: 'lead-form',
          content:
            '---\nslug: lead-form\nmode: form\nagent: huminic\ntitle: Lead\ngreeting: hi\ntype: widget\nstatus: draft\ndomain: sales\n---\nform body',
        }),
      }),
    } as never)
    const req = new Request('http://localhost/api/public/widget-form', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: 'lead-form',
        name: 'Test Lead',
        email: 'lead@example.com',
        message: 'interested in pricing',
      }),
    })
    const res = await handler({ request: req } as never)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; thread_id: string }
    expect(body.ok).toBe(true)
    const { getThread } = await import('@/server/messaging-hub-store')
    const thread = getThread('huminic', body.thread_id)
    expect(thread?.domain).toBe('sales')
    expect(thread?.channel).toBe('form')
    expect(thread?.messages[0].content).toContain('interested in pricing')
  })
})
