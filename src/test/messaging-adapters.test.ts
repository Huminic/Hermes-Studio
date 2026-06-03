import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { StudioConfig } from '@/lib/studio-config'
import { defaultStudioConfig } from '@/lib/studio-config'

// Control the per-profile credential mode by mocking the server-side reader.
let mockConfig: StudioConfig = defaultStudioConfig('test')
vi.mock('@/server/studio-config', () => ({
  readStudioConfig: () => ({ config: mockConfig, source: 'file' as const }),
}))

import { dispatchOutbound } from '@/server/messaging-adapters'

const thread = {
  contact_handle: '+12025550123',
  subject: 'Test thread',
} as unknown as Parameters<typeof dispatchOutbound>[0]['thread']

function withConfig(yamlIshOverride: Partial<StudioConfig['channel_credentials']>): StudioConfig {
  const base = defaultStudioConfig('test')
  return {
    ...base,
    channel_credentials: { default: 'shared', ...yamlIshOverride },
    comms: {
      outbound_enabled: true,
      channels: { sms: true, voice: true, video: true, email: true },
      business_hours: { tz: 'UTC', start: '00:00', end: '23:59' },
      vin_check: false,
      rate_caps: { sms: { per_minute: 1000, per_hour: 1000 } },
    },
  }
}

describe('dispatchOutbound — shared/own credential routing', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    mockConfig = defaultStudioConfig('test')
    // Open the CommGate for routing tests: enable outbound globally + a 24h
    // window + generous caps so only the credential routing under test decides.
    mockConfig.comms = {
      outbound_enabled: true,
      channels: { sms: true, voice: true, video: true, email: true },
      business_hours: { tz: 'UTC', start: '00:00', end: '23:59' },
      vin_check: false,
      rate_caps: { sms: { per_minute: 1000, per_hour: 1000 } },
    }
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('CENTRAL_MCP_TOKEN', 'test-central-token')
    vi.stubEnv('OUTBOUND_LIVE_ENABLED', 'true')
    vi.stubEnv('SIGNALWIRE_FROM', '+18886917953')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('SHARED sms (default) routes via central-mcp signalwire_send_sms', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        'data: {"result":{"content":[{"text":"{\\"sid\\":\\"sms_sid_99\\"}"}]}}\n',
    })
    const r = await dispatchOutbound({ profile: 'test', channel: 'sms', thread, content: 'hi' })
    expect(r.status).toBe('sent')
    expect(r.via).toBe('sms-signalwire-shared')
    expect(r.external_id).toBe('sms_sid_99')
    const [url, opts] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/mcp')
    const body = JSON.parse((opts as { body: string }).body)
    expect(body.params.name).toBe('signalwire_send_sms')
    expect(body.params.arguments.to).toBe('+12025550123')
    expect(body.params.arguments.from).toBe('+18886917953')
    expect(body.params.arguments.body).toBe('hi')
  })

  it('SHARED sms with no SIGNALWIRE_FROM reports unconfigured (no guaranteed-fail send)', async () => {
    vi.stubEnv('SIGNALWIRE_FROM', '')
    const r = await dispatchOutbound({ profile: 'test', channel: 'sms', thread, content: 'hi' })
    expect(r.status).toBe('unconfigured')
    expect(r.via).toBe('sms-signalwire-shared')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('SHARED sms with no central token reports unconfigured (keeps local record)', async () => {
    vi.stubEnv('CENTRAL_MCP_TOKEN', '')
    const r = await dispatchOutbound({ profile: 'test', channel: 'sms', thread, content: 'hi' })
    expect(r.status).toBe('unconfigured')
    expect(r.via).toBe('sms-signalwire-shared')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('OWN sms with no profile creds reports unconfigured (does NOT fall back to shared)', async () => {
    mockConfig = withConfig({ default: 'shared', sms: 'own' })
    const r = await dispatchOutbound({ profile: 'test', channel: 'sms', thread, content: 'hi' })
    expect(r.status).toBe('unconfigured')
    expect(r.via).toBe('textmagic-own')
    // never hit central-mcp nor the provider (no creds present in test env)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('SHARED vapi requires a shared assistant id', async () => {
    vi.stubEnv('VAPI_ASSISTANT_ID', '')
    const r = await dispatchOutbound({ profile: 'test', channel: 'vapi', thread, content: 'hi' })
    expect(r.status).toBe('unconfigured')
    expect(r.via).toBe('vapi-shared')
  })

  it('SHARED tavus requires a shared persona id', async () => {
    vi.stubEnv('TAVUS_PERSONA_ID', '')
    const r = await dispatchOutbound({ profile: 'test', channel: 'tavus', thread, content: 'hi' })
    expect(r.status).toBe('unconfigured')
    expect(r.via).toBe('tavus-shared')
  })

  it('SHARED vapi dials via central-mcp vapi_create_call when a shared assistant is set', async () => {
    vi.stubEnv('VAPI_ASSISTANT_ID', 'asst_shared_1')
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => 'data: {"result":{"content":[{"text":"{\\"id\\":\\"call_7\\"}"}]}}\n',
    })
    const r = await dispatchOutbound({ profile: 'test', channel: 'vapi', thread, content: 'hello' })
    expect(r.status).toBe('sent')
    expect(r.via).toBe('vapi-shared')
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body)
    expect(body.params.name).toBe('vapi_create_call')
    expect(body.params.arguments.assistantId).toBe('asst_shared_1')
    expect(body.params.arguments.customerNumber).toBe('+12025550123')
  })
})
