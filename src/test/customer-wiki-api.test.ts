import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome: string

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cw-test-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  const dir = path.join(tmpHome, '.hermes', 'profiles', 'huminic')

  // The customer wiki lives ONLY under company-wiki/.
  fs.mkdirSync(path.join(dir, 'company-wiki', '00-start-here'), {
    recursive: true,
  })
  fs.writeFileSync(
    path.join(dir, 'company-wiki', 'README.md'),
    '---\ntitle: Wiki\ntype: index\nstatus: published\n---\nwelcome',
  )
  fs.writeFileSync(
    path.join(dir, 'company-wiki', '00-start-here', 'welcome.md'),
    '---\ntitle: Welcome\ntype: guide\nstatus: published\n---\nbody',
  )

  // Backend plumbing that must NEVER appear in the customer wiki.
  fs.mkdirSync(path.join(dir, 'canon'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'governance'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'knowledge', 'inbox'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'brain'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'SOUL.md'), 'operator only')
  fs.writeFileSync(path.join(dir, 'persona.md'), 'operator only')
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
  it('returns ONLY the company-wiki subtree, no backend plumbing', async () => {
    const { Route } = await import('@/routes/api/customer/wiki/tree')
    const handler = Route.options.server.handlers.GET
    const req = new Request(
      'http://localhost/api/customer/wiki/tree?profile=huminic',
    )
    const res = await handler({ request: req } as never)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      ok: boolean
      root_exists: boolean
      tree: Array<{ name: string; path: string; type: string }>
    }
    expect(body.root_exists).toBe(true)
    const names = body.tree.map((n) => n.name)
    // Wiki content is present...
    expect(names).toContain('README.md')
    expect(names).toContain('00-start-here')
    // ...and NO backend folder or file leaks in.
    for (const leak of [
      'canon',
      'governance',
      'knowledge',
      'brain',
      'SOUL.md',
      'persona.md',
      'company-wiki',
    ]) {
      expect(names).not.toContain(leak)
    }
    // Every returned path is anchored under company-wiki/.
    for (const node of body.tree) {
      expect(node.path.startsWith('company-wiki/')).toBe(true)
    }
  })

  it('reports root_exists=false when there is no company-wiki', async () => {
    const dir = path.join(tmpHome, '.hermes', 'profiles', 'huminic')
    fs.rmSync(path.join(dir, 'company-wiki'), { recursive: true, force: true })
    const { Route } = await import('@/routes/api/customer/wiki/tree')
    const handler = Route.options.server.handlers.GET
    const req = new Request(
      'http://localhost/api/customer/wiki/tree?profile=huminic',
    )
    const res = await handler({ request: req } as never)
    const body = (await res.json()) as {
      root_exists: boolean
      tree: Array<unknown>
    }
    expect(body.root_exists).toBe(false)
    expect(body.tree).toEqual([])
  })
})

describe('/api/customer/wiki/read', () => {
  it('refuses to read a backend file outside the wiki', async () => {
    const { Route } = await import('@/routes/api/customer/wiki/read')
    const handler = Route.options.server.handlers.GET
    const req = new Request(
      'http://localhost/api/customer/wiki/read?profile=huminic&path=SOUL.md',
    )
    const res = await handler({ request: req } as never)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(false)
  })

  it('reads a page inside the wiki', async () => {
    const { Route } = await import('@/routes/api/customer/wiki/read')
    const handler = Route.options.server.handlers.GET
    const req = new Request(
      'http://localhost/api/customer/wiki/read?profile=huminic&path=company-wiki/README.md',
    )
    const res = await handler({ request: req } as never)
    const body = (await res.json()) as { ok: boolean; content?: string }
    expect(body.ok).toBe(true)
    expect(body.content).toContain('welcome')
  })
})

describe('/api/customer/wiki/save', () => {
  it('blocks save outside the company-wiki subtree', async () => {
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
    // KSG rejects the protected canon/ tree before any write.
    expect(res.status).toBe(422)
  })

  it('rejects a write that would escape the wiki via the writer', async () => {
    const { writeCustomerWikiFile } = await import('@/server/customer-wiki')
    const out = writeCustomerWikiFile(
      'huminic',
      'SOUL.md',
      '---\ntitle: x\ntype: y\nstatus: draft\n---\nbody',
    )
    expect(out.ok).toBe(false)
    // The backend file must be untouched.
    const soul = fs.readFileSync(
      path.join(tmpHome, '.hermes/profiles/huminic/SOUL.md'),
      'utf8',
    )
    expect(soul).toBe('operator only')
  })

  it('saves a valid wiki page', async () => {
    const { Route } = await import('@/routes/api/customer/wiki/save')
    const handler = Route.options.server.handlers.POST
    const req = new Request('http://localhost/api/customer/wiki/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile: 'huminic',
        path: 'company-wiki/00-start-here/welcome.md',
        content: '---\ntitle: Welcome\ntype: guide\nstatus: published\n---\nedited',
      }),
    })
    const res = await handler({ request: req } as never)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(true)
    const written = fs.readFileSync(
      path.join(
        tmpHome,
        '.hermes/profiles/huminic/company-wiki/00-start-here/welcome.md',
      ),
      'utf8',
    )
    expect(written).toContain('edited')
  })
})
