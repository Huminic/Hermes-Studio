/**
 * #NW — per-notification template (format) routing.
 *
 * A single store fans one lead out to human recipients on the styled-email
 * card AND a DMS intake address on ADF-XML, driven by each routing rule's
 * `format` (falling back to the store-level `lead_format`). Also asserts the
 * ADF document is enriched with the store's adf_brand / adf_lead_source.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome: string
let originalFetch: typeof fetch

function allResendArgs(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.map((c) => {
    const body = JSON.parse((c[1] as { body: string }).body)
    return body.params.arguments as {
      to: string
      from: string
      subject: string
      html: string
      text: string
      attachments?: Array<{ filename: string; content: string }>
    }
  })
}

function writeStudioYaml(profile: string, lines: Array<string>) {
  const dir = path.join(tmpHome, '.hermes', 'profiles', profile)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'studio.yaml'), lines.join('\n') + '\n')
}

beforeEach(() => {
  vi.resetModules()
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'notif-tmpl-'))
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
  request_date: '2026-06-19T16:00:00Z',
  customer: { full_name: 'Sample Customer', phone: '+15555550100' },
  vehicles: [],
  comments: 'Interested in a new vehicle.',
  vendor: { name: 'Phone call' },
}

const SERRA_YAML = [
  'branding:',
  '  persona_name: Serra Honda',
  'notifications:',
  '  lead_format: email',
  '  adf_brand: Honda',
  '  adf_lead_source: Dealers WebSite',
  '  routing:',
  '    - { event: all, to: victoria@example.com, channel: email, label: Victoria }',
  '    - { event: all, to: leads@serrahonda.co, channel: email, format: adf-xml, label: DMS }',
]

describe('per-notification template routing', () => {
  it('fans a lead to humans (email card) AND the DMS contact (ADF-XML) in one dispatch', async () => {
    writeStudioYaml('serra-honda', SERRA_YAML)
    const { dispatchLeadNotification } = await import('@/server/lead-notifications')

    const result = await dispatchLeadNotification({
      profile: 'serra-honda',
      event: 'inbound_call',
      lead: LEAD,
      subjectPrefix: 'New AI voice lead',
      cooldownKey: '+15555550100',
    })

    expect(result.ok).toBe(true)
    const args = allResendArgs(globalThis.fetch as ReturnType<typeof vi.fn>)
    expect(args).toHaveLength(2)

    const human = args.find((a) => a.to === 'victoria@example.com')!
    const dms = args.find((a) => a.to === 'leads@serrahonda.co')!
    expect(human).toBeTruthy()
    expect(dms).toBeTruthy()

    // Human gets the styled card; the DMS gets ADF (attachment + "New Lead -" subject).
    expect(human.subject).toContain('New AI voice lead')
    expect(human.attachments ?? []).toHaveLength(0)
    expect(dms.subject).toContain('New Lead -')
    expect(dms.attachments?.[0]?.filename).toMatch(/\.adf\.xml$/)
  })

  it('enriches the ADF document with the store brand + lead source', async () => {
    writeStudioYaml('serra-honda', SERRA_YAML)
    const { dispatchLeadNotification } = await import('@/server/lead-notifications')
    const { parseAdfXml } = await import('@/server/adf-xml')

    await dispatchLeadNotification({
      profile: 'serra-honda',
      event: 'inbound_call',
      lead: LEAD,
      subjectPrefix: 'New AI voice lead',
      cooldownKey: '+15555550100',
    })

    const args = allResendArgs(globalThis.fetch as ReturnType<typeof vi.fn>)
    const dms = args.find((a) => a.to === 'leads@serrahonda.co')!
    expect(dms.text).toContain('Honda') // vehicle make from adf_brand
    expect(dms.text).toContain('Dealers WebSite') // <vendorname> from adf_lead_source
    const parsed = parseAdfXml(dms.text)
    expect(parsed?.vendor?.name).toBe('Dealers WebSite')
    expect(parsed?.vehicles?.[0]?.make).toBe('Honda')
  })

  it('falls back to the store lead_format when a rule has no format, and honors per-rule format', async () => {
    const { resolveNotificationRecipients } = await import(
      '@/server/lead-notifications'
    )
    // rule with no format → store default (adf-xml here)
    expect(
      resolveNotificationRecipients(
        {
          notifications: {
            lead_format: 'adf-xml',
            routing: [{ event: 'all', to: 'dms@example.com', channel: 'email' }],
          },
        },
        'inbound_call',
      ).recipients,
    ).toEqual([{ to: 'dms@example.com', format: 'adf-xml' }])

    // per-rule format overrides the store default; sms rule is skipped
    const mixed = resolveNotificationRecipients(
      {
        notifications: {
          lead_format: 'email',
          routing: [
            { event: 'all', to: 'human@example.com', channel: 'email' },
            { event: 'all', to: 'dms@example.com', channel: 'email', format: 'adf-xml' },
            { event: 'all', to: '+15555550199', channel: 'sms' },
          ],
        },
      },
      'inbound_call',
    )
    expect(mixed.recipients).toEqual([
      { to: 'human@example.com', format: 'email' },
      { to: 'dms@example.com', format: 'adf-xml' },
    ])
    expect(mixed.smsSkipped).toBe(1)
  })
})
