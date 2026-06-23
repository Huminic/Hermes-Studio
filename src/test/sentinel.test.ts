import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  runSentinelPass,
  commsCronLivenessCheck,
  threadSlaCheck,
  integrationHealthCheck,
  vinHealthCheck,
  notificationsDeliveryCheck,
  automationsFiringCheck,
  dataCollectionCheck,
  conversationOpsCheck,
  conversationQualityCheck,
  widgetSyntheticCheck,
  appHealthCheck,
  listSentinelFindings,
  type SentinelCheck,
  type SentinelStore,
  type Finding,
  type BrainLike,
} from '@/server/sentinel'
import { openBrain } from '@/server/brain-store'

const HOUR_MS = 60 * 60_000

/** A fake SentinelStore — all reads benign by default; override per test. */
function fakeStore(over: Partial<SentinelStore> = {}): SentinelStore {
  return {
    listOpenThreads: () => [],
    getThread: () => null,
    countCommsErrors: () => ({ count: 0, byChannel: {} }),
    countStuckAutomations: () => ({ automations: 0, flows: 0 }),
    countReplyJobs: () => ({ failed: 0, queued: 0 }),
    latestInboundAt: () => null,
    sampleRecentThreads: () => [],
    ...over,
  }
}

const okCall = (async () => ({ ok: true as const, data: {} })) as never
const tmUnconfigured = async () => ({ ok: false as const, unconfigured: true })

const NOW = 1_750_000_000_000
const HOUR = 60 * 60_000

let tmpHome: string
let brain: BrainLike

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-test-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  fs.mkdirSync(path.join(tmpHome, '.hermes', 'profiles', '_sentinel'), {
    recursive: true,
  })
  brain = openBrain('_sentinel') as unknown as BrainLike
  // Seed a recent digest timestamp so the always-on daily digest does not fire
  // in alert-focused tests (the digest tests clear it explicitly).
  brain.exec(`CREATE TABLE IF NOT EXISTS sentinel_meta (k TEXT PRIMARY KEY, v INTEGER)`)
  brain.run(
    `INSERT INTO sentinel_meta (k, v) VALUES ('last_heartbeat', ?)
     ON CONFLICT(k) DO UPDATE SET v=excluded.v`,
    NOW,
  )
})

const FAKE_STATS = {
  cpuLoad1: 1,
  cpuCores: 4,
  cpuPct: 25,
  memUsedGb: 8,
  memTotalGb: 16,
  memUsedPct: 50,
  diskUsedGb: 20,
  diskTotalGb: 100,
  diskUsedPct: 20,
  uptimeSec: 90_000,
}
const OK_BACKUP = { ok: true, dbCount: 3, bytes: 1_500_000, dir: '/x', at: NOW, errors: [] }
afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

function emailSink() {
  const sent: Array<{ to: Array<string>; subject: string; html: string }> = []
  return {
    sent,
    fn: async (i: { to: Array<string>; subject: string; html: string }) => {
      sent.push(i)
      return { ok: true as const }
    },
  }
}

function fakeCheck(findings: Array<Finding>): SentinelCheck {
  return { name: 'fake', category: 'test', scope: 'system', run: async () => findings }
}

const CRIT: Finding = {
  key: 'k1',
  severity: 'critical',
  category: 'test',
  title: 'boom',
  detail: 'something broke',
  profile: '_system',
}

