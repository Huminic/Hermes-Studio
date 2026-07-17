import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  isDemoProfile,
  registerDemoContact,
  demoAllowlistHas,
  checkDemoAllowlist,
  normPhone,
  watermarkDemo,
  demoRateOk,
  demoRateRecord,
  resetDemoSession,
  resetDemoProfile,
  __resetDemoGuardForTests,
} from '@/server/demo-comms-guard'
import { checkCommGate } from '@/server/comms-gate'
import type { StudioConfig } from '@/lib/studio-config'

const DEMO = 'huminic-motors'
const PROD = 'serra-honda'
const VISITOR = '+15125550142'
const STRANGER = '+13105551234'
const SESSION = 'sess-abc'

// Minimal config exercising only the fields checkCommGate reads.
function cfg(overrides?: Record<string, unknown>): StudioConfig {
  return {
    comms: {
      outbound_enabled: true,
      channels: { sms: true, voice: true },
      // A window that EXCLUDES our fixed nowMs (below) so we can prove the
      // demo bypasses TCPA hours while prod does not.
      business_hours: { start: '09:00', end: '17:00', tz: 'America/Chicago' },
      sms_consent_check: false,
      vin_check: false,
      rate_caps: {},
      ...(overrides ?? {}),
    },
    federation: { read_scopes: [] },
  } as unknown as StudioConfig
}

// 03:00 UTC = 21:00-22:00 CT the prior day → outside the 09:00–17:00 window.
const NIGHT = Date.UTC(2026, 6, 18, 3, 0, 0)

let tmpRoot: string
beforeEach(() => {
  __resetDemoGuardForTests()
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-guard-'))
})
afterEach(() => {
  __resetDemoGuardForTests()
  fs.rmSync(tmpRoot, { recursive: true, force: true })
  delete process.env.OUTBOUND_LIVE_ENABLED
  delete process.env.PRELAUNCH_SMS_LOCK
  delete process.env.DEMO_TEST_RECIPIENTS
  vi.restoreAllMocks()
})

describe('demo-comms-guard (unit)', () => {
  it('marks only configured demo profiles', () => {
    expect(isDemoProfile(DEMO)).toBe(true)
    expect(isDemoProfile(PROD)).toBe(false)
  })

  it('normalizes US phones to 1XXXXXXXXXX', () => {
    expect(normPhone('+1 (512) 555-0142')).toBe('15125550142')
    expect(normPhone('512-555-0142')).toBe('15125550142')
    expect(normPhone('15125550142')).toBe('15125550142')
  })

  it('allowlists a registered contact and rejects strangers', () => {
    registerDemoContact(DEMO, SESSION, { phone: VISITOR, email: 'me@x.com' })
    expect(demoAllowlistHas(DEMO, VISITOR)).toBe(true)
    expect(demoAllowlistHas(DEMO, '(512) 555-0142')).toBe(true) // formatting-agnostic
    expect(demoAllowlistHas(DEMO, 'me@x.com')).toBe(true)
    expect(demoAllowlistHas(DEMO, STRANGER)).toBe(false)
    expect(demoAllowlistHas(DEMO, 'someone@else.com')).toBe(false)
  })

  it('never registers a contact for a non-demo profile', () => {
    registerDemoContact(PROD, SESSION, { phone: VISITOR })
    expect(demoAllowlistHas(PROD, VISITOR)).toBe(false)
  })

  it('expires registrations by TTL', () => {
    const now = 1_000_000
    registerDemoContact(DEMO, SESSION, { phone: VISITOR }, { ttlMs: 1000, nowMs: now })
    expect(demoAllowlistHas(DEMO, VISITOR, now + 500)).toBe(true)
    expect(demoAllowlistHas(DEMO, VISITOR, now + 1500)).toBe(false)
  })

  it('checkDemoAllowlist criticals on a stranger', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    registerDemoContact(DEMO, SESSION, { phone: VISITOR })
    expect(checkDemoAllowlist(DEMO, 'sms', VISITOR).ok).toBe(true)
    const bad = checkDemoAllowlist(DEMO, 'sms', STRANGER)
    expect(bad.ok).toBe(false)
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('CRITICAL BLOCK'))
  })

  it('watermarks idempotently', () => {
    expect(watermarkDemo('Hi there')).toBe('Hi there [Huminic demo]')
    expect(watermarkDemo('Hi there [Huminic demo]')).toBe('Hi there [Huminic demo]')
  })

  it('enforces per-session caps (10 SMS / 3 calls)', () => {
    for (let i = 0; i < 10; i++) {
      expect(demoRateOk(SESSION, 'sms')).toBe(true)
      demoRateRecord(SESSION, 'sms')
    }
    expect(demoRateOk(SESSION, 'sms')).toBe(false)
    for (let i = 0; i < 3; i++) {
      expect(demoRateOk(SESSION, 'call')).toBe(true)
      demoRateRecord(SESSION, 'call')
    }
    expect(demoRateOk(SESSION, 'call')).toBe(false)
  })

  it('allows a persistent DEMO_TEST_RECIPIENTS number (rep testing) with no session', () => {
    process.env.DEMO_TEST_RECIPIENTS = '+15125550142, rep@huminic.ai'
    expect(demoAllowlistHas(DEMO, VISITOR)).toBe(true) // rep number, no registration
    expect(demoAllowlistHas(DEMO, 'rep@huminic.ai')).toBe(true)
    expect(demoAllowlistHas(DEMO, STRANGER)).toBe(false)
  })

  it('reset purges session + profile state', () => {
    registerDemoContact(DEMO, SESSION, { phone: VISITOR })
    demoRateRecord(SESSION, 'sms')
    resetDemoSession(SESSION)
    expect(demoAllowlistHas(DEMO, VISITOR)).toBe(false)
    expect(demoRateOk(SESSION, 'sms')).toBe(true)
    registerDemoContact(DEMO, 'sess2', { phone: STRANGER })
    resetDemoProfile(DEMO)
    expect(demoAllowlistHas(DEMO, STRANGER)).toBe(false)
  })
})

