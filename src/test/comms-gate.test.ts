import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defaultStudioConfig, type StudioConfig } from '@/lib/studio-config'

vi.mock('@/server/comms-blacklist', () => ({ isBlacklisted: vi.fn(() => false) }))
vi.mock('@/server/comms-rate-limiter', () => ({
  checkAndRecord: vi.fn(() => ({ ok: true, remaining_minute: 9, remaining_hour: 9 })),
}))
const vinMock = vi.fn()
vi.mock('@/server/central-mcp', () => ({
  callCentralMcpTool: (...a: Array<unknown>) => vinMock(...a),
}))

import { checkCommGate, withinBusinessHours, leadOptedOut } from '@/server/comms-gate'
import { isBlacklisted } from '@/server/comms-blacklist'
import { checkAndRecord } from '@/server/comms-rate-limiter'

const HOUR_13_UTC = Date.UTC(2026, 5, 3, 13, 0, 0) // within 08:00–21:00
const HOUR_02_UTC = Date.UTC(2026, 5, 3, 2, 0, 0) // outside

function cfg(
  overrides: Partial<StudioConfig['comms']> = {},
  scopes: Array<string> = [],
  vinOverrides: Partial<StudioConfig['vin']> = {},
): StudioConfig {
  const c = defaultStudioConfig('t')
  c.federation = { read_scopes: scopes }
  // A VIN-scoped profile carries its Nexxus org UUID; the live DNC check is
  // keyed by it. Tests can omit it via vinOverrides to exercise the gap path.
  c.vin = { org_id: 'org-uuid-test', name_resolve_cap: 10, ...vinOverrides }
  c.comms = {
    outbound_enabled: true,
    channels: { sms: true, voice: true, video: true, email: true },
    business_hours: { tz: 'UTC', start: '08:00', end: '21:00' },
    vin_check: true,
    rate_caps: {},
    ...overrides,
  }
  return c
}

