/**
 * Sentinel — whole-application health monitor (insurance).
 *
 * One `runSentinelPass()` runs a registry of independent checks across the
 * ENTIRE application (comms pipeline liveness, integration health, agent/thread
 * SLA, app health), records findings in the Brain (the audit / in-app feed),
 * and dispatches deduped + throttled, severity-tagged alerts to the operator
 * (email via central-mcp Resend) plus a once-daily heartbeat.
 *
 * Scope is THIS application only — not host/infra or other apps.
 *
 * Design mirrors `comms-scheduler.runDueWork`: each check is wrapped so one
 * failing check never breaks the pass; the function never throws. It is driven
 * by `scripts/sentinel-cron.ts` (a dedicated tick, decoupled from the comms
 * pipeline so running the monitor never wakes outbound sends).
 *
 * Dependency-injectable end to end so tests exercise the engine + every check
 * without a real Brain, real central-mcp, or any real email send.
 */

import { openBrain } from './brain-store'
import { listProfiles } from './profiles-browser'
import { callCentralMcpTool } from './central-mcp'
import { sendNotification } from './notifications'
import {
  listThreads,
  getThread,
  countStuckAutomations,
  countReplyJobs,
  latestInboundAt,
  sampleRecentThreads,
} from './messaging-hub-store'
import { countCommsErrors } from './comms-log'
import {
  defaultProbeTextmagic,
  defaultGradeConversation,
  type TextmagicProbe,
  type ConversationGrade,
} from './sentinel-probes'

export type Severity = 'info' | 'warning' | 'critical'

const SEVERITY_RANK: Record<Severity, number> = { info: 0, warning: 1, critical: 2 }

export type Finding = {
  /** Stable identity for dedup/throttle — same issue ⇒ same key across passes. */
  key: string
  severity: Severity
  category: string
  title: string
  detail: string
  /** Profile the finding belongs to, or '_system' for app-wide. */
  profile: string
}

export type SentinelSummary = {
  checksRun: number
  findings: Array<Finding>
  alertsSent: number
  resolved: number
  heartbeatSent: boolean
  errors: Array<{ check: string; error: string }>
  healthy: boolean
}

/** A Brain handle — the subset of the openBrain API the Sentinel uses. */
export type BrainLike = {
  exec: (sql: string) => unknown
  run: (sql: string, ...params: Array<unknown>) => unknown
  get: <T>(sql: string, ...params: Array<unknown>) => T | undefined
  all: <T>(sql: string, ...params: Array<unknown>) => Array<T>
}

export type SentinelDeps = {
  /** Brain for the Sentinel's own state (findings + alert ledger). */
  brain?: BrainLike
  /** Profiles to sweep with profile-scoped checks. Defaults to all profiles. */
  profiles?: Array<string>
  /** Email sink for alerts. Defaults to central-mcp Resend via sendNotification. */
  sendEmail?: (input: {
    to: Array<string>
    subject: string
    html: string
  }) => Promise<{ ok: boolean; error?: string }>
  /** Where operator alerts go. Defaults to SENTINEL_ALERT_EMAIL env. */
  alertTo?: Array<string>
  /** central-mcp tool caller (for integration probes). */
  call?: typeof callCentralMcpTool
  /** Application-data reader surface (tests inject a fake). */
  store?: SentinelStore
  /** TextMagic reachability + balance probe (tests inject a fake). */
  probeTextmagic?: () => Promise<TextmagicProbe>
  /** Conversation-quality grader (tests inject a fake). */
  gradeConversation?: (transcript: string) => Promise<ConversationGrade>
  /** Override the check registry (tests). Defaults to the built-in checks. */
  checks?: Array<SentinelCheck>
  /** Re-alert throttle: don't re-email the same open finding within this window. */
  reAlertMs?: number
  /** Heartbeat cadence: at most one "all clear" summary per this window. */
  heartbeatMs?: number
  now?: number
}

/**
 * The application-data surface the profile-scoped checks read. All methods are
 * read-only and fail-safe (return zero/empty on a read error). Injected so
 * checks are unit-tested without real per-profile databases.
 */
