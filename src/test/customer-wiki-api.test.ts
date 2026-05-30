import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome: string

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-test-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  const dir = path.join(tmpHome, '.hermes', 'profiles', 'huminic')
  fs.mkdirSync(path.join(dir, 'knowledge', 'inbox'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'knowledge', 'drafts'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'canon'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'governance'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'knowledge', 'inbox', 'idea.md'),
    '---\ntitle: idea\ntype: note\nstatus: draft\n---\nbody',
  )
  fs.writeFileSync(
    path.join(dir, 'knowledge', 'drafts', 'next.md'),
    '---\ntitle: next\ntype: note\nstatus: draft\n---\nbody',
  )
  fs.writeFileSync(
    path.join(dir, 'canon', 'runtime.md'),
    '---\ntitle: runtime\ntype: ref\nstatus: canonical\n---\ncanon body',
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('/api/customer/wiki/tree', () => {
  it('returns the tree excluding canon/ and governance/', async () => {
    const { Route } = await import('@/routes/api/customer/wiki/tree')
    const handler = Route.options.server.handlers.GET
    const req = new Request(
      'http://localhost/api/customer/wiki/tree?profile=huminic',
    )
    const res = await handler({ request: req } as never)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      ok: boolean
      tree: Array<{ name: string; type: string }>
    }
    const names = body.tree.map((n) => n.name)
    expect(names).toContain('knowledge')
    expect(names).not.toContain('canon')
    expect(names).not.toContain('governance')
  })
})

describe('/api/customer/wiki/save', () => {
  it('blocks save into canon/ via KSG', async () => {
    const { Route } = await import('@/routes/api/customer/wiki/save')
    const handler = Route.options.server.handlers.POST
    const req = new Request('http://localhost/api/customer/wiki/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile: 'huminic',
        path: 'canon/runtime.md',
        content: '---\ntitle: x\ntype: y\nstatus: draft\n---\nbody',
      }),
    })
    const res = await handler({ request: req } as never)
    expect(res.status).toBe(422)
    const body = (await res.json()) as { rule?: string }
    expect(body.rule).toBe('protected-tree')
  })

  it('saves a valid draft', async () => {
    const { Route } = await import('@/routes/api/customer/wiki/save')
    const handler = Route.options.server.handlers.POST
    const req = new Request('http://localhost/api/customer/wiki/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile: 'huminic',
        path: 'knowledge/drafts/next.md',
        content: '---\ntitle: next\ntype: note\nstatus: draft\n---\nedited',
      }),
    })
    const res = await handler({ request: req } as never)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(true)
    const written = fs.readFileSync(
      path.join(
        tmpHome,
        '.hermes/profiles/huminic/knowledge/drafts/next.md',
      ),
      'utf8',
    )
    expect(written).toContain('edited')
  })
})

describe('/api/customer/wiki/promote', () => {
  it('promotes inbox/idea.md to drafts/idea.md', async () => {
    const { Route } = await import('@/routes/api/customer/wiki/promote')
    const handler = Route.options.server.handlers.POST
    const req = new Request('http://localhost/api/customer/wiki/promote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile: 'huminic',
        path: 'knowledge/inbox/idea.md',
      }),
    })
    const res = await handler({ request: req } as never)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; to: string }
    expect(body.ok).toBe(true)
    expect(body.to).toBe('knowledge/drafts/idea.md')
    expect(
      fs.existsSync(
        path.join(
          tmpHome,
          '.hermes/profiles/huminic/knowledge/drafts/idea.md',
        ),
      ),
    ).toBe(true)
    expect(
      fs.existsSync(
        path.join(
          tmpHome,
          '.hermes/profiles/huminic/knowledge/inbox/idea.md',
        ),
      ),
    ).toBe(false)
  })

  it('rejects promoting from outside inbox/drafts buckets', async () => {
    const { Route } = await import('@/routes/api/customer/wiki/promote')
    const handler = Route.options.server.handlers.POST
    const req = new Request('http://localhost/api/customer/wiki/promote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile: 'huminic',
        path: 'data/foo.md',
      }),
    })
    const res = await handler({ request: req } as never)
    expect(res.status).toBe(422)
  })
})
