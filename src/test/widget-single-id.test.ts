import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * WS-7 — single-ID widget config + minified embed.
 *
 * Covers:
 *  - the public, unauthed config-by-id endpoint resolving a widget by its
 *    single id (the slug) across profiles
 *  - 404 for an unknown id
 *  - the minified bundle reading the id param + fetching the config endpoint
 *    (static smoke against the built artifact)
 */

let tmpHome: string

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'wsid-test-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  const dir = path.join(tmpHome, '.hermes', 'profiles', 'serra-honda')
  fs.mkdirSync(path.join(dir, 'knowledge', 'widgets'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'knowledge/widgets/hero-chat.md'),
    [
      '---',
      'slug: hero-chat',
      'mode: chat',
      'agent: caroline',
      'title: Serra Honda',
      'greeting: Hi there',
      'brand:',
      '  accent_color: "#0d9488"',
      'type: widget',
      'status: published',
      '---',
      'widget body',
    ].join('\n'),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('GET /api/public/widget-config/$id', () => {
  it('resolves all config from a single id (the slug)', async () => {
    const { Route } = await import('@/routes/api/public/widget-config/$id')
    const handler = Route.options.server.handlers.GET
    const res = await handler({
      params: { id: 'hero-chat' },
    } as never)
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    const body = (await res.json()) as {
      ok: boolean
      config: {
        id: string
        profile: string
        mode: string
        agent: string
        title: string
        accent: string
        url: string
      }
    }
    expect(body.ok).toBe(true)
    expect(body.config.id).toBe('hero-chat')
    expect(body.config.profile).toBe('serra-honda')
    expect(body.config.mode).toBe('chat')
    expect(body.config.agent).toBe('caroline')
    expect(body.config.title).toBe('Serra Honda')
    expect(body.config.accent).toBe('#0d9488')
    // Opens the live, functional widget route.
    expect(body.config.url).toBe('/w/hero-chat')
  })

  it('404s for an unknown id', async () => {
    const { Route } = await import('@/routes/api/public/widget-config/$id')
    const handler = Route.options.server.handlers.GET
    const res = await handler({ params: { id: 'nope' } } as never)
    expect(res.status).toBe(404)
    const body = (await res.json()) as { ok: boolean }
    expect(body.ok).toBe(false)
  })
})

describe('minified bundle (nexxus-widget.min.js)', () => {
  const minPath = path.join(process.cwd(), 'public', 'nexxus-widget.min.js')

  it('exists and is minified (single line, smaller than source)', () => {
    expect(fs.existsSync(minPath)).toBe(true)
    const min = fs.readFileSync(minPath, 'utf8')
    const src = fs.readFileSync(
      path.join(process.cwd(), 'public', 'nexxus-widget.js'),
      'utf8',
    )
    expect(min.length).toBeLessThan(src.length)
  })

  it('reads the single id param and fetches the config endpoint', () => {
    const min = fs.readFileSync(minPath, 'utf8')
    // Reads ?id= and falls back to data-widget-id.
    expect(min).toContain('searchParams.get("id")')
    expect(min).toContain('data-widget-id')
    // Resolves config from the single-ID endpoint.
    expect(min).toContain('/api/public/widget-config/')
  })
})
