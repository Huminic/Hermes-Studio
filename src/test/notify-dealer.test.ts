/**
 * WS-4 — per-profile DEALER notification (notifyDealer).
 *
 * Serra-style profiles (notifications.lead_format: adf-xml) emit an ADF-XML
 * body that re-parses (round-trip) and call resend_send_email; Columbia-style
 * profiles (lead_format: email, the default) emit a plain readable email; an
 * unconfigured recipient returns 'unconfigured' without throwing. Also asserts
 * the Vapi end-of-call webhook invokes notifyDealer once with the profile.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome: string
let originalFetch: typeof fetch

/** Capture the resend_send_email arguments from the central-mcp fetch call. */
function lastResendArgs(fetchMock: ReturnType<typeof vi.fn>) {
  const calls = fetchMock.mock.calls
  const last = calls[calls.length - 1]
  const body = JSON.parse((last[1] as { body: string }).body)
  return body.params.arguments as {
    to: string
    from: string
    subject: string
    html: string
    text: string
    attachments?: Array<{ filename: string; content: string }>
  }
}

function writeStudioYaml(profile: string, lines: Array<string>) {
  const dir = path.join(tmpHome, '.hermes', 'profiles', profile)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'studio.yaml'), lines.join('\n') + '\n')
}

beforeEach(() => {
  vi.resetModules()
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'notify-dealer-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  originalFetch = globalThis.fetch
  globalThis.fetch = vi.fn(async () => {
    return new Response(
      `event: message\ndata: {"result":{"content":[{"text":"{\\"id\\":\\"resend_mock_id\\"}"}]}}\n\n`,
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    )
  }) as typeof fetch
  process.env.CENTRAL_MCP_TOKEN = 'mock-token'
})