export type SentinelStore = {
  listOpenThreads: (profile: string) => Array<{ id: string }>
  getThread: (
    profile: string,
    id: string,
  ) => { messages: Array<{ direction: string; created_at?: number }> } | null
  countCommsErrors: (
    profile: string,
    sinceMs: number,
    now: number,
  ) => { count: number; byChannel: Record<string, number> }
  countStuckAutomations: (
    profile: string,
    now: number,
    overdueMs: number,
  ) => { automations: number; flows: number }
  countReplyJobs: (
    profile: string,
    sinceMs: number,
    now: number,
  ) => { failed: number; queued: number }
  latestInboundAt: (profile: string) => number | null
  sampleRecentThreads: (
    profile: string,
    sinceMs: number,
    now: number,
    limit: number,
  ) => Array<{ id: string; transcript: string }>
}

const DEFAULT_STORE: SentinelStore = {
  listOpenThreads: (profile) =>
    listThreads({ profile, status: 'open', limit: 500 }).map((t) => ({ id: t.id })),
  getThread: (profile, id) => getThread(profile, id),
  countCommsErrors,
  countStuckAutomations,
  countReplyJobs,
  latestInboundAt,
  sampleRecentThreads,
}

export type CheckCtx = {
  profile: string | null
  now: number
  call: typeof callCentralMcpTool
  /** The Sentinel's own Brain — checks may read shared state (e.g. heartbeat). */
  brain: BrainLike
  /** Read-only application-data surface for profile-scoped checks. */
  store: SentinelStore
  /** TextMagic reachability + balance probe (injectable). */
  probeTextmagic: () => Promise<TextmagicProbe>
  /** Conversation-quality grader (injectable). */
  grade: (transcript: string) => Promise<ConversationGrade>
}

export type SentinelCheck = {
  name: string
  category: string
  /** 'system' runs once; 'profile' runs once per profile. */
  scope: 'system' | 'profile'
  run: (ctx: CheckCtx) => Promise<Array<Finding>>
}

/** Default operator alert recipient (Resend → email). Override with SENTINEL_ALERT_EMAIL. */
const DEFAULT_ALERT_EMAIL = 'duanekwells@gmail.com'
const DEFAULT_RE_ALERT_MS = 6 * 60 * 60_000 // 6h — don't spam the same open issue
const DEFAULT_HEARTBEAT_MS = 24 * 60 * 60_000 // daily all-clear
const COMMS_TICK_STALE_MS = 10 * 60_000 // tick should run ≥ every minute; 10m ⇒ dead
const THREAD_SLA_MS = 30 * 60_000 // inbound unanswered > 30m ⇒ agent not responding
const COMMS_ERROR_WINDOW_MS = 60 * 60_000 // look back 1h for send failures
const AUTOMATION_OVERDUE_MS = 30 * 60_000 // due > 30m ago + unsent ⇒ tick not advancing
const REPLY_FAIL_WINDOW_MS = 60 * 60_000 // look back 1h for failed agent replies
const DATA_STALE_MS = 48 * 60 * 60_000 // no inbound for 48h ⇒ data may not be flowing
const QC_GRADE_INTERVAL_MS = 60 * 60_000 // grade conversations at most hourly (token cost)
const QC_SAMPLE_SIZE = 5 // threads graded per QC pass
const QC_LOW_SCORE = 3 // grade <= 3 (of 5) ⇒ quality finding
/** TextMagic low-balance alert threshold (credits). Override via env. */
const TEXTMAGIC_MIN_BALANCE = Number(
  process.env.SENTINEL_TEXTMAGIC_MIN_BALANCE ?? 20,
)

function sentinelTables(brain: BrainLike): BrainLike {
  brain.exec(
    `CREATE TABLE IF NOT EXISTS sentinel_event (
       key TEXT PRIMARY KEY,
       severity TEXT NOT NULL,
       category TEXT NOT NULL,
       profile TEXT NOT NULL,
       title TEXT NOT NULL,
       detail TEXT NOT NULL,
       status TEXT NOT NULL DEFAULT 'open',
       first_seen INTEGER NOT NULL,
       last_seen INTEGER NOT NULL,
       last_alerted_at INTEGER,
       alert_count INTEGER NOT NULL DEFAULT 0
     )`,
  )
  brain.exec(
    `CREATE TABLE IF NOT EXISTS sentinel_meta (k TEXT PRIMARY KEY, v INTEGER)`,
  )
  return brain
}

