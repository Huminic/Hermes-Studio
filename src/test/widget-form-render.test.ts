import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// D-07 Option A — the public /w/$slug route renders a real lead form for
// `mode: form` widgets (was a "coming soon" stub). The form POSTs to the
// existing /api/public/widget-form endpoint.

let tmpHome: string
const PROFILE = 'serra-honda'

function mountWidget(extraFrontmatter = '') {
  const dir = path.join(tmpHome, '.hermes', 'profiles', PROFILE)
  fs.mkdirSync(path.join(dir, 'knowledge', 'widgets'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'knowledge', 'widgets', 'serra-honda-contact.md'),
    [
      '---',
      'slug: serra-honda-contact',
      'mode: form',
      'agent: caroline',
      'domain: service',
      'title: Contact Serra Honda',
      'greeting: Tell us how we can help.',
      'type: widget',
      'status: published',
      extraFrontmatter,
      '---',
      'Contact form.',
    ]
      .filter(Boolean)
      .join('\n'),
  )
}

// public-widgets captures PROFILES_ROOT from os.homedir() at module load, so the
// home dir must be stable for the whole file (set before the first import).
beforeAll(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'widget-form-render-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
})

afterAll(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

async function renderSlug(slug: string) {
  const { Route } = await import('@/routes/w.$slug')
  const handler = Route.options.server.handlers.GET
  const res = await handler({ params: { slug } } as never)
  return { status: res.status, html: await res.text() }
}

describe('public /w/$slug form-mode rendering (D-07)', () => {
  it('renders an interactive lead form, not the coming-soon stub', async () => {
    mountWidget()
    const { status, html } = await renderSlug('serra-honda-contact')
    expect(status).toBe(200)
    // Real form fields, not the stub.
    expect(html).not.toContain('coming soon')
    expect(html).toContain('id="leadform"')
    expect(html).toContain('id="lf-name"')
    expect(html).toContain('id="lf-email"')
    expect(html).toContain('id="lf-phone"')
    expect(html).toContain('id="lf-message"')
    // Posts to the existing ingestion endpoint.
    expect(html).toContain('/api/public/widget-form')
    // Carries the frontmatter-declared greeting + domain.
    expect(html).toContain('Tell us how we can help.')
    expect(html).toContain('"service"')
  })

  it('honors a custom submit_label + thank_you from frontmatter', async () => {
    mountWidget('submit_label: Request a quote\nthank_you: We got it — talk soon!')
    const { html } = await renderSlug('serra-honda-contact')
    expect(html).toContain('Request a quote')
    expect(html).toContain('We got it — talk soon!')
  })

  it('still 404s an unknown slug', async () => {
    const { status } = await renderSlug('does-not-exist')
    expect(status).toBe(404)
  })
})