afterEach(() => {
  vi.restoreAllMocks()
  globalThis.fetch = originalFetch
  delete process.env.CENTRAL_MCP_TOKEN
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

const LEAD = {
  request_date: '2026-06-03T16:00:00Z',
  customer: { full_name: 'Elliott Test', phone: '+15555550100' },
  vehicles: [
    { interest: 'buy' as const, status: 'new' as const, year: '2026', make: 'Honda', model: 'Civic' },
  ],
  comments: 'Caller interested in a 2026 Civic.',
  vendor: { name: 'vapi', service: 'assistant-x' },
}

describe('notifyDealer — adf-xml profile (Serra)', () => {
  it('emits an ADF-XML body that re-parses and calls resend_send_email', async () => {
    writeStudioYaml('serra-honda', [
      'branding:',
      '  persona_name: Serra Honda',
      'notifications:',
      '  lead_format: adf-xml',
      '  lead_recipient: leads@serra.example.com',
    ])
    const { notifyDealer } = await import('@/server/lead-notifications')
    const { parseAdfXml } = await import('@/server/adf-xml')

    const result = await notifyDealer({ profile: 'serra-honda', event: LEAD })

    expect(result.ok).toBe(true)
    expect(result.via).toBe('resend')
    expect(result.format).toBe('adf-xml')
    expect(globalThis.fetch).toHaveBeenCalledOnce()

    const args = lastResendArgs(globalThis.fetch as ReturnType<typeof vi.fn>)
    expect(args.to).toBe('leads@serra.example.com')
    // Match Nexxus: subject "New Lead - First Last".
    expect(args.subject).toBe('New Lead - Elliott Test')
    // LC-MAJOR-005: brand flipped to Huminic; sender ADDRESS unchanged for the DMS feed.
    expect(args.from).toBe('Huminic <leads@huminic.ai>')
    // Body text is the raw ADF-XML and must round-trip through the parser.
    const reparsed = parseAdfXml(args.text)
    expect(reparsed).not.toBeNull()
    expect(reparsed?.customer.full_name).toBe('Elliott Test')
    expect(reparsed?.vehicles[0]?.model).toBe('Civic')
    // ADF is also attached as a .adf.xml file.
    expect(args.attachments?.[0]?.filename).toMatch(/\.adf\.xml$/)
  })
})

describe('notifyDealer — email profile (Columbia / default)', () => {
  it('emits a plain readable email (no ADF) and calls resend_send_email', async () => {
    writeStudioYaml('ford-of-columbia', [
      'branding:',
      '  persona_name: Ford of Columbia',
      'notifications:',
      '  lead_format: email',
      '  lead_recipient: leads@columbiaford.example.com',
    ])
    const { notifyDealer } = await import('@/server/lead-notifications')
    const { isAdfXml } = await import('@/server/adf-xml')

    const result = await notifyDealer({ profile: 'ford-of-columbia', event: LEAD })

    expect(result.ok).toBe(true)
    expect(result.via).toBe('resend')
    expect(result.format).toBe('email')

    const args = lastResendArgs(globalThis.fetch as ReturnType<typeof vi.fn>)
    expect(args.to).toBe('leads@columbiaford.example.com')
    // Plain-text fallback — not ADF — but still carries the lead facts.
    expect(isAdfXml(args.text)).toBe(false)
    expect(args.text).toContain('Elliott Test')
    expect(args.text).toContain('Civic')
    expect(args.attachments).toBeUndefined()
    // HTML is the styled Nexxus card: gradient header, org name, details grid,
    // footer.
    expect(args.html).toContain('linear-gradient(135deg, #667eea 0%, #764ba2 100%)')
    expect(args.html).toContain('Ford of Columbia')
    expect(args.html).toContain('Elliott Test')
    expect(args.html).toContain('+15555550100')
    expect(args.html).toContain('Powered by Huminic')
  })

  it('defaults to email format when notifications block is absent', async () => {
    writeStudioYaml('ford-of-columbia', [
      'branding:',
      '  persona_name: Ford of Columbia',
      'lead_notifications:',
      '  adf_email: legacy@columbiaford.example.com',
    ])
    const { notifyDealer } = await import('@/server/lead-notifications')
    const result = await notifyDealer({ profile: 'ford-of-columbia', event: LEAD })
    expect(result.ok).toBe(true)
    expect(result.format).toBe('email')
    // Recipient falls back to the legacy lead_notifications.adf_email.
    const args = lastResendArgs(globalThis.fetch as ReturnType<typeof vi.fn>)
    expect(args.to).toBe('legacy@columbiaford.example.com')
  })
})

describe('notifyDealer — unconfigured recipient', () => {
  it("returns 'unconfigured' without throwing and does not call resend", async () => {
    writeStudioYaml('serra-nissan', [
      'branding:',
      '  persona_name: Serra Nissan',
      'notifications:',
      '  lead_format: adf-xml',
    ])
    const { notifyDealer } = await import('@/server/lead-notifications')
    const result = await notifyDealer({ profile: 'serra-nissan', event: LEAD })
    expect(result.ok).toBe(false)
    expect(result.via).toBe('unconfigured')
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})

describe('dispatchLeadNotification — multi-recipient routing fan-out (Columbia)', () => {
  it('fans out to every routing recipient, each carrying the AI subject + recording link', async () => {
    writeStudioYaml('hyundai-of-columbia', [
      'branding:',
      '  persona_name: Hyundai of Columbia',
      'notifications:',
      '  lead_format: email',
      '  lead_recipient: fallback@huminic.ai',
      '  routing:',
      '    - event: all',
      '      to: sam.mayfield@bc.auto',
      '      channel: email',
      '    - event: all',
      '      to: durran@cageautomotive.com',
      '      channel: email',
      '    - event: all',
      '      to: duane.wells@huminic.ai',
      '      channel: email',
    ])
    const store = await import('@/server/messaging-hub-store')
    store._resetForTests()
    const { dispatchLeadNotification } = await import('@/server/lead-notifications')
    const result = await dispatchLeadNotification({
      profile: 'hyundai-of-columbia',
      event: 'inbound_call',
      lead: {
        customer: { full_name: 'Test Caller', phone: '+15555551234' },
        vehicles: [],
        comments: 'Interested in a Tucson',
        vendor: { name: 'Phone call' },
        recording_url: 'https://storage.vapi.ai/abc.mp3',
      },
      subjectPrefix: 'New AI voice lead',
      cooldownKey: '+15555551234',
    })
    expect(result.ok).toBe(true)
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>
    // One Resend send per routing recipient (3) — NOT the single fallback.
    expect(fetchMock).toHaveBeenCalledTimes(3)
    const tos = fetchMock.mock.calls
      .map((c) => JSON.parse((c[1] as { body: string }).body).params.arguments.to)
      .sort()
    expect(tos).toEqual([
      'duane.wells@huminic.ai',
      'durran@cageautomotive.com',
      'sam.mayfield@bc.auto',
    ])
    const args0 = JSON.parse(
      (fetchMock.mock.calls[0][1] as { body: string }).body,
    ).params.arguments
    expect(args0.subject).toContain('New AI voice lead')
    expect(args0.html).toContain('Listen to the call recording')
  })
})

describe('notifyNewLead — dealer-facing Source label (no slug leak)', () => {
  it('renders a clean channel Source ("Website form"), never the profile slug', async () => {
    writeStudioYaml('serra-honda', [
      'branding:',
      '  persona_name: Serra Honda',
      'notifications:',
      '  lead_format: email',
      '  lead_recipient: leads@serra.example.com',
    ])
    const store = await import('@/server/messaging-hub-store')
    store._resetForTests()
    const { notifyNewLead } = await import('@/server/lead-notifications')
    const result = await notifyNewLead({
      profile: 'serra-honda',
      channel: 'website form',
      event: 'website_form',
      contact_handle: 'lead@example.com',
      name: 'Pat Buyer',
      email: 'lead@example.com',
      subjectPrefix: 'Website form',
    })
    expect(result.ok).toBe(true)
    const args = lastResendArgs(globalThis.fetch as ReturnType<typeof vi.fn>)
    // The email "Source" row carries the clean channel label, NOT the slug.
    expect(args.html).toContain('Website form')
    expect(args.html).not.toContain('serra-honda')
    expect(args.text).toContain('Source: Website form')
    expect(args.text).not.toContain('serra-honda')
  })

  it('sourceLabelForChannel maps known channels and Title-Cases the rest', async () => {
    const { sourceLabelForChannel } = await import('@/server/lead-notifications')
    expect(sourceLabelForChannel('SMS')).toBe('Text message')
    expect(sourceLabelForChannel('website chat')).toBe('Website chat')
    expect(sourceLabelForChannel('website form')).toBe('Website form')
    expect(sourceLabelForChannel('call-back request')).toBe('Call-back request')
    expect(sourceLabelForChannel('voice')).toBe('Phone call')
    expect(sourceLabelForChannel('video')).toBe('Video call')
    // Unknown channel → Title-Cased, never a raw slug.
    expect(sourceLabelForChannel('partner_referral')).toBe('Partner Referral')
  })
})

describe('Vapi end-of-call webhook → notifyDealer', () => {
  it('invokes notifyDealer once with the request profile on end-of-call', async () => {
    writeStudioYaml('serra-honda', [
      'branding:',
      '  persona_name: Serra Honda',
      'notifications:',
      '  lead_format: adf-xml',
      '  lead_recipient: leads@serra.example.com',
    ])
    const notifySpy = vi.fn(async (_input: { profile: string }) => ({
      ok: true as const,
      via: 'resend' as const,
      external_id: 'mock',
      format: 'adf-xml' as const,
    }))
    vi.doMock('@/server/lead-notifications', () => ({
      dispatchLeadNotification: notifySpy,
    }))
    const store = await import('@/server/messaging-hub-store')
    store._resetForTests()
    const bus = await import('@/server/messaging-hub-bus')
    bus._resetMessagingBus()

    const { Route } = await import('@/routes/api/webhooks/vapi.$profile')
    const handler = Route.options.server.handlers.POST
    const req = new Request('http://localhost/api/webhooks/vapi/serra-honda', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          type: 'end-of-call-report',
          summary: 'Caller interested in 2026 Civic.',
          call: {
            id: 'vapi_call_abc',
            assistantId: 'c303d993-bf42-4784-a8cb-247477b1cbdd',
            customer: { number: '+15555550100', name: 'Elliott Test' },
            endedAt: '2026-06-03T16:01:30Z',
          },
        },
      }),
    })
    const res = await handler({
      request: req,
      params: { profile: 'serra-honda' },
    } as never)
    expect(res.status).toBe(200)
    expect(notifySpy).toHaveBeenCalledOnce()
    expect(notifySpy.mock.calls[0][0]).toMatchObject({
      profile: 'serra-honda',
      event: 'inbound_call',
    })
  })
})