type EventRow = {
  key: string
  severity: Severity
  status: string
  last_alerted_at: number | null
}

/**
 * Record a finding and decide whether it warrants an alert this pass.
 * Alert when: newly seen, severity escalated, or the re-alert window elapsed.
 *
 * IMPORTANT: this does NOT stamp `last_alerted_at` — that happens only after a
 * successful send (see `markAlerted`). If the email send fails, the finding
 * stays un-alerted so the NEXT pass retries instead of going silent for the
 * whole re-alert window.
 */
function upsertFindingAndShouldAlert(
  brain: BrainLike,
  f: Finding,
  now: number,
  reAlertMs: number,
): boolean {
  const prior = brain.get<EventRow>(
    `SELECT key, severity, status, last_alerted_at FROM sentinel_event WHERE key=?`,
    f.key,
  )
  if (!prior) {
    brain.run(
      `INSERT INTO sentinel_event
         (key, severity, category, profile, title, detail, status, first_seen, last_seen, last_alerted_at, alert_count)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, NULL, 0)`,
      f.key,
      f.severity,
      f.category,
      f.profile,
      f.title,
      f.detail,
      now,
      now,
    )
    return true
  }

  const escalated = SEVERITY_RANK[f.severity] > SEVERITY_RANK[prior.severity]
  const reopened = prior.status === 'resolved'
  const stale =
    prior.last_alerted_at == null || now - prior.last_alerted_at >= reAlertMs
  const shouldAlert = escalated || reopened || stale

  // Refresh the finding's content/status but NOT its alert ledger.
  brain.run(
    `UPDATE sentinel_event
       SET severity=?, category=?, profile=?, title=?, detail=?, status='open', last_seen=?
     WHERE key=?`,
    f.severity,
    f.category,
    f.profile,
    f.title,
    f.detail,
    now,
    f.key,
  )
  return shouldAlert
}

/** Stamp alert ledger AFTER a successful send so failed sends are retried. */
function markAlerted(
  brain: BrainLike,
  keys: Array<string>,
  now: number,
): void {
  for (const key of keys) {
    brain.run(
      `UPDATE sentinel_event
         SET last_alerted_at=?, alert_count=alert_count + 1
       WHERE key=?`,
      now,
      key,
    )
  }
}

/** Mark any previously-open finding not seen this pass as resolved. */
function resolveStale(
  brain: BrainLike,
  seenKeys: Set<string>,
  now: number,
): number {
  const open = brain.all<{ key: string }>(
    `SELECT key FROM sentinel_event WHERE status='open'`,
  )
  let resolved = 0
  for (const row of open) {
    if (seenKeys.has(row.key)) continue
    brain.run(
      `UPDATE sentinel_event SET status='resolved', last_seen=? WHERE key=?`,
      now,
      row.key,
    )
    resolved++
  }
  return resolved
}

