import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  eventForChannel,
  resolveNotificationEmails,
} from '@/server/lead-notifications'

describe('eventForChannel mapping', () => {
  it('maps loose channel labels to routing events', () => {
    expect(eventForChannel('SMS')).toBe('inbound_sms')
    expect(eventForChannel('website chat')).toBe('inbound_chat')
    expect(eventForChannel('voice')).toBe('inbound_call')
    expect(eventForChannel('Vapi lead')).toBe('inbound_call')
    expect(eventForChannel('video')).toBe('inbound_video')
    expect(eventForChannel('Tavus video')).toBe('inbound_video')
    expect(eventForChannel('website form')).toBe('website_form')
    expect(eventForChannel('email-adf')).toBe('new_lead')
    expect(eventForChannel('whatever')).toBe('new_lead')
  })
})

describe('resolveNotificationEmails (routing matrix)', () => {
  const config = {
    notifications: {
      routing: [
        { event: 'inbound_sms', to: 'sales@x.com', channel: 'email', enabled: true },
        { event: 'all', to: 'manager@x.com', channel: 'email', enabled: true },
        { event: 'inbound_call', to: '+15555550000', channel: 'sms', enabled: true },
        { event: 'inbound_sms', to: 'off@x.com', channel: 'email', enabled: false },
      ],
    },
  }

  it('matches the event plus any "all" rule, dedups, and counts skipped sms', () => {
    const sms = resolveNotificationEmails(config, 'inbound_sms')
    expect(sms.emails.sort()).toEqual(['manager@x.com', 'sales@x.com'])
    expect(sms.smsSkipped).toBe(0)

    const call = resolveNotificationEmails(config, 'inbound_call')
    expect(call.emails).toEqual(['manager@x.com']) // sms rule skipped
    expect(call.smsSkipped).toBe(1)

    const generic = resolveNotificationEmails(config, 'new_lead')
    expect(generic.emails).toEqual(['manager@x.com']) // only the 'all' rule
  })

  it('routes a video lead via an inbound_video rule (parity with sms/voice)', () => {
    const cfg = {
      notifications: {
        routing: [
          { event: 'inbound_video', to: 'video-leads@x.com', channel: 'email', enabled: true },
          { event: 'all', to: 'manager@x.com', channel: 'email', enabled: true },
        ],
      },
    }
    const video = resolveNotificationEmails(cfg, eventForChannel('video'))
    expect(video.emails.sort()).toEqual(['manager@x.com', 'video-leads@x.com'])
  })

  it('returns no emails when nothing matches (caller falls back to lead_recipient)', () => {
    const none = resolveNotificationEmails({ notifications: { routing: [] } }, 'inbound_sms')
    expect(none.emails).toEqual([])
  })
})