describe('sentinel engine', () => {
  it('alerts on a new finding and records it', async () => {
    const email = emailSink()
    const s = await runSentinelPass({
      brain,
      profiles: [],
      checks: [fakeCheck([CRIT])],
      sendEmail: email.fn,
      alertTo: ['op@example.com'],
      now: NOW,
    })
    expect(s.findings).toHaveLength(1)
    expect(s.alertsSent).toBe(1)
    expect(s.healthy).toBe(false)
    expect(email.sent).toHaveLength(1)
    expect(email.sent[0].subject).toContain('critical')
  })

  it('does not re-alert the same open finding within the throttle window', async () => {
    const email = emailSink()
    const opts = {
      brain,
      profiles: [],
      checks: [fakeCheck([CRIT])],
      sendEmail: email.fn,
      alertTo: ['op@example.com'],
      reAlertMs: 6 * HOUR,
    }
    await runSentinelPass({ ...opts, now: NOW })
    const s2 = await runSentinelPass({ ...opts, now: NOW + 60_000 })
    expect(s2.alertsSent).toBe(0)
    expect(email.sent).toHaveLength(1)
  })

  it('re-alerts after the throttle window elapses', async () => {
    const email = emailSink()
    const opts = {
      brain,
      profiles: [],
      checks: [fakeCheck([CRIT])],
      sendEmail: email.fn,
      alertTo: ['op@example.com'],
      reAlertMs: 6 * HOUR,
    }
    await runSentinelPass({ ...opts, now: NOW })
    const s2 = await runSentinelPass({ ...opts, now: NOW + 7 * HOUR })
    expect(s2.alertsSent).toBe(1)
    expect(email.sent).toHaveLength(2)
  })

  it('marks a finding resolved when it no longer appears', async () => {
    const email = emailSink()
    await runSentinelPass({
      brain,
      profiles: [],
      checks: [fakeCheck([CRIT])],
      sendEmail: email.fn,
      alertTo: ['op@example.com'],
      now: NOW,
    })
    const s2 = await runSentinelPass({
      brain,
      profiles: [],
      checks: [fakeCheck([])],
      sendEmail: email.fn,
      alertTo: ['op@example.com'],
      now: NOW + 1000,
      heartbeatMs: 24 * HOUR,
    })
    expect(s2.resolved).toBe(1)
    expect(s2.healthy).toBe(true)
  })

  it('does not email when no alert recipient is configured (still records)', async () => {
    const email = emailSink()
    const s = await runSentinelPass({
      brain,
      profiles: [],
      checks: [fakeCheck([CRIT])],
      sendEmail: email.fn,
      alertTo: [],
      now: NOW,
    })
    expect(email.sent).toHaveLength(0)
    expect(s.alertsSent).toBe(0)
    expect(s.findings).toHaveLength(1)
  })

  it('never throws — a failing check is captured and the pass continues', async () => {
    const bad: SentinelCheck = {
      name: 'bad',
      category: 'test',
      scope: 'system',
      run: async () => {
        throw new Error('kaboom')
      },
    }
    const s = await runSentinelPass({
      brain,
      profiles: [],
      checks: [bad, fakeCheck([CRIT])],
      sendEmail: emailSink().fn,
      alertTo: ['op@example.com'],
      now: NOW,
    })
    expect(s.errors.some((e) => e.check === 'bad')).toBe(true)
    expect(s.findings).toHaveLength(1)
  })

  it('exposes findings via the in-app feed reader (open vs all)', async () => {
    await runSentinelPass({
      brain,
      profiles: [],
      checks: [fakeCheck([CRIT])],
      alertTo: [],
      now: NOW,
    })
    const open = listSentinelFindings({ brain, status: 'open' })
    expect(open.map((r) => r.key)).toContain('k1')
    // clears next pass → no longer 'open', but present under 'all'
    await runSentinelPass({
      brain,
      profiles: [],
      checks: [fakeCheck([])],
      alertTo: [],
      now: NOW + 1000,
    })
    expect(listSentinelFindings({ brain, status: 'open' })).toHaveLength(0)
    expect(listSentinelFindings({ brain, status: 'all' }).map((r) => r.key)).toContain('k1')
  })

  it('sends a daily digest once per window with stats + backup, color-coded', async () => {
    const email = emailSink()
    brain.run(`DELETE FROM sentinel_meta WHERE k='last_heartbeat'`)
    const opts = {
      brain,
      profiles: [],
      checks: [fakeCheck([])],
      sendEmail: email.fn,
      alertTo: ['op@example.com'],
      heartbeatMs: 24 * HOUR,
      sampleStats: () => FAKE_STATS,
      runBackup: () => OK_BACKUP,
    }
    const s1 = await runSentinelPass({ ...opts, now: NOW })
    const s2 = await runSentinelPass({ ...opts, now: NOW + HOUR })
    expect(s1.digestSent).toBe(true)
    expect(s2.digestSent).toBe(false)
    expect(email.sent).toHaveLength(1)
    expect(email.sent[0].subject).toContain('daily digest')
    expect(email.sent[0].html).toContain('Backup')
    expect(email.sent[0].html).toContain('25%') // cpu card
    expect(email.sent[0].html).toContain('Uptime')
  })

  it('daily digest reflects open issues + a failed backup', async () => {
    const email = emailSink()
    brain.run(`DELETE FROM sentinel_meta WHERE k='last_heartbeat'`)
    const s = await runSentinelPass({
      brain,
      profiles: [],
      checks: [fakeCheck([CRIT])],
      sendEmail: email.fn,
      alertTo: ['op@example.com'],
      heartbeatMs: 24 * HOUR,
      sampleStats: () => FAKE_STATS,
      runBackup: () => ({ ok: false, dbCount: 0, bytes: 0, dir: null, at: NOW, errors: ['disk full'] }),
      now: NOW,
    })
    expect(s.digestSent).toBe(true)
    const digest = email.sent.find((e) => e.subject.includes('daily digest'))
    expect(digest?.subject).toContain('1 open issue')
    expect(digest?.html).toContain('backup FAILED')
  })
})