describe('checkCommGate — fail-closed layers', () => {
  beforeEach(() => {
    ;(isBlacklisted as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false)
    ;(checkAndRecord as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      ok: true,
      remaining_minute: 9,
      remaining_hour: 9,
    })
    vinMock.mockReset()
  })
  afterEach(() => vi.unstubAllEnvs())

  const base = { profile: 't', channel: 'sms' as const, to: '+12025550123' }

  it('blocks when the global kill switch is off', async () => {
    const r = await checkCommGate({ ...base, options: { config: cfg(), nowMs: HOUR_13_UTC } })
    expect(r).toMatchObject({ ok: false, rule: 'outbound-disabled-global' })
  })

  it('blocks when the profile outbound switch is off', async () => {
    vi.stubEnv('OUTBOUND_LIVE_ENABLED', 'true')
    const r = await checkCommGate({
      ...base,
      options: { config: cfg({ outbound_enabled: false }), nowMs: HOUR_13_UTC },
    })
    expect(r).toMatchObject({ ok: false, rule: 'outbound-disabled-profile' })
  })

  it('blocks when the channel is disabled', async () => {
    vi.stubEnv('OUTBOUND_LIVE_ENABLED', 'true')
    const r = await checkCommGate({
      ...base,
      options: {
        config: cfg({ channels: { sms: false, voice: true, video: true, email: true } }),
        nowMs: HOUR_13_UTC,
      },
    })
    expect(r).toMatchObject({ ok: false, rule: 'channel-disabled' })
  })

  it('blocks sms/voice outside business hours (and bypass overrides it)', async () => {
    vi.stubEnv('OUTBOUND_LIVE_ENABLED', 'true')
    const blocked = await checkCommGate({ ...base, options: { config: cfg(), nowMs: HOUR_02_UTC } })
    expect(blocked).toMatchObject({ ok: false, rule: 'outside-business-hours' })
    const bypass = await checkCommGate({
      ...base,
      options: { config: cfg(), nowMs: HOUR_02_UTC, bypassBusinessHours: true },
    })
    expect(bypass.ok).toBe(true)
  })

  it('blocks a blacklisted recipient', async () => {
    vi.stubEnv('OUTBOUND_LIVE_ENABLED', 'true')
    ;(isBlacklisted as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true)
    const r = await checkCommGate({ ...base, options: { config: cfg(), nowMs: HOUR_13_UTC } })
    expect(r).toMatchObject({ ok: false, rule: 'blacklisted' })
  })

  it('queries live VIN and blocks a do-not-contact lead (only when VIN scope present)', async () => {
    vi.stubEnv('OUTBOUND_LIVE_ENABLED', 'true')
    vinMock.mockResolvedValue({ ok: true, data: [{ phone: '+12025550123', doNotCall: true }] })
    const r = await checkCommGate({
      ...base,
      options: { config: cfg({}, ['vinsolutions:read']), nowMs: HOUR_13_UTC },
    })
    expect(r).toMatchObject({ ok: false, rule: 'vin-dnc' })
    expect(vinMock).toHaveBeenCalledWith('vin_query_leads', expect.objectContaining({ phone: '+12025550123' }))
  })

  it('passes the Nexxus org UUID (not the profile slug) to the VIN query', async () => {
    vi.stubEnv('OUTBOUND_LIVE_ENABLED', 'true')
    vinMock.mockResolvedValue({ ok: true, data: [] })
    await checkCommGate({
      ...base,
      options: { config: cfg({}, ['vinsolutions:read']), nowMs: HOUR_13_UTC },
    })
    expect(vinMock).toHaveBeenCalledWith(
      'vin_query_leads',
      expect.objectContaining({ orgId: 'org-uuid-test' }),
    )
  })

  it('fails CLOSED (and skips the VIN call) when the org UUID is unconfigured', async () => {
    vi.stubEnv('OUTBOUND_LIVE_ENABLED', 'true')
    vi.stubEnv('VIN_ORG_ID', '')
    const r = await checkCommGate({
      ...base,
      options: { config: cfg({}, ['vinsolutions:read'], { org_id: undefined }), nowMs: HOUR_13_UTC },
    })
    expect(r).toMatchObject({ ok: false, rule: 'vin-unavailable' })
    expect(vinMock).not.toHaveBeenCalled()
  })

  it('fails CLOSED when the VIN lookup errors (default)', async () => {
    vi.stubEnv('OUTBOUND_LIVE_ENABLED', 'true')
    vinMock.mockResolvedValue({ ok: false, error: 'vin_query_leads not available' })
    const r = await checkCommGate({
      ...base,
      options: { config: cfg({}, ['vinsolutions:read']), nowMs: HOUR_13_UTC },
    })
    expect(r).toMatchObject({ ok: false, rule: 'vin-unavailable' })
  })

  it('fails OPEN on VIN error only when vin_check_fail_open is set', async () => {
    vi.stubEnv('OUTBOUND_LIVE_ENABLED', 'true')
    vinMock.mockResolvedValue({ ok: false, error: 'vin_query_leads not available' })
    const r = await checkCommGate({
      ...base,
      options: {
        config: cfg({ vin_check_fail_open: true }, ['vinsolutions:read']),
        nowMs: HOUR_13_UTC,
      },
    })
    expect(r.ok).toBe(true)
  })

  it('does NOT call VIN when the profile has no VIN scope', async () => {
    vi.stubEnv('OUTBOUND_LIVE_ENABLED', 'true')
    const r = await checkCommGate({ ...base, options: { config: cfg(), nowMs: HOUR_13_UTC } })
    expect(r.ok).toBe(true)
    expect(vinMock).not.toHaveBeenCalled()
  })

  it('blocks when the rate cap is exceeded', async () => {
    vi.stubEnv('OUTBOUND_LIVE_ENABLED', 'true')
    ;(checkAndRecord as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      ok: false,
      rule: 'rate-cap-exceeded',
      reason: 'cap hit',
      remaining_minute: 0,
      remaining_hour: 0,
    })
    const r = await checkCommGate({ ...base, options: { config: cfg(), nowMs: HOUR_13_UTC } })
    expect(r).toMatchObject({ ok: false, rule: 'rate-cap-exceeded' })
  })

  it('passes a clean send', async () => {
    vi.stubEnv('OUTBOUND_LIVE_ENABLED', 'true')
    const r = await checkCommGate({ ...base, options: { config: cfg(), nowMs: HOUR_13_UTC } })
    expect(r.ok).toBe(true)
  })
})

describe('withinBusinessHours', () => {
  it('handles a normal day window', () => {
    const bh = { tz: 'UTC', start: '08:00', end: '21:00' }
    expect(withinBusinessHours(bh, HOUR_13_UTC)).toBe(true)
    expect(withinBusinessHours(bh, HOUR_02_UTC)).toBe(false)
  })
})

describe('leadOptedOut', () => {
  it('detects common DNC shapes and ignores clean leads', () => {
    expect(leadOptedOut([{ doNotCall: true }])).toBe(true)
    expect(leadOptedOut({ leads: [{ status: 'DNC' }] })).toBe(true)
    expect(leadOptedOut([{ optOut: 'yes' }])).toBe(true)
    expect(leadOptedOut([{ name: 'Bob', status: 'active' }])).toBe(false)
    expect(leadOptedOut(null)).toBe(false)
  })
})