describe('/api/customer/notifications round-trip', () => {
  let tmpHome: string
  const PROFILE = 'serra-honda'

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'notif-routing-'))
    vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
    const dir = path.join(tmpHome, '.hermes', 'profiles', PROFILE)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      path.join(dir, 'studio.yaml'),
      'branding:\n  persona_name: Serra Honda\nnotifications:\n  lead_format: adf-xml\n  lead_recipient: bdc@serra.example\n',
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(tmpHome, { recursive: true, force: true })
  })

  async function handlers() {
    const { Route } = await import('@/routes/api/customer/notifications')
    return Route.options.server.handlers
  }

  it('PUT persists routing into studio.yaml (preserving other keys) and GET reads it back', async () => {
    const h = await handlers()
    const put = await h.PUT({
      request: new Request('http://localhost/api/customer/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: PROFILE,
          routing: [
            { event: 'inbound_call', to: 'manager@serra.example', label: 'Sales Manager' },
            { event: 'all', to: 'gm@serra.example', channel: 'email' },
          ],
        }),
      }),
    } as never)
    expect(put.status).toBe(200)

    // Landed in studio.yaml alongside the existing keys.
    const yaml = fs.readFileSync(
      path.join(tmpHome, '.hermes', 'profiles', PROFILE, 'studio.yaml'),
      'utf8',
    )
    expect(yaml).toContain('persona_name: Serra Honda') // other keys survived
    expect(yaml).toContain('lead_recipient: bdc@serra.example')
    expect(yaml).toContain('manager@serra.example')

    const res = await h.GET({
      request: new Request(
        `http://localhost/api/customer/notifications?profile=${PROFILE}`,
      ),
    } as never)
    const body = (await res.json()) as {
      ok: boolean
      routing: Array<{ event: string; to: string }>
      known_events: Array<string>
    }
    expect(body.ok).toBe(true)
    expect(body.routing.map((r) => r.to).sort()).toEqual([
      'gm@serra.example',
      'manager@serra.example',
    ])
    expect(body.known_events).toContain('inbound_call')
    // inbound_video is now selectable in the UI (video routing parity).
    expect(body.known_events).toContain('inbound_video')

    // And the saved routing is what the dispatcher would resolve.
    const { readStudioConfig } = await import('@/server/studio-config')
    const cfg = readStudioConfig(PROFILE).config
    expect(resolveNotificationEmails(cfg, 'inbound_call').emails.sort()).toEqual([
      'gm@serra.example',
      'manager@serra.example',
    ])
  })

  it('PUT rejects an email rule with no @ in the recipient', async () => {
    const h = await handlers()
    const put = await h.PUT({
      request: new Request('http://localhost/api/customer/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: PROFILE,
          routing: [{ event: 'new_lead', to: 'not-an-email', channel: 'email' }],
        }),
      }),
    } as never)
    expect(put.status).toBe(400)
  })

  // N3.1 — the management-audience card round-trips through the same API.
  it('PUT persists the management audience + switches and GET reads it back', async () => {
    const h = await handlers()
    const put = await h.PUT({
      request: new Request('http://localhost/api/customer/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: PROFILE,
          management_audience: {
            emails: 'gm@serra.example\nowner@serra.example',
            cells: '+15551230000\n+15559876543',
            reportsEnabled: true,
            alertsEnabled: true,
          },
        }),
      }),
    } as never)
    expect(put.status).toBe(200)

    // Existing keys survived; audience landed in studio.yaml.
    const yaml = fs.readFileSync(
      path.join(tmpHome, '.hermes', 'profiles', PROFILE, 'studio.yaml'),
      'utf8',
    )
    expect(yaml).toContain('lead_recipient: bdc@serra.example')
    expect(yaml).toContain('gm@serra.example')
    expect(yaml).toContain('+15551230000')

    const res = await h.GET({
      request: new Request(
        `http://localhost/api/customer/notifications?profile=${PROFILE}`,
      ),
    } as never)
    const body = (await res.json()) as {
      management_audience: {
        emails: string[]
        cells: string[]
        reportsEnabled: boolean
        alertsEnabled: boolean
      }
    }
    expect(body.management_audience.emails).toEqual([
      'gm@serra.example',
      'owner@serra.example',
    ])
    expect(body.management_audience.cells).toEqual(['+15551230000', '+15559876543'])
    expect(body.management_audience.reportsEnabled).toBe(true)
    expect(body.management_audience.alertsEnabled).toBe(true)

    // And readManagementAudience surfaces the same for the send scripts.
    const { readManagementAudience } = await import('@/server/studio-config')
    const aud = readManagementAudience(PROFILE)
    expect(aud.emails).toEqual(['gm@serra.example', 'owner@serra.example'])
    expect(aud.cells).toEqual(['+15551230000', '+15559876543'])
    expect(aud.reportsEnabled).toBe(true)
  })

  it('PUT rejects a management audience with a non-E.164 cell', async () => {
    const h = await handlers()
    const put = await h.PUT({
      request: new Request('http://localhost/api/customer/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: PROFILE,
          management_audience: { emails: [], cells: '555-1230000', reportsEnabled: false, alertsEnabled: false },
        }),
      }),
    } as never)
    expect(put.status).toBe(400)
  })
})