describe('sentinel built-in checks', () => {
  it('comms liveness: silent when comms tick is disabled (monitor-only)', async () => {
    delete process.env.COMMS_TICK_ENABLED
    const s = await runSentinelPass({
      brain,
      profiles: [],
      checks: [commsCronLivenessCheck],
      alertTo: [],
      now: NOW,
    })
    expect(s.findings).toHaveLength(0)
  })

  it('comms liveness: critical when no heartbeat exists (comms expected)', async () => {
    process.env.COMMS_TICK_ENABLED = 'true'
    try {
      const s = await runSentinelPass({
        brain,
        profiles: [],
        checks: [commsCronLivenessCheck],
        alertTo: [],
        now: NOW,
      })
      expect(s.findings).toHaveLength(1)
      expect(s.findings[0].key).toBe('comms-pipeline:no-heartbeat')
      expect(s.findings[0].severity).toBe('critical')
    } finally {
      delete process.env.COMMS_TICK_ENABLED
    }
  })

  it('comms liveness: stale heartbeat is critical, fresh is healthy', async () => {
    process.env.COMMS_TICK_ENABLED = 'true'
    brain.exec(`CREATE TABLE IF NOT EXISTS sentinel_meta (k TEXT PRIMARY KEY, v INTEGER)`)
    // stale (20m old)
    brain.run(
      `INSERT INTO sentinel_meta (k, v) VALUES ('comms_heartbeat', ?)
       ON CONFLICT(k) DO UPDATE SET v=excluded.v`,
      NOW - 20 * 60_000,
    )
    const stale = await runSentinelPass({
      brain,
      profiles: [],
      checks: [commsCronLivenessCheck],
      alertTo: [],
      now: NOW,
    })
    expect(stale.findings[0]?.key).toBe('comms-pipeline:stale-heartbeat')

    // fresh (1m old)
    brain.run(
      `INSERT INTO sentinel_meta (k, v) VALUES ('comms_heartbeat', ?)
       ON CONFLICT(k) DO UPDATE SET v=excluded.v`,
      NOW - 60_000,
    )
    const fresh = await runSentinelPass({
      brain,
      profiles: [],
      checks: [commsCronLivenessCheck],
      alertTo: [],
      now: NOW,
    })
    expect(fresh.findings).toHaveLength(0)
    delete process.env.COMMS_TICK_ENABLED
  })

  it('integration health: warns per provider when probes fail (no fabrication)', async () => {
    const call = (async () => ({ ok: false as const, error: 'broker down' })) as never
    const s = await runSentinelPass({
      brain,
      profiles: [],
      checks: [integrationHealthCheck],
      call,
      alertTo: [],
      now: NOW,
    })
    expect(s.findings.map((f) => f.key).sort()).toEqual([
      'integration:tavus:unreachable',
      'integration:vapi:unreachable',
    ])
  })

  it('integration health: clean when probes succeed', async () => {
    const call = (async () => ({ ok: true as const, data: {} })) as never
    const s = await runSentinelPass({
      brain,
      profiles: [],
      checks: [integrationHealthCheck],
      call,
      alertTo: [],
      now: NOW,
    })
    expect(s.findings).toHaveLength(0)
  })

  it('integration health: skips (no alarm) when a provider is unconfigured', async () => {
    const call = (async () => ({
      ok: false as const,
      unconfigured: true,
      error: 'no token',
    })) as never
    const s = await runSentinelPass({
      brain,
      profiles: [],
      checks: [integrationHealthCheck],
      call,
      alertTo: [],
      now: NOW,
    })
    expect(s.findings).toHaveLength(0)
  })

  it('app-health: warns when the last comms pass recorded errors, clean otherwise', async () => {
    const clean = await runSentinelPass({
      brain,
      profiles: [],
      checks: [appHealthCheck],
      alertTo: [],
      now: NOW,
    })
    expect(clean.findings).toHaveLength(0)

    brain.exec(`CREATE TABLE IF NOT EXISTS sentinel_meta (k TEXT PRIMARY KEY, v INTEGER)`)
    const put = (k: string, v: number) =>
      brain.run(
        `INSERT INTO sentinel_meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`,
        k,
        v,
      )
    put('comms_error_count', 3)
    put('comms_error_at', NOW - 60_000)
    const s = await runSentinelPass({
      brain,
      profiles: [],
      checks: [appHealthCheck],
      alertTo: [],
      now: NOW,
    })
    expect(s.findings.some((f) => f.key === 'app-health:comms-pass-errors')).toBe(true)
  })
})

