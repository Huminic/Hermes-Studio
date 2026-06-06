import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the dealer-notification send so the test asserts the WIRING, not a send.
const notifySpy = vi.fn(async () => ({ ok: true, via: 'mock' as const }))
vi.mock('@/server/lead-notifications', () => ({ notifyNewLead: notifySpy }))

let tmpHome: string
const PROFILE = 'serra-honda'

beforeEach(async () => {
  notifySpy.mockClear()
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'widget-form-notify-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  const dir = path.join(tmpHome, '.hermes', 'profiles', PROFILE)
  fs.mkdirSync(path.join(dir, 'knowledge', 'widgets'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'studio.yaml'),
    [
      'branding:',
      '  persona_name: Serra Honda',
      'notifications:',
      '  lead_format: adf-xml',
      '  lead_recipient: bdc@serrahonda.example',
      'widgets:',
      '  - slug: serra-honda-contact',
      '    mode: form',
      '    agent: caroline',
      '',
    ].join('\n'),
  )
  fs.writeFileSync(
    path.join(dir, 'knowledge', 'widgets', 'serra-honda-contact.md'),
    '---\nslug: serra-honda-contact\nmode: form\nagent: caroline\ndomain: sales\ntitle: Contact Serra Honda\ntype: widget\nstatus: published\n---\nContact form.',
  )
  const mod = await import('@/server/messaging-hub-store')
  mod._resetForTests()
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('widget-form submission → lead lands + dealer notification trips', () => {
  it('creates a lead thread AND invokes notifyDealer with the lead', async () => {
    const { Route } = await import('@/routes/api/public/widget-form')
    const handler = Route.options.server.handlers.POST
    const req = new Request('http://localhost/api/public/widget-form', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: 'serra-honda-contact',
        name: 'Jane Shopper',
        email: 'jane@example.com',
        phone: '+15555550100',
        message: 'Interested in an Accord',
      }),
    })
    const res = await handler({ request: req } as never)
    const body = (await res.json()) as { ok: boolean; thread_id: string }
    expect(body.ok).toBe(true)
    expect(body.thread_id).toBeTruthy()

    // The lead landed in messaging-hub.
    const { listThreads } = await import('@/server/messaging-hub-store')
    const threads = listThreads({ profile: PROFILE, channel: 'form' })
    expect(threads.length).toBe(1)
    expect(threads[0].contact_handle).toBe('jane@example.com')

    // The dealer notification was tripped with the right profile + lead data.
    expect(notifySpy).toHaveBeenCalledTimes(1)
    const arg = notifySpy.mock.calls[0][0] as {
      profile: string
      event?: string
      email?: string
      name?: string
    }
    expect(arg.profile).toBe(PROFILE)
    expect(arg.event).toBe('website_form')
    expect(arg.email).toBe('jane@example.com')
    expect(arg.name).toBe('Jane Shopper')
  })
})