describe('checkCommGate demo integration', () => {
  it('HARD-DROPS a non-visitor SMS for the demo profile even with outbound enabled', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    process.env.OUTBOUND_LIVE_ENABLED = 'true'
    registerDemoContact(DEMO, SESSION, { phone: VISITOR })
    const r = await checkCommGate({
      profile: DEMO,
      channel: 'sms',
      to: STRANGER,
      options: { config: cfg(), nowMs: NIGHT, profileRoot: tmpRoot },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.rule).toBe('demo-not-allowlisted')
  })

  it('ALLOWS the visitor SMS, bypassing prelaunch + business hours', async () => {
    process.env.OUTBOUND_LIVE_ENABLED = 'true'
    process.env.PRELAUNCH_SMS_LOCK = 'true' // would block a random number for prod
    registerDemoContact(DEMO, SESSION, { phone: VISITOR }, { nowMs: NIGHT })
    const r = await checkCommGate({
      profile: DEMO,
      channel: 'sms',
      to: VISITOR,
      options: { config: cfg(), nowMs: NIGHT, profileRoot: tmpRoot },
    })
    expect(r.ok).toBe(true)
  })

  it('proves the bypass is DEMO-ONLY: a prod profile is still gated', async () => {
    process.env.OUTBOUND_LIVE_ENABLED = 'true'
    // Same night-time send to the same visitor number, but on a PROD profile:
    // prelaunch lock off, so it reaches the business-hours gate and is blocked.
    const r = await checkCommGate({
      profile: PROD,
      channel: 'sms',
      to: VISITOR,
      options: { config: cfg(), nowMs: NIGHT, profileRoot: tmpRoot },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.rule).toBe('outside-business-hours')
  })

  it('bounds a DEMO CAMPAIGN to the test recipient (rep passes, a real contact is dropped)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    process.env.OUTBOUND_LIVE_ENABLED = 'true'
    process.env.DEMO_TEST_RECIPIENTS = VISITOR // the rep's own number
    // A campaign fans out via dispatchOutbound -> checkCommGate for each contact.
    const toRep = await checkCommGate({
      profile: DEMO,
      channel: 'sms',
      to: VISITOR,
      options: { config: cfg(), nowMs: NIGHT, profileRoot: tmpRoot },
    })
    const toRealContact = await checkCommGate({
      profile: DEMO,
      channel: 'sms',
      to: STRANGER,
      options: { config: cfg(), nowMs: NIGHT, profileRoot: tmpRoot },
    })
    expect(toRep.ok).toBe(true)
    expect(toRealContact.ok).toBe(false)
    if (!toRealContact.ok) expect(toRealContact.rule).toBe('demo-not-allowlisted')
  })

  it('still blocks demo sends when the global kill switch is off', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    delete process.env.OUTBOUND_LIVE_ENABLED
    registerDemoContact(DEMO, SESSION, { phone: VISITOR })
    const r = await checkCommGate({
      profile: DEMO,
      channel: 'sms',
      to: VISITOR,
      options: { config: cfg(), nowMs: NIGHT, profileRoot: tmpRoot },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.rule).toBe('outbound-disabled-global')
  })
})