describe('sentinel — vendors, notifications, automations, data, conversation QC', () => {
  it('textmagic: low balance raises a finding (reachability + balance)', async () => {
    const s = await runSentinelPass({
      brain,
      profiles: [],
      checks: [integrationHealthCheck],
      call: okCall,
      probeTextmagic: async () => ({ ok: true, balance: 3 }),
      alertTo: [],
      now: NOW,
    })
    const f = s.findings.find((x) => x.key === 'integration:textmagic:low-balance')
    expect(f).toBeTruthy()
    expect(f?.detail).toContain('3')
  })

  it('textmagic: zero balance is critical', async () => {
    const s = await runSentinelPass({
      brain,
      profiles: [],
      checks: [integrationHealthCheck],
      call: okCall,
      probeTextmagic: async () => ({ ok: true, balance: 0 }),
      alertTo: [],
      now: NOW,
    })
    expect(s.findings.find((x) => x.key === 'integration:textmagic:low-balance')?.severity).toBe(
      'critical',
    )
  })

  it('textmagic: unreachable raises a warning; healthy balance is clean', async () => {
    const down = await runSentinelPass({
      brain,
      profiles: [],
      checks: [integrationHealthCheck],
      call: okCall,
      probeTextmagic: async () => ({ ok: false, error: 'HTTP 401' }),
      alertTo: [],
      now: NOW,
    })
    expect(down.findings.map((f) => f.key)).toContain('integration:textmagic:unreachable')

    const healthy = await runSentinelPass({
      brain,
      profiles: [],
      checks: [integrationHealthCheck],
      call: okCall,
      probeTextmagic: async () => ({ ok: true, balance: 5000 }),
      alertTo: [],
      now: NOW + 1000,
    })
    expect(healthy.findings).toHaveLength(0)
  })

  it('textmagic: unconfigured is skipped (no alarm)', async () => {
    const s = await runSentinelPass({
      brain,
      profiles: [],
      checks: [integrationHealthCheck],
      call: okCall,
      probeTextmagic: tmUnconfigured,
      alertTo: [],
      now: NOW,
    })
    expect(s.findings).toHaveLength(0)
  })

  it('notifications: failed sends in comms_log raise a finding', async () => {
    const s = await runSentinelPass({
      brain,
      profiles: ['p1'],
      checks: [notificationsDeliveryCheck],
      store: fakeStore({
        countCommsErrors: () => ({ count: 6, byChannel: { email: 4, sms: 2 } }),
      }),
      alertTo: [],
      now: NOW,
    })
    const f = s.findings.find((x) => x.key === 'notifications:p1:send-failures')
    expect(f?.severity).toBe('critical')
    expect(f?.detail).toContain('email:4')
  })

  it('notifications: clean when no send errors', async () => {
    const s = await runSentinelPass({
      brain,
      profiles: ['p1'],
      checks: [notificationsDeliveryCheck],
      store: fakeStore(),
      alertTo: [],
      now: NOW,
    })
    expect(s.findings).toHaveLength(0)
  })

  it('automations: overdue runs/enrollments raise a finding', async () => {
    const s = await runSentinelPass({
      brain,
      profiles: ['p1'],
      checks: [automationsFiringCheck],
      store: fakeStore({
        countStuckAutomations: () => ({ automations: 2, flows: 1 }),
      }),
      alertTo: [],
      now: NOW,
    })
    const f = s.findings.find((x) => x.key === 'automations:p1:overdue')
    expect(f).toBeTruthy()
    expect(f?.title).toContain('3')
  })

  it('data-collection: stale inbound warns; recent and never-seen are clean', async () => {
    const liveTargets = () => [{ profile: 'p1', urls: ['https://x.test'] }]
    const stale = await runSentinelPass({
      brain,
      profiles: ['p1'],
      checks: [dataCollectionCheck],
      store: fakeStore({ latestInboundAt: () => NOW - 60 * HOUR_MS }),
      widgetTargets: liveTargets,
      alertTo: [],
      now: NOW,
    })
    expect(stale.findings.map((f) => f.key)).toContain('data-collection:p1:stale')

    const recent = await runSentinelPass({
      brain,
      profiles: ['p1'],
      checks: [dataCollectionCheck],
      store: fakeStore({ latestInboundAt: () => NOW - 1 * HOUR_MS }),
      widgetTargets: liveTargets,
      alertTo: [],
      now: NOW + 1000,
    })
    expect(recent.findings).toHaveLength(0)

    const never = await runSentinelPass({
      brain,
      profiles: ['p1'],
      checks: [dataCollectionCheck],
      store: fakeStore({ latestInboundAt: () => null }),
      widgetTargets: liveTargets,
      alertTo: [],
      now: NOW + 2000,
    })
    expect(never.findings).toHaveLength(0)
  })

  it('data-collection: skipped for stores with no live conversational channel', async () => {
    const s = await runSentinelPass({
      brain,
      profiles: ['quiet-store'],
      checks: [dataCollectionCheck],
      store: fakeStore({ latestInboundAt: () => NOW - 600 * HOUR_MS }),
      widgetTargets: () => [], // not a widget/conversational target
      alertTo: [],
      now: NOW,
    })
    expect(s.findings).toHaveLength(0)
  })

  it('conversation-ops: failed reply jobs + queued backlog raise findings', async () => {
    const s = await runSentinelPass({
      brain,
      profiles: ['p1'],
      checks: [conversationOpsCheck],
      store: fakeStore({ countReplyJobs: () => ({ failed: 2, queued: 25 }) }),
      alertTo: [],
      now: NOW,
    })
    const keys = s.findings.map((f) => f.key)
    expect(keys).toContain('conversation-qc:p1:reply-failures')
    expect(keys).toContain('conversation-qc:p1:reply-backlog')
  })

  it('conversation-quality: low AI grade raises a finding, high grade is clean', async () => {
    const low = await runSentinelPass({
      brain,
      profiles: ['p1'],
      checks: [conversationQualityCheck],
      store: fakeStore({
        sampleRecentThreads: () => [{ id: 't1', transcript: 'Customer: hi\nAgent: no.' }],
      }),
      gradeConversation: async () => ({ graded: true, score: 2, issue: 'unhelpful' }),
      alertTo: [],
      now: NOW,
    })
    const f = low.findings.find((x) => x.key === 'conversation-qc:p1:low-quality:t1')
    expect(f).toBeTruthy()
    expect(f?.detail).toContain('unhelpful')

    const high = await runSentinelPass({
      brain,
      profiles: ['p1'],
      checks: [conversationQualityCheck],
      store: fakeStore({
        sampleRecentThreads: () => [{ id: 't2', transcript: 'Customer: hi\nAgent: glad to help!' }],
      }),
      gradeConversation: async () => ({ graded: true, score: 5 }),
      alertTo: [],
      now: NOW + 2 * HOUR_MS,
    })
    expect(high.findings).toHaveLength(0)
  })

  it('conversation-quality: throttled — does not re-grade within the interval', async () => {
    let calls = 0
    const opts = {
      brain,
      profiles: ['p1'],
      checks: [conversationQualityCheck],
      store: fakeStore({
        sampleRecentThreads: () => [{ id: 't1', transcript: 'Customer: hi\nAgent: ok' }],
      }),
      gradeConversation: async () => {
        calls++
        return { graded: true as const, score: 5 }
      },
      alertTo: [],
    }
    await runSentinelPass({ ...opts, now: NOW })
    await runSentinelPass({ ...opts, now: NOW + 60_000 })
    expect(calls).toBe(1)
  })

  it('conversation-quality: ungradeable sample never raises a finding', async () => {
    const s = await runSentinelPass({
      brain,
      profiles: ['p1'],
      checks: [conversationQualityCheck],
      store: fakeStore({
        sampleRecentThreads: () => [{ id: 't1', transcript: 'x' }],
      }),
      gradeConversation: async () => ({ graded: false, score: 0 }),
      alertTo: [],
      now: NOW,
    })
    expect(s.findings).toHaveLength(0)
  })
})

