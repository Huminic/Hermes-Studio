import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CentralMcpResult } from '@/server/central-mcp'
import type { AdapterResult } from '@/server/messaging-adapters'
import type { StudioConfig } from '@/lib/studio-config'
import type { TriggerKind, TriggerStore } from '@/server/vin-watcher'

let tmpHome: string

beforeEach(async () => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'vin-watcher-test-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  const dir = path.join(tmpHome, '.hermes', 'profiles', 'serra')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'studio.yaml'), 'branding:\n  persona_name: Serra Honda\n')
  const mod = await import('@/server/messaging-hub-store')
  mod._resetForTests()
  const bus = await import('@/server/messaging-hub-bus')
  bus._resetMessagingBus()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

const NOW = Date.parse('2026-06-03T15:00:00Z') // 11:00 ET — in business hours

/** Build a studio config with the watcher ON and a configured orgId. */
function watcherConfig(overrides?: Partial<StudioConfig['vin']['watcher']>): StudioConfig {
  return {
    branding: { persona_name: 'Serra Honda' },
    menu: {
      chat: true,
      knowledge: true,
      tools: true,
      data: true,
      comms: true,
      campaigns: true,
    },
    agent_picker: { visible_agents: [] },
    tools_widget: { show_embed_snippet: true, show_live_demo: true, consult: false },
    widgets: [],
    autonomous_reply_defaults: {
      enabled: false,
      business_hours_only: false,
      max_agent_turns: 3,
      channels: [],
    },
    federation: { read_scopes: [] },
    vin: {
      org_id: 'org-uuid-serra',
      name_resolve_cap: 10,
      watcher: {
        enabled: true,
        dealer_name: 'Serra Honda',
        synced_within_min: 30,
        created_within_hours: 4,
        immediate_dedup_hours: 24,
        checkin_after_min: 1440,
        checkin_window_min: 30,
        checkin_dedup_hours: 48,
        poll_limit: 10,
        ...overrides,
      },
    },
    lead_notifications: {},
    channel_credentials: { default: 'shared' },
    comms: {
      outbound_enabled: true,
      channels: { sms: true, voice: true, video: true, email: true },
      business_hours: { tz: 'America/New_York', start: '08:00', end: '21:00' },
      vin_check: true,
      vin_check_fail_open: false,
      rate_caps: {},
    },
  } as StudioConfig
}

/** vin_query_leads returns one fresh lead (href contact); vin_get_contact resolves it. */
function callStub(opts: {
  leads?: Array<Record<string, unknown>>
  contact?: Record<string, unknown>
}) {
  const leads = opts.leads ?? [
    {
      contact: '/contacts/id/77',
      leadId: 'L77',
      // Third-party marketplace source — Trigger 1's intended audience.
      leadSource: 'Cars.com',
      vehicleOfInterest: '2026 Honda Civic',
      createdUtc: new Date(NOW - 10 * 60_000).toISOString(),
      syncedUtc: new Date(NOW - 5 * 60_000).toISOString(),
    },
  ]
  const contact =
    opts.contact ?? {
      firstName: 'Dana',
      lastName: 'Reyes',
      id: 77,
      ContactInformation: { Phones: [{ PhoneType: 'Cell', Phone: '+14155550100' }], Emails: [] },
    }
  return vi.fn(async (tool: string): Promise<CentralMcpResult> => {
    if (tool === 'vin_query_leads') return { ok: true, data: { leads } }
    if (tool === 'vin_get_contact') return { ok: true, data: contact }
    return { ok: false, error: `unexpected tool ${tool}` }
  })
}

/** In-memory trigger ledger for deterministic dedup/check-in tests. */
function memTriggerStore(seed?: Array<[string, TriggerKind, number]>): TriggerStore {
  const m = new Map<string, number>()
  for (const [p, k, t] of seed ?? []) m.set(`${p}|${k}`, t)
  return {
    lastFire: (p, k) => m.get(`${p}|${k}`) ?? null,
    record: (p, k, t) => void m.set(`${p}|${k}`, t),
  }
}

const sentResult: AdapterResult = { status: 'sent', via: 'sms-textmagic-shared', external_id: 'x1' }

type DispatchArg = {
  profile: string
  channel: string
  thread: { contact_handle: string }
  content: string
}
/** A dispatch mock with a typed single-arg signature so mock.calls narrows. */
function dispatchMock() {
  return vi.fn(async (_input: DispatchArg): Promise<AdapterResult> => sentResult)
}

describe('tickVinWatcher — immediate trigger', () => {
  it('texts one resolved lead with first name + dealer name in the immediate template', async () => {
    const { tickVinWatcher, renderImmediate } = await import('@/server/vin-watcher')
    const dispatch = dispatchMock()
    const res = await tickVinWatcher({
      profile: 'serra',
      now: NOW,
      config: watcherConfig(),
      deps: {
        call: callStub({}),
        dispatch,
        triggerStore: memTriggerStore(),
        knownPhones: () => new Set(),
      },
    })

    expect(res.sent).toBe(1)
    expect(res.queued).toBe(0)
    expect(dispatch).toHaveBeenCalledTimes(1)
    const arg = dispatch.mock.calls[0][0]
    expect(arg.channel).toBe('sms')
    expect(arg.thread.contact_handle).toBe('+14155550100')
    expect(arg.content).toBe(renderImmediate('Dana', 'Serra Honda', '2026 Honda Civic'))
    expect(arg.content).toContain('Hi Dana, this is Serra Honda')
    // resolved-name path was exercised
    expect(res.resolved).toBe(1)
  })

  it('dedup: a second tick (trigger already recorded) does not re-send', async () => {
    const { tickVinWatcher } = await import('@/server/vin-watcher')
    const store = memTriggerStore()
    const deps = {
      call: callStub({}),
      dispatch: dispatchMock(),
      triggerStore: store,
      knownPhones: () => new Set<string>(),
    }
    const first = await tickVinWatcher({ profile: 'serra', now: NOW, config: watcherConfig(), deps })
    expect(first.sent).toBe(1)

    const dispatch2 = dispatchMock()
    const second = await tickVinWatcher({
      profile: 'serra',
      now: NOW + 60_000,
      config: watcherConfig(),
      deps: { ...deps, dispatch: dispatch2 },
    })
    // Once the immediate fired, a re-poll of the same lead never re-sends:
    // the phone now has a recorded first-contact, so it can only advance to the
    // (not-yet-due) check-in path — never a second immediate.
    expect(dispatch2).not.toHaveBeenCalled()
    expect(second.sent).toBe(0)
    expect(second.outcomes[0].action).toBe('skipped')
    expect(second.outcomes[0].kind).not.toBe('immediate')
  })

  it('dedup vs hub: a phone with an existing thread is skipped (already contacted)', async () => {
    const { tickVinWatcher } = await import('@/server/vin-watcher')
    const dispatch = dispatchMock()
    const res = await tickVinWatcher({
      profile: 'serra',
      now: NOW,
      config: watcherConfig(),
      deps: {
        call: callStub({}),
        dispatch,
        triggerStore: memTriggerStore(),
        knownPhones: () => new Set(['+14155550100']),
      },
    })
    expect(dispatch).not.toHaveBeenCalled()
    expect(res.sent).toBe(0)
    expect(res.outcomes[0].reason).toMatch(/already/)
  })

  it('out-of-hours: immediate trigger is QUEUED, not sent', async () => {
    const { tickVinWatcher } = await import('@/server/vin-watcher')
    const dispatch = dispatchMock()
    const midnightEt = Date.parse('2026-06-03T05:00:00Z') // 01:00 ET — out of hours
    const leads = [
      {
        contact: '/contacts/id/77',
        leadSource: 'AutoTrader',
        createdUtc: new Date(midnightEt - 10 * 60_000).toISOString(),
        syncedUtc: new Date(midnightEt - 5 * 60_000).toISOString(),
      },
    ]
    const res = await tickVinWatcher({
      profile: 'serra',
      now: midnightEt,
      config: watcherConfig(),
      deps: {
        call: callStub({ leads }),
        dispatch,
        triggerStore: memTriggerStore(),
        knownPhones: () => new Set(),
      },
    })
    expect(dispatch).not.toHaveBeenCalled()
    expect(res.sent).toBe(0)
    expect(res.queued).toBe(1)
    expect(res.outcomes[0].action).toBe('queued')
    expect(res.outcomes[0].reason).toMatch(/07:00/)
  })
})

describe('tickVinWatcher — opt-in + config gates', () => {
  it('disabled watcher is skipped cleanly (no broker call)', async () => {
    const { tickVinWatcher } = await import('@/server/vin-watcher')
    const call = callStub({})
    const res = await tickVinWatcher({
      profile: 'serra',
      now: NOW,
      config: watcherConfig({ enabled: false }),
      deps: { call, dispatch: dispatchMock(), triggerStore: memTriggerStore() },
    })
    expect(call).not.toHaveBeenCalled()
    expect(res.skipped).toMatch(/disabled/)
  })

  it('unconfigured orgId is skipped cleanly (no throw, no send)', async () => {
    const { tickVinWatcher } = await import('@/server/vin-watcher')
    const cfg = watcherConfig()
    ;(cfg.vin as { org_id?: string }).org_id = undefined
    vi.stubEnv('VIN_ORG_ID', '')
    const call = callStub({})
    const res = await tickVinWatcher({
      profile: 'serra',
      now: NOW,
      config: cfg,
      deps: { call, dispatch: dispatchMock(), triggerStore: memTriggerStore() },
    })
    expect(call).not.toHaveBeenCalled()
    expect(res.skipped).toMatch(/unconfigured/)
  })
})

describe('tickVinWatcher — 24h check-in trigger', () => {
  it('fires the check-in template ~1440 min after first contact', async () => {
    const { tickVinWatcher, renderCheckin } = await import('@/server/vin-watcher')
    const phone = '+14155550100'
    const immediateAt = NOW - 1440 * 60_000 // exactly 24h ago
    // The lead created window doesn't matter for check-in; provide a stale lead.
    const leads = [{ contact: '/contacts/id/77', vehicleOfInterest: '2026 Honda Civic' }]
    const dispatch = dispatchMock()
    const res = await tickVinWatcher({
      profile: 'serra',
      now: NOW,
      config: watcherConfig(),
      deps: {
        call: callStub({ leads }),
        dispatch,
        triggerStore: memTriggerStore([[phone, 'immediate', immediateAt]]),
        knownPhones: () => new Set([phone]), // already contacted; check-in still fires
      },
    })
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(res.sent).toBe(1)
    expect(res.outcomes[0].kind).toBe('checkin')
    expect(dispatch.mock.calls[0][0].content).toBe(
      renderCheckin('Dana', 'Serra Honda', '2026 Honda Civic'),
    )
  })

  it('does not fire check-in before the window (e.g. 100 min after first contact)', async () => {
    const { tickVinWatcher } = await import('@/server/vin-watcher')
    const phone = '+14155550100'
    const leads = [{ contact: '/contacts/id/77' }]
    const dispatch = dispatchMock()
    const res = await tickVinWatcher({
      profile: 'serra',
      now: NOW,
      config: watcherConfig(),
      deps: {
        call: callStub({ leads }),
        dispatch,
        triggerStore: memTriggerStore([[phone, 'immediate', NOW - 100 * 60_000]]),
        knownPhones: () => new Set([phone]),
      },
    })
    expect(dispatch).not.toHaveBeenCalled()
    expect(res.sent).toBe(0)
  })
})

describe('tickVinWatcher — Trigger 1 third-party gate (workstream G)', () => {
  it('SKIPS a first-party (our own widget/site) lead when third_party_only is on', async () => {
    const { tickVinWatcher } = await import('@/server/vin-watcher')
    const leads = [
      {
        contact: '/contacts/id/77',
        leadSource: 'Dealer Website',
        createdUtc: new Date(NOW - 10 * 60_000).toISOString(),
        syncedUtc: new Date(NOW - 5 * 60_000).toISOString(),
      },
    ]
    const dispatch = dispatchMock()
    const res = await tickVinWatcher({
      profile: 'serra',
      now: NOW,
      config: watcherConfig(),
      deps: { call: callStub({ leads }), dispatch, triggerStore: memTriggerStore(), knownPhones: () => new Set() },
    })
    expect(dispatch).not.toHaveBeenCalled()
    expect(res.sent).toBe(0)
    expect(res.outcomes[0].reason).toMatch(/third-party-only.*first_party/)
  })

  it('SKIPS a lead with no source (unknown) — fail-closed', async () => {
    const { tickVinWatcher } = await import('@/server/vin-watcher')
    const leads = [
      {
        contact: '/contacts/id/77',
        createdUtc: new Date(NOW - 10 * 60_000).toISOString(),
        syncedUtc: new Date(NOW - 5 * 60_000).toISOString(),
      },
    ]
    const dispatch = dispatchMock()
    const res = await tickVinWatcher({
      profile: 'serra',
      now: NOW,
      config: watcherConfig(),
      deps: { call: callStub({ leads }), dispatch, triggerStore: memTriggerStore(), knownPhones: () => new Set() },
    })
    expect(dispatch).not.toHaveBeenCalled()
    expect(res.outcomes[0].reason).toMatch(/third-party-only.*unknown/)
  })

  it('SKIPS an unrecognized named source (fail-closed, not auto-third-party)', async () => {
    const { tickVinWatcher } = await import('@/server/vin-watcher')
    const leads = [
      {
        contact: '/contacts/id/77',
        leadSource: 'Some Random Provider XYZ',
        createdUtc: new Date(NOW - 10 * 60_000).toISOString(),
        syncedUtc: new Date(NOW - 5 * 60_000).toISOString(),
      },
    ]
    const dispatch = dispatchMock()
    const res = await tickVinWatcher({
      profile: 'serra',
      now: NOW,
      config: watcherConfig(),
      deps: { call: callStub({ leads }), dispatch, triggerStore: memTriggerStore(), knownPhones: () => new Set() },
    })
    expect(dispatch).not.toHaveBeenCalled()
    expect(res.outcomes[0].reason).toMatch(/third-party-only.*unknown/)
  })

  it('FIRES for any lead when third_party_only is turned off', async () => {
    const { tickVinWatcher } = await import('@/server/vin-watcher')
    const leads = [
      {
        contact: '/contacts/id/77',
        leadSource: 'Dealer Website',
        createdUtc: new Date(NOW - 10 * 60_000).toISOString(),
        syncedUtc: new Date(NOW - 5 * 60_000).toISOString(),
      },
    ]
    const cfg = watcherConfig()
    // Override the sms_triggers gate off for this profile.
    ;(cfg as { sms_triggers?: unknown }).sms_triggers = {
      domain: 'sales',
      trigger1: { enabled: true, third_party_only: false, template_sales: '', template_service: '' },
      trigger2: { enabled: false, window_min: 1440, template_sales: '', template_service: '' },
    }
    const dispatch = dispatchMock()
    const res = await tickVinWatcher({
      profile: 'serra',
      now: NOW,
      config: cfg,
      deps: { call: callStub({ leads }), dispatch, triggerStore: memTriggerStore(), knownPhones: () => new Set() },
    })
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(res.sent).toBe(1)
  })
})

describe('tickVinWatcher — stop-on-reply (workstream G)', () => {
  it('SKIPS the 24h check-in when the customer already replied after first contact', async () => {
    const { tickVinWatcher } = await import('@/server/vin-watcher')
    const hub = await import('@/server/messaging-hub-store')
    const phone = '+14155550100'
    const immediateAt = NOW - 1440 * 60_000 // check-in is due
    // Seed an inbound reply AFTER the first contact → conversation is active.
    const thread = hub.getOrCreateThread({
      profile: 'serra',
      domain: 'sales',
      channel: 'sms',
      contact_handle: phone,
      subject: 'lead follow-up',
    })
    // appendMessage stamps the current time, which is after immediateAt — so
    // this inbound counts as a reply received after the first contact.
    hub.appendMessage({
      thread_id: thread.id,
      direction: 'inbound',
      role: 'user',
      channel: 'sms',
      content: 'Yes, tomorrow at 5 works',
      author: phone,
    })
    const leads = [{ contact: '/contacts/id/77', vehicleOfInterest: '2026 Honda Civic' }]
    const dispatch = dispatchMock()
    const res = await tickVinWatcher({
      profile: 'serra',
      now: NOW,
      config: watcherConfig(),
      deps: {
        call: callStub({ leads }),
        dispatch,
        triggerStore: memTriggerStore([[phone, 'immediate', immediateAt]]),
        knownPhones: () => new Set([phone]),
      },
    })
    expect(dispatch).not.toHaveBeenCalled()
    expect(res.sent).toBe(0)
    expect(res.outcomes[0].kind).toBe('checkin')
    expect(res.outcomes[0].reason).toMatch(/stop-on-reply/)
  })
})

describe('tickVinWatcher — pre-launch safe-test allowlist', () => {
  it('PRELAUNCH_SMS_LOCK blocks a non-allowlisted recipient', async () => {
    const { tickVinWatcher } = await import('@/server/vin-watcher')
    vi.stubEnv('PRELAUNCH_SMS_LOCK', 'true')
    vi.stubEnv('PRELAUNCH_TEST_RECIPIENTS', '+14126546500') // operator only
    const dispatch = dispatchMock()
    const res = await tickVinWatcher({
      profile: 'serra',
      now: NOW,
      config: watcherConfig(),
      deps: {
        call: callStub({}), // lead phone +14155550100 — not the operator
        dispatch,
        triggerStore: memTriggerStore(),
        knownPhones: () => new Set(),
      },
    })
    expect(dispatch).not.toHaveBeenCalled()
    expect(res.blocked).toBe(1)
    expect(res.outcomes[0].action).toBe('blocked')
    expect(res.outcomes[0].reason).toMatch(/prelaunch/i)
  })

  it('PRELAUNCH_SMS_LOCK allows the operator number through to dispatch', async () => {
    const { tickVinWatcher } = await import('@/server/vin-watcher')
    vi.stubEnv('PRELAUNCH_SMS_LOCK', 'true')
    vi.stubEnv('PRELAUNCH_TEST_RECIPIENTS', '+14155550100')
    const dispatch = dispatchMock()
    const res = await tickVinWatcher({
      profile: 'serra',
      now: NOW,
      config: watcherConfig(),
      deps: {
        call: callStub({}),
        dispatch,
        triggerStore: memTriggerStore(),
        knownPhones: () => new Set(),
      },
    })
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(res.sent).toBe(1)
  })
})