describe('renderDealerNotificationEmail — pure renderer', () => {
  // The Vapi-webhook test above vi.doMock's this module; clear it so we import
  // the real renderer here.
  beforeEach(() => {
    vi.doUnmock('@/server/lead-notifications')
    vi.resetModules()
  })

  const LEAD_NAMED = {
    request_date: '2026-06-03T16:00:00Z',
    customer: {
      first_name: 'Elliott',
      last_name: 'Test',
      full_name: 'Elliott Test',
      phone: '+15555550100',
    },
    vehicles: [
      { interest: 'buy' as const, status: 'new' as const, year: '2026', make: 'Honda', model: 'Civic' },
    ],
    comments: 'Caller interested in a 2026 Civic.',
    vendor: { name: 'vapi', service: 'assistant-x' },
  }

  it('email format renders the styled HTML card matching the Nexxus template', async () => {
    const { renderDealerNotificationEmail } = await import(
      '@/server/lead-notifications'
    )
    const out = renderDealerNotificationEmail({
      format: 'email',
      lead: LEAD_NAMED,
      orgName: 'Ford of Columbia',
    })
    expect(out.html).toBeDefined()
    // Gradient header.
    expect(out.html).toContain(
      'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    )
    // Org name in the header.
    expect(out.html).toContain('Ford of Columbia')
    // Subtle "AI" reference in the card header (email format only).
    expect(out.html).toContain('Has a New AI Lead!')
    // Details row with name + phone.
    expect(out.html).toContain('Elliott Test')
    expect(out.html).toContain('+15555550100')
    // Footer.
    expect(out.html).toContain('Questions or issues?')
    expect(out.html).toContain('Powered by Huminic')
    expect(out.html).toContain('support@huminic.ai')
    // No ADF attachment on the card.
    expect(out.attachments).toBeUndefined()
  })

  it('adf-xml format renders subject "New Lead - First Last" with re-parsable ADF body', async () => {
    const { renderDealerNotificationEmail } = await import(
      '@/server/lead-notifications'
    )
    const { parseAdfXml } = await import('@/server/adf-xml')
    const out = renderDealerNotificationEmail({
      format: 'adf-xml',
      lead: LEAD_NAMED,
      orgName: 'Serra Honda',
    })
    expect(out.subject).toBe('New Lead - Elliott Test')
    // text/plain stays the RAW ADF (what the DMS ingests); html is a viewable
    // <pre> copy so the central-mcp resend_send_email tool's required html field
    // is satisfied.
    expect(out.html).toContain('<pre')
    const reparsed = parseAdfXml(out.text)
    expect(reparsed).not.toBeNull()
    expect(reparsed?.customer.full_name).toBe('Elliott Test')
    expect(reparsed?.vehicles[0]?.model).toBe('Civic')
    expect(out.attachments?.[0]?.filename).toMatch(/\.adf\.xml$/)
  })

  it('email format renders a clickable recording link + a text line when recording_url is present', async () => {
    const { renderDealerNotificationEmail } = await import(
      '@/server/lead-notifications'
    )
    const out = renderDealerNotificationEmail({
      format: 'email',
      lead: { ...LEAD_NAMED, recording_url: 'https://rec.example.com/abc.mp3' },
      orgName: 'Ford of Columbia',
    })
    // Clickable anchor in the card (URL is the href, not just escaped text).
    expect(out.html).toContain('href="https://rec.example.com/abc.mp3"')
    expect(out.html).toContain('Listen to the call recording')
    // Plain-text fallback carries the bare URL.
    expect(out.text).toContain('Call recording: https://rec.example.com/abc.mp3')
  })

  it('adf-xml format folds the recording link into <comments> (CRM ingestion)', async () => {
    const { renderDealerNotificationEmail } = await import(
      '@/server/lead-notifications'
    )
    const { parseAdfXml } = await import('@/server/adf-xml')
    const out = renderDealerNotificationEmail({
      format: 'adf-xml',
      lead: { ...LEAD_NAMED, recording_url: 'https://rec.example.com/abc.mp3' },
      orgName: 'Serra Honda',
    })
    expect(out.text).toContain('Call recording: https://rec.example.com/abc.mp3')
    const reparsed = parseAdfXml(out.text)
    expect(reparsed?.comments).toContain('https://rec.example.com/abc.mp3')
    // The original comment text is preserved alongside the link.
    expect(reparsed?.comments).toContain('Caller interested in a 2026 Civic.')
  })

  it('adf-xml emits only the recording link when comments are empty (no malformed XML)', async () => {
    const { renderDealerNotificationEmail } = await import(
      '@/server/lead-notifications'
    )
    const { parseAdfXml } = await import('@/server/adf-xml')
    const out = renderDealerNotificationEmail({
      format: 'adf-xml',
      lead: {
        ...LEAD_NAMED,
        comments: undefined,
        recording_url: 'https://rec.example.com/abc.mp3',
      },
      orgName: 'Serra Honda',
    })
    const reparsed = parseAdfXml(out.text)
    expect(reparsed).not.toBeNull()
    expect(reparsed?.comments).toBe('Call recording: https://rec.example.com/abc.mp3')
  })

  it('video recording_kind renders "Watch the video recording" + "Video recording:" wording', async () => {
    const { renderDealerNotificationEmail } = await import(
      '@/server/lead-notifications'
    )
    const out = renderDealerNotificationEmail({
      format: 'email',
      lead: {
        ...LEAD_NAMED,
        recording_url: 'https://rec.example.com/vid.mp4',
        recording_kind: 'video',
      },
      orgName: 'Ford of Columbia',
    })
    expect(out.html).toContain('href="https://rec.example.com/vid.mp4"')
    expect(out.html).toContain('Watch the video recording')
    expect(out.html).not.toContain('Listen to the call recording')
    expect(out.text).toContain('Video recording: https://rec.example.com/vid.mp4')
    expect(out.text).not.toContain('Call recording:')
  })

  it('audio path still says "Listen to the call recording" / "Call recording:"', async () => {
    const { renderDealerNotificationEmail } = await import(
      '@/server/lead-notifications'
    )
    const out = renderDealerNotificationEmail({
      format: 'email',
      lead: {
        ...LEAD_NAMED,
        recording_url: 'https://rec.example.com/abc.mp3',
        recording_kind: 'audio',
      },
      orgName: 'Ford of Columbia',
    })
    expect(out.html).toContain('Listen to the call recording')
    expect(out.html).not.toContain('Watch the video recording')
    expect(out.text).toContain('Call recording: https://rec.example.com/abc.mp3')
  })

  it('email format renders a non-http recording value as escaped text, never a live href', async () => {
    const { renderDealerNotificationEmail } = await import(
      '@/server/lead-notifications'
    )
    const out = renderDealerNotificationEmail({
      format: 'email',
      lead: { ...LEAD_NAMED, recording_url: 'javascript:alert(1)' },
      orgName: 'Ford of Columbia',
    })
    expect(out.html).not.toContain('href="javascript:')
    expect(out.html).not.toContain('href="javascript&')
  })
})