describe('sentinel — synthetic widget monitor', () => {
  const target = [{ profile: 'serra-honda', urls: ['https://www.serrahonda.net'] }]
  const okResult = {
    url: 'https://www.serrahonda.net',
    ok: true,
    scriptPresent: true,
    launcherPresent: true,
    channels: { chat: true, video: true },
  }

  it('no targets configured ⇒ no findings, no browser calls', async () => {
    const spy = vi.fn()
    const s = await runSentinelPass({
      brain,
      profiles: [],
      checks: [widgetSyntheticCheck],
      widgetTargets: () => [],
      checkWidget: spy as never,
      alertTo: [],
      now: NOW,
    })
    expect(s.findings).toHaveLength(0)
    expect(spy).not.toHaveBeenCalled()
  })

  it('healthy widget ⇒ no finding', async () => {
    const s = await runSentinelPass({
      brain,
      profiles: [],
      checks: [widgetSyntheticCheck],
      widgetTargets: () => target,
      checkWidget: async () => okResult,
      alertTo: [],
      now: NOW,
    })
    expect(s.findings).toHaveLength(0)
  })

  it('broken widget ⇒ critical finding', async () => {
    const s = await runSentinelPass({
      brain,
      profiles: [],
      checks: [widgetSyntheticCheck],
      widgetTargets: () => target,
      checkWidget: async () => ({
        ...okResult,
        ok: false,
        launcherPresent: false,
        error: 'launcher did not render',
      }),
      alertTo: [],
      now: NOW,
    })
    const f = s.findings.find((x) => x.key.startsWith('widget:serra-honda:down'))
    expect(f?.severity).toBe('critical')
  })

  it('browser unavailable ⇒ ONE coverage-down warning, not a widget fault', async () => {
    const s = await runSentinelPass({
      brain,
      profiles: [],
      checks: [widgetSyntheticCheck],
      widgetTargets: () => target,
      checkWidget: async () => ({ ...okResult, ok: false, infra: true, error: 'no browser' }),
      alertTo: [],
      now: NOW,
    })
    expect(s.findings.map((f) => f.key)).toEqual(['widget:browser-unavailable'])
    expect(s.findings[0].severity).toBe('warning')
  })

  it('throttled — does not re-run within 24h', async () => {
    const spy = vi.fn().mockResolvedValue(okResult)
    const opts = {
      brain,
      profiles: [],
      checks: [widgetSyntheticCheck],
      widgetTargets: () => target,
      checkWidget: spy as never,
      alertTo: [],
    }
    await runSentinelPass({ ...opts, now: NOW })
    await runSentinelPass({ ...opts, now: NOW + 60 * 60_000 })
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('sentinel — per-store VIN health', () => {
  it('skips stores with no configured orgId (no alarm, no call)', async () => {
    const spy = vi.fn()
    const s = await runSentinelPass({
      brain,
      profiles: ['p1'],
      checks: [vinHealthCheck],
      vinOrgId: () => ({ ok: false }),
      call: spy as never,
      alertTo: [],
      now: NOW,
    })
    expect(s.findings).toHaveLength(0)
    expect(spy).not.toHaveBeenCalled()
  })

  it('clean when vin_token_status succeeds for the store orgId', async () => {
    const s = await runSentinelPass({
      brain,
      profiles: ['p1'],
      checks: [vinHealthCheck],
      vinOrgId: () => ({ ok: true, orgId: 'org-uuid' }),
      call: (async () => ({ ok: true as const, data: {} })) as never,
      alertTo: [],
      now: NOW,
    })
    expect(s.findings).toHaveLength(0)
  })

  it('warns per store when vin_token_status fails', async () => {
    const s = await runSentinelPass({
      brain,
      profiles: ['serra-honda'],
      checks: [vinHealthCheck],
      vinOrgId: () => ({ ok: true, orgId: 'org-uuid' }),
      call: (async () => ({ ok: false as const, error: 'unauthorized' })) as never,
      alertTo: [],
      now: NOW,
    })
    expect(s.findings.map((f) => f.key)).toEqual(['integration:vin:serra-honda:unreachable'])
  })
})

describe('sentinel — SLA recency window', () => {
  function threadStore(lastInboundAgeMs: number): Partial<SentinelStore> {
    return {
      listOpenThreads: () => [{ id: 't1' }],
      getThread: () => ({
        messages: [{ direction: 'inbound', created_at: NOW - lastInboundAgeMs }],
      }),
    }
  }

  it('flags a recent unanswered inbound (past SLA, within 24h)', async () => {
    const s = await runSentinelPass({
      brain,
      profiles: ['p1'],
      checks: [threadSlaCheck],
      store: fakeStore(threadStore(2 * HOUR_MS)),
      alertTo: [],
      now: NOW,
    })
    expect(s.findings.map((f) => f.key)).toContain('agent-health:p1:unanswered')
  })

  it('ignores a stale/abandoned unanswered inbound (older than 24h)', async () => {
    const s = await runSentinelPass({
      brain,
      profiles: ['p1'],
      checks: [threadSlaCheck],
      store: fakeStore(threadStore(300 * HOUR_MS)),
      alertTo: [],
      now: NOW,
    })
    expect(s.findings).toHaveLength(0)
  })
})