function alertHtml(findings: Array<Finding>): string {
  const rows = findings
    .map(
      (f) =>
        `<tr><td style="padding:6px 10px;font-weight:600;text-transform:uppercase">${f.severity}</td>` +
        `<td style="padding:6px 10px">${escapeHtml(f.profile)}</td>` +
        `<td style="padding:6px 10px">${escapeHtml(f.title)}</td>` +
        `<td style="padding:6px 10px;color:#555">${escapeHtml(f.detail)}</td></tr>`,
    )
    .join('')
  return (
    `<div style="font-family:sans-serif;max-width:680px">` +
    `<h2 style="color:#1a1a1a">Sentinel alert — ${findings.length} issue(s)</h2>` +
    `<table style="border-collapse:collapse;width:100%"><thead><tr>` +
    `<th align="left" style="padding:6px 10px">Severity</th>` +
    `<th align="left" style="padding:6px 10px">Scope</th>` +
    `<th align="left" style="padding:6px 10px">Issue</th>` +
    `<th align="left" style="padding:6px 10px">Detail</th>` +
    `</tr></thead><tbody>${rows}</tbody></table>` +
    `<p style="color:#888;font-size:12px">Huminic Studio Sentinel — application health monitor.</p></div>`
  )
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ── Built-in checks ────────────────────────────────────────────────────────

/**
 * Comms pipeline liveness — the single driver (`runDueWork`) must tick. If the
 * heartbeat is missing or stale, NOTHING is sending (campaigns, follow-ups,
 * escalations all dead). This is the check that catches a dead cron.
 */
export const commsCronLivenessCheck: SentinelCheck = {
  name: 'comms-cron-liveness',
  category: 'comms-pipeline',
  scope: 'system',
  async run({ now, brain }) {
    // Only assert comms liveness when the comms pipeline is EXPECTED to run.
    // While the SMS/comms tick is intentionally off (monitor-only deploy), a
    // missing heartbeat is by design, not a fault — staying silent avoids a
    // false alarm. This activates automatically when COMMS_TICK_ENABLED=true.
    if (process.env.COMMS_TICK_ENABLED !== 'true') return []
    const row = brain.get<{ v: number }>(
      `SELECT v FROM sentinel_meta WHERE k='comms_heartbeat'`,
    )
    const last = row?.v ?? null
    if (last == null) {
      return [
        {
          key: 'comms-pipeline:no-heartbeat',
          severity: 'critical',
          category: 'comms-pipeline',
          title: 'Comms pipeline has never ticked',
          detail:
            'No runDueWork heartbeat found — the comms driver is not running, so no campaigns, lead follow-ups, vin-watcher, or escalations fire.',
          profile: '_system',
        },
      ]
    }
    const age = now - last
    if (age > COMMS_TICK_STALE_MS) {
      return [
        {
          key: 'comms-pipeline:stale-heartbeat',
          severity: 'critical',
          category: 'comms-pipeline',
          title: 'Comms pipeline tick is stale',
          detail: `Last runDueWork was ${Math.round(age / 60_000)}m ago (threshold ${Math.round(
            COMMS_TICK_STALE_MS / 60_000,
          )}m) — outbound automation is likely stalled.`,
          profile: '_system',
        },
      ]
    }
    return []
  },
}

/**
 * Agent / thread SLA — an inbound customer message left unanswered beyond the
 * SLA means an agent is not responding. Per profile.
 */
export const threadSlaCheck: SentinelCheck = {
  name: 'thread-sla',
  category: 'agent-health',
  scope: 'profile',
  async run({ profile, now, store }) {
    if (!profile) return []
    let threads: Array<{ id: string }> = []
    try {
      threads = store.listOpenThreads(profile)
    } catch {
      return []
    }
    let breached = 0
    for (const t of threads) {
      const full = store.getThread(profile, t.id)
      if (!full || !full.messages.length) continue
      const last = full.messages[full.messages.length - 1]
      if (last.direction !== 'inbound') continue
      if (now - (last.created_at ?? 0) >= THREAD_SLA_MS) breached++
    }
    if (breached === 0) return []
    return [
      {
        key: `agent-health:${profile}:unanswered`,
        severity: breached >= 5 ? 'critical' : 'warning',
        category: 'agent-health',
        title: `${breached} unanswered customer message(s) past SLA`,
        detail: `${profile}: ${breached} open thread(s) with an inbound message unanswered for >${Math.round(
          THREAD_SLA_MS / 60_000,
        )}m — an agent may not be responding.`,
        profile,
      },
    ]
  },
}

/**
 * Reachability/auth probes for the integrations the app depends on, using the
 * real central-mcp tools (confirmed via tools/list).
 *
 * HONEST LIMITATION: central-mcp exposes NO credit/balance tool for Vapi,
 * Tavus, or TextMagic, and no Resend health endpoint — so credit-balance
 * threshold alerting is NOT possible through this surface (tracked as debt;
 * would need provider-direct API access). These probes confirm the provider
 * API is reachable + authenticated; SMS/email *delivery* failures surface via
 * the app-health check instead. A probe that is unconfigured is skipped (not an
 * alarm); a probe that errors yields an explicit "unreachable" warning — never
 * a fabricated "healthy".
 */
const PROVIDER_PROBES: Array<{ provider: string; tool: string }> = [
  { provider: 'vapi', tool: 'vapi_list_assistants' },
  { provider: 'tavus', tool: 'tavus_list_personas' },
  { provider: 'vin', tool: 'vin_token_status' },
]

export const integrationHealthCheck: SentinelCheck = {
  name: 'integration-health',
  category: 'integration',
  scope: 'system',
  async run({ call, probeTextmagic }) {
    const findings: Array<Finding> = []
    // central-mcp providers (Vapi / Tavus / VIN) — reachability/auth only.
    for (const p of PROVIDER_PROBES) {
      const res = await call(p.tool, {}).catch((e: unknown) => ({
        ok: false as const,
        error: e instanceof Error ? e.message : String(e),
      }))
      // Not wired in this environment ⇒ skip, do not alarm.
      if ('unconfigured' in res && res.unconfigured) continue
      if (!res.ok) {
        findings.push({
          key: `integration:${p.provider}:unreachable`,
          severity: 'warning',
          category: 'integration',
          title: `${p.provider} integration probe failed`,
          detail: `${p.tool} failed: ${
            ('error' in res && res.error) || 'unknown'
          } — the ${p.provider} API may be unreachable or unauthenticated.`,
          profile: '_system',
        })
      }
    }

    // TextMagic — reached directly (not via central-mcp), so we get BOTH
    // reachability AND remaining balance.
    const tm = await probeTextmagic().catch((e: unknown) => ({
      ok: false as const,
      error: e instanceof Error ? e.message : String(e),
    }))
    if (!('unconfigured' in tm && tm.unconfigured)) {
      if (!tm.ok) {
        findings.push({
          key: 'integration:textmagic:unreachable',
          severity: 'warning',
          category: 'integration',
          title: 'TextMagic integration probe failed',
          detail: `TextMagic /user failed: ${
            tm.error || 'unknown'
          } — SMS sending may be unreachable or unauthenticated.`,
          profile: '_system',
        })
      } else if (
        typeof tm.balance === 'number' &&
        tm.balance < TEXTMAGIC_MIN_BALANCE
      ) {
        findings.push({
          key: 'integration:textmagic:low-balance',
          severity: tm.balance <= 0 ? 'critical' : 'warning',
          category: 'integration',
          title: `TextMagic balance low (${tm.balance})`,
          detail: `TextMagic balance is ${tm.balance}, below the ${TEXTMAGIC_MIN_BALANCE} threshold — SMS sends will fail when it reaches 0.`,
          profile: '_system',
        })
      }
    }
    return findings
  },
}

/**
 * Notifications / outbound-send delivery — a burst of `outcome='error'` rows in
 * comms_log within the recent window means notifications or messages are
 * failing to send (bad recipient, provider auth, throttling). Per profile.
 */
export const notificationsDeliveryCheck: SentinelCheck = {
  name: 'notifications-delivery',
  category: 'notifications',
  scope: 'profile',
  async run({ profile, now, store }) {
    if (!profile) return []
    const { count, byChannel } = store.countCommsErrors(
      profile,
      COMMS_ERROR_WINDOW_MS,
      now,
    )
    if (count <= 0) return []
    const channels = Object.entries(byChannel)
      .map(([c, n]) => `${c}:${n}`)
      .join(', ')
    return [
      {
        key: `notifications:${profile}:send-failures`,
        severity: count >= 5 ? 'critical' : 'warning',
        category: 'notifications',
        title: `${count} failed send(s) in the last hour`,
        detail: `${profile}: ${count} outbound send(s) recorded outcome=error in the last ${Math.round(
          COMMS_ERROR_WINDOW_MS / 60_000,
        )}m (${channels}) — notifications/messages may not be delivering.`,
        profile,
      },
    ]
  },
}

/**
 * Automations firing — runs/enrollments that are due but un-advanced past the
 * overdue window mean the tick is not processing work (even if it is ticking).
 * Per profile.
 */
export const automationsFiringCheck: SentinelCheck = {
  name: 'automations-firing',
  category: 'automations',
  scope: 'profile',
  async run({ profile, now, store }) {
    if (!profile) return []
    const { automations, flows } = store.countStuckAutomations(
      profile,
      now,
      AUTOMATION_OVERDUE_MS,
    )
    const total = automations + flows
    if (total <= 0) return []
    return [
      {
        key: `automations:${profile}:overdue`,
        severity: total >= 10 ? 'critical' : 'warning',
        category: 'automations',
        title: `${total} overdue automation step(s)`,
        detail: `${profile}: ${automations} automation run(s) + ${flows} flow enrollment(s) are due but un-advanced for >${Math.round(
          AUTOMATION_OVERDUE_MS / 60_000,
        )}m — the automation tick may not be firing scheduled steps.`,
        profile,
      },
    ]
  },
}

/**
 * Data collection — if no inbound message has arrived for a long window, lead
 * intake (VIN poll / ADF email / widget) may be broken. Warning-level: a quiet
 * store is not necessarily a fault. Per profile.
 */
export const dataCollectionCheck: SentinelCheck = {
  name: 'data-collection',
  category: 'data-collection',
  scope: 'profile',
  async run({ profile, now, store }) {
    if (!profile) return []
    const last = store.latestInboundAt(profile)
    // No inbound ever recorded ⇒ nothing to assert (new/empty profile).
    if (last == null) return []
    const age = now - last
    if (age < DATA_STALE_MS) return []
    return [
      {
        key: `data-collection:${profile}:stale`,
        severity: 'warning',
        category: 'data-collection',
        title: 'No inbound leads/messages recently',
        detail: `${profile}: last inbound message was ${Math.round(
          age / (60 * 60_000),
        )}h ago (threshold ${Math.round(
          DATA_STALE_MS / (60 * 60_000),
        )}h) — lead intake (VIN poll / ADF / widget) may have stopped.`,
        profile,
      },
    ]
  },
}

/**
 * Conversation QC — operational. Failed agent reply jobs (the agent tried and
 * could not send) and a backlog of queued jobs (the reply worker may be
 * stalled). Per profile. Content quality is graded separately by
 * conversationQualityCheck.
 */
export const conversationOpsCheck: SentinelCheck = {
  name: 'conversation-ops',
  category: 'conversation-qc',
  scope: 'profile',
  async run({ profile, now, store }) {
    if (!profile) return []
    const { failed, queued } = store.countReplyJobs(
      profile,
      REPLY_FAIL_WINDOW_MS,
      now,
    )
    const findings: Array<Finding> = []
    if (failed > 0) {
      findings.push({
        key: `conversation-qc:${profile}:reply-failures`,
        severity: failed >= 5 ? 'critical' : 'warning',
        category: 'conversation-qc',
        title: `${failed} failed agent repl(y/ies) in the last hour`,
        detail: `${profile}: ${failed} agent reply job(s) ended in 'failed' in the last ${Math.round(
          REPLY_FAIL_WINDOW_MS / 60_000,
        )}m — the agent could not respond to customers.`,
        profile,
      })
    }
    if (queued >= 20) {
      findings.push({
        key: `conversation-qc:${profile}:reply-backlog`,
        severity: 'warning',
        category: 'conversation-qc',
        title: `${queued} agent repl(y/ies) queued`,
        detail: `${profile}: ${queued} agent reply job(s) stuck in 'queued' — the reply worker may not be draining.`,
        profile,
      })
    }
    return findings
  },
}

/**
 * Conversation QC — content quality (AI). Grades a small sample of recent
 * agent-replied conversations, throttled to at most once per
 * QC_GRADE_INTERVAL_MS to bound token cost. A low score (<= QC_LOW_SCORE)
 * raises a warning. Grader failures are silent (graded:false) — never a false
 * quality alarm. Per profile.
 */
export const conversationQualityCheck: SentinelCheck = {
  name: 'conversation-quality',
  category: 'conversation-qc',
  scope: 'profile',
  async run({ profile, now, store, brain, grade }) {
    if (!profile) return []
    // Throttle: skip if graded within the interval (per profile).
    const metaKey = `qc_graded_at:${profile}`
    const lastRow = brain.get<{ v: number }>(
      `SELECT v FROM sentinel_meta WHERE k=?`,
      metaKey,
    )
    if (lastRow && now - lastRow.v < QC_GRADE_INTERVAL_MS) return []

    const samples = store.sampleRecentThreads(
      profile,
      QC_GRADE_INTERVAL_MS,
      now,
      QC_SAMPLE_SIZE,
    )
    if (samples.length === 0) return []

    // Stamp the attempt up-front so a slow/expensive grader still throttles.
    brain.run(
      `INSERT INTO sentinel_meta (k, v) VALUES (?, ?)
       ON CONFLICT(k) DO UPDATE SET v=excluded.v`,
      metaKey,
      now,
    )

    const findings: Array<Finding> = []
    for (const s of samples) {
      const g = await grade(s.transcript).catch(() => ({
        graded: false as const,
        score: 0,
      }))
      if (!g.graded) continue
      if (g.score <= QC_LOW_SCORE) {
        findings.push({
          key: `conversation-qc:${profile}:low-quality:${s.id}`,
          severity: g.score <= 1 ? 'critical' : 'warning',
          category: 'conversation-qc',
          title: `Low-quality conversation (score ${g.score}/5)`,
          detail: `${profile}: thread ${s.id} graded ${g.score}/5${
            g.issue ? ` — ${g.issue}` : ''
          }.`,
          profile,
        })
      }
    }
    return findings
  },
}

/**
 * App health — surfaces errors from the most recent comms pipeline pass
 * (`runDueWork` records its error count). Covers "failed jobs" in the pipeline.
 * Raw cross-service log/exception scraping needs a log source the app does not
 * currently expose (tracked as debt).
 */
export const appHealthCheck: SentinelCheck = {
  name: 'app-health',
  category: 'app-health',
  scope: 'system',
  async run({ now, brain }) {
    const count = brain.get<{ v: number }>(
      `SELECT v FROM sentinel_meta WHERE k='comms_error_count'`,
    )?.v
    const at = brain.get<{ v: number }>(
      `SELECT v FROM sentinel_meta WHERE k='comms_error_at'`,
    )?.v
    if (!count || count <= 0 || at == null) return []
    // Only flag if the erroring pass is recent (else it's already resolved).
    if (now - at > COMMS_TICK_STALE_MS) return []
    return [
      {
        key: 'app-health:comms-pass-errors',
        severity: 'warning',
        category: 'app-health',
        title: `${count} error(s) in the last comms pass`,
        detail: `runDueWork reported ${count} per-profile error(s) on its last pass — a job is failing. Check the comms-cron log.`,
        profile: '_system',
      },
    ]
  },
}

export const DEFAULT_CHECKS: Array<SentinelCheck> = [
  commsCronLivenessCheck,
  threadSlaCheck,
  integrationHealthCheck,
  notificationsDeliveryCheck,
  automationsFiringCheck,
  dataCollectionCheck,
  conversationOpsCheck,
  conversationQualityCheck,
  appHealthCheck,
]

// ── Orchestrator ─────────────────────────────────────────────────────────

export async function runSentinelPass(
  deps: SentinelDeps = {},
): Promise<SentinelSummary> {
  const now = deps.now ?? Date.now()
  const brain = sentinelTables(deps.brain ?? (openBrain('_sentinel') as BrainLike))
  const checks = deps.checks ?? DEFAULT_CHECKS
  const call = deps.call ?? callCentralMcpTool
  const store = deps.store ?? DEFAULT_STORE
  const probeTextmagic = deps.probeTextmagic ?? defaultProbeTextmagic
  const grade = deps.gradeConversation ?? defaultGradeConversation
  const reAlertMs = deps.reAlertMs ?? DEFAULT_RE_ALERT_MS
  const heartbeatMs = deps.heartbeatMs ?? DEFAULT_HEARTBEAT_MS
  const profiles =
    deps.profiles ?? safeListProfiles()
  const sendEmail =
    deps.sendEmail ??
    (async (i) => {
      const r = await sendNotification(i)
      return { ok: r.ok, error: r.ok ? undefined : r.error }
    })
  const alertTo =
    deps.alertTo ??
    (process.env.SENTINEL_ALERT_EMAIL
      ? process.env.SENTINEL_ALERT_EMAIL.split(',').map((s) => s.trim())
      : [DEFAULT_ALERT_EMAIL])

  const summary: SentinelSummary = {
    checksRun: 0,
    findings: [],
    alertsSent: 0,
    resolved: 0,
    heartbeatSent: false,
    errors: [],
    healthy: true,
  }

  const seen = new Set<string>()
  const toAlert: Array<Finding> = []

  for (const check of checks) {
    const base = { now, call, brain, store, probeTextmagic, grade }
    const ctxs: Array<CheckCtx> =
      check.scope === 'system'
        ? [{ profile: null, ...base }]
        : profiles.map((p) => ({ profile: p, ...base }))
    for (const ctx of ctxs) {
      summary.checksRun++
      let found: Array<Finding> = []
      try {
        found = await check.run(ctx)
      } catch (err) {
        summary.errors.push({
          check: check.name,
          error: err instanceof Error ? err.message : String(err),
        })
        continue
      }
      for (const f of found) {
        summary.findings.push(f)
        seen.add(f.key)
        if (upsertFindingAndShouldAlert(brain, f, now, reAlertMs)) toAlert.push(f)
      }
    }
  }

  summary.resolved = resolveStale(brain, seen, now)
  summary.healthy = summary.findings.length === 0

  // Dispatch alerts (deduped/throttled above) — only if we have a recipient.
  if (toAlert.length > 0 && alertTo.length > 0) {
    const r = await sendEmail({
      to: alertTo,
      subject: `🛡️ Sentinel: ${toAlert.length} issue(s) — ${maxSeverity(toAlert)}`,
      html: alertHtml(toAlert),
    })
    if (r.ok) {
      // Only now (after a confirmed send) stamp the alert ledger, so a failed
      // send is retried next pass instead of being silently throttled.
      markAlerted(brain, toAlert.map((f) => f.key), now)
      summary.alertsSent = toAlert.length
    } else {
      summary.errors.push({ check: 'alert-dispatch', error: r.error ?? 'send failed' })
    }
  }

  // Daily heartbeat (all-clear) — at most once per heartbeatMs, only when healthy.
  if (summary.healthy && alertTo.length > 0) {
    const lastHb = brain.get<{ v: number }>(
      `SELECT v FROM sentinel_meta WHERE k='last_heartbeat'`,
    )
    if (!lastHb || now - lastHb.v >= heartbeatMs) {
      const r = await sendEmail({
        to: alertTo,
        subject: '🛡️ Sentinel: all clear',
        html: `<div style="font-family:sans-serif"><h2>All clear</h2><p>No open application issues at ${new Date(
          now,
        ).toISOString()}.</p></div>`,
      })
      if (r.ok) {
        summary.heartbeatSent = true
        brain.run(
          `INSERT INTO sentinel_meta (k, v) VALUES ('last_heartbeat', ?)
           ON CONFLICT(k) DO UPDATE SET v=excluded.v`,
          now,
        )
      }
    }
  }

  return summary
}

export type SentinelFeedRow = {
  key: string
  severity: Severity
  category: string
  profile: string
  title: string
  detail: string
  status: string
  first_seen: number
  last_seen: number
  alert_count: number
}

/**
 * Read the Sentinel findings feed (the in-app alert surface). Defaults to open
 * findings, most-severe + most-recent first.
 */
export function listSentinelFindings(
  deps: { brain?: BrainLike; status?: 'open' | 'all'; limit?: number } = {},
): Array<SentinelFeedRow> {
  const brain = sentinelTables(deps.brain ?? (openBrain('_sentinel') as BrainLike))
  const limit = deps.limit ?? 100
  const where = deps.status === 'all' ? '' : `WHERE status='open'`
  return brain.all<SentinelFeedRow>(
    `SELECT key, severity, category, profile, title, detail, status, first_seen, last_seen, alert_count
       FROM sentinel_event ${where}
      ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
               last_seen DESC
      LIMIT ?`,
    limit,
  )
}

function maxSeverity(findings: Array<Finding>): Severity {
  let max: Severity = 'info'
  for (const f of findings) if (SEVERITY_RANK[f.severity] > SEVERITY_RANK[max]) max = f.severity
  return max
}

function safeListProfiles(): Array<string> {
  try {
    return listProfiles().map((p) => p.name)
  } catch {
    return []
  }
}
