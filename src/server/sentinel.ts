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
import {
  checkWidget as defaultCheckWidget,
  readWidgetTargets as defaultReadWidgetTargets,
  type WidgetCheckResult,
  type WidgetTarget,
} from './widget-monitor'
import { sampleHostStats, formatUptime, type HostStats } from './host-stats'
import { runDailyBackup, type BackupReport } from './sentinel-backup'
import { readStudioConfig } from './studio-config'
import { resolveVinOrgId } from './vin-client'

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
  /** True when the once-daily digest email was sent this pass. */
  digestSent: boolean
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
  /** Synthetic widget checker (tests inject a fake). */
  checkWidget?: (
    url: string,
    opts?: { expectChannels?: Array<string> },
  ) => Promise<WidgetCheckResult>
  /** Monitored-widget targets (tests inject). */
  widgetTargets?: () => Array<WidgetTarget>
  /** Per-store VIN org id resolver (tests inject). */
  vinOrgId?: (profile: string) => { ok: boolean; orgId?: string }
  /** Override the check registry (tests). Defaults to the built-in checks. */
  checks?: Array<SentinelCheck>
  /** Re-alert throttle: don't re-email the same open finding within this window. */
  reAlertMs?: number
  /** Daily digest cadence: at most one digest email per this window. */
  heartbeatMs?: number
  /** Host-stats sampler (tests inject). */
  sampleStats?: () => HostStats
  /** Daily backup runner (tests inject). */
  runBackup?: () => BackupReport
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
  /** Synthetic widget checker (injectable). */
  checkWidget: (
    url: string,
    opts?: { expectChannels?: Array<string> },
  ) => Promise<WidgetCheckResult>
  /** Per-customer monitored-widget targets (injectable). */
  widgetTargets: () => Array<WidgetTarget>
  /** Per-store VIN org id resolver (injectable). */
  vinOrgId: (profile: string) => { ok: boolean; orgId?: string }
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
const SLA_RECENT_MS = 24 * 60 * 60_000 // only alert on inbound from the last 24h (ignore stale/abandoned)
const COMMS_ERROR_WINDOW_MS = 60 * 60_000 // look back 1h for send failures
const AUTOMATION_OVERDUE_MS = 30 * 60_000 // due > 30m ago + unsent ⇒ tick not advancing
const REPLY_FAIL_WINDOW_MS = 60 * 60_000 // look back 1h for failed agent replies
const DATA_STALE_MS = 48 * 60 * 60_000 // no inbound for 48h ⇒ data may not be flowing
const QC_GRADE_INTERVAL_MS = 60 * 60_000 // grade conversations at most hourly (token cost)
const QC_SAMPLE_SIZE = 5 // threads graded per QC pass
const QC_LOW_SCORE = 3 // grade <= 3 (of 5) ⇒ quality finding
const WIDGET_CHECK_INTERVAL_MS = 24 * 60 * 60_000 // synthetic widget test: once/day (heavy)
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

const SEV_COLOR: Record<Severity, string> = {
  critical: '#dc2626',
  warning: '#d97706',
  info: '#2563eb',
}
const SEV_BG: Record<Severity, string> = {
  critical: '#fef2f2',
  warning: '#fffbeb',
  info: '#eff6ff',
}

function sevBadge(sev: Severity): string {
  return (
    `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;` +
    `font-weight:700;text-transform:uppercase;color:#fff;background:${SEV_COLOR[sev]}">${sev}</span>`
  )
}

function alertHtml(findings: Array<Finding>): string {
  const rows = findings
    .map(
      (f) =>
        `<tr style="background:${SEV_BG[f.severity]}">` +
        `<td style="padding:8px 10px;border-bottom:1px solid #eee">${sevBadge(f.severity)}</td>` +
        `<td style="padding:8px 10px;border-bottom:1px solid #eee;font-weight:600">${escapeHtml(f.profile)}</td>` +
        `<td style="padding:8px 10px;border-bottom:1px solid #eee">${escapeHtml(f.title)}</td>` +
        `<td style="padding:8px 10px;border-bottom:1px solid #eee;color:#555">${escapeHtml(f.detail)}</td></tr>`,
    )
    .join('')
  const top = maxSeverity(findings)
  return (
    `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:720px">` +
    `<div style="background:${SEV_COLOR[top]};color:#fff;padding:14px 18px;border-radius:8px 8px 0 0">` +
    `<h2 style="margin:0;font-size:18px">🛡️ Sentinel alert — ${findings.length} issue(s)</h2></div>` +
    `<table style="border-collapse:collapse;width:100%;border:1px solid #eee;border-top:0"><thead>` +
    `<tr style="background:#f9fafb">` +
    `<th align="left" style="padding:8px 10px;font-size:12px;color:#6b7280">Severity</th>` +
    `<th align="left" style="padding:8px 10px;font-size:12px;color:#6b7280">Scope</th>` +
    `<th align="left" style="padding:8px 10px;font-size:12px;color:#6b7280">Issue</th>` +
    `<th align="left" style="padding:8px 10px;font-size:12px;color:#6b7280">Detail</th>` +
    `</tr></thead><tbody>${rows}</tbody></table>` +
    `<p style="color:#9ca3af;font-size:12px;margin-top:10px">Huminic Studio Sentinel — application health monitor.</p></div>`
  )
}

// ── Daily digest (uptime + system stats + backup + open issues) ─────────────

/** Green/amber/red by usage percentage. */
function pctColor(pct: number): string {
  if (pct >= 90) return '#dc2626'
  if (pct >= 70) return '#d97706'
  return '#16a34a'
}

type StatWindow = { memHi: number; memLo: number; cpuHi: number; cpuLo: number }

function statCard(
  label: string,
  valueText: string,
  pct: number,
  sub: string,
): string {
  const color = pctColor(pct)
  const barW = Math.max(2, Math.min(100, pct))
  return (
    `<td style="padding:8px;vertical-align:top;width:33%">` +
    `<div style="border:1px solid #eee;border-radius:8px;padding:12px">` +
    `<div style="font-size:12px;color:#6b7280">${label}</div>` +
    `<div style="font-size:20px;font-weight:700;color:${color};margin:2px 0">${valueText}</div>` +
    `<div style="height:6px;background:#f3f4f6;border-radius:9999px;overflow:hidden;margin:6px 0">` +
    `<div style="height:6px;width:${barW}%;background:${color}"></div></div>` +
    `<div style="font-size:11px;color:#9ca3af">${sub}</div></div></td>`
  )
}

function digestHtml(input: {
  now: number
  stats: HostStats
  window: StatWindow
  backup: BackupReport
  open: Array<Finding>
}): string {
  const { stats, window, backup, open } = input
  const healthy = open.length === 0
  const headColor = healthy ? '#16a34a' : SEV_COLOR[maxSeverity(open)]
  const headText = healthy
    ? '🛡️ Sentinel daily digest — all clear'
    : `🛡️ Sentinel daily digest — ${open.length} open issue(s)`

  const cards =
    `<table style="border-collapse:collapse;width:100%"><tr>` +
    statCard(
      'CPU',
      `${stats.cpuPct}%`,
      stats.cpuPct,
      `load ${stats.cpuLoad1} / ${stats.cpuCores} cores · day ${window.cpuLo}–${window.cpuHi}%`,
    ) +
    statCard(
      'Memory',
      `${stats.memUsedPct}%`,
      stats.memUsedPct,
      `${stats.memUsedGb}/${stats.memTotalGb} GB · day ${window.memLo}–${window.memHi}%`,
    ) +
    statCard(
      'Disk',
      `${stats.diskUsedPct}%`,
      stats.diskUsedPct,
      `${stats.diskUsedGb}/${stats.diskTotalGb} GB used`,
    ) +
    `</tr></table>`

  const backupColor = backup.ok ? '#16a34a' : '#dc2626'
  const backupText = backup.ok
    ? `✅ ${backup.dbCount} database(s) backed up · ${(backup.bytes / 1e6).toFixed(1)} MB`
    : `⚠️ backup FAILED${backup.errors.length ? ` — ${escapeHtml(backup.errors[0])}` : ''}`

  const issues = healthy
    ? `<p style="color:#16a34a;font-weight:600">No open application issues. ✅</p>`
    : `<table style="border-collapse:collapse;width:100%;border:1px solid #eee">` +
      open
        .map(
          (f) =>
            `<tr style="background:${SEV_BG[f.severity]}">` +
            `<td style="padding:6px 10px">${sevBadge(f.severity)}</td>` +
            `<td style="padding:6px 10px;font-weight:600">${escapeHtml(f.profile)}</td>` +
            `<td style="padding:6px 10px">${escapeHtml(f.title)}</td></tr>`,
        )
        .join('') +
      `</table>`

  return (
    `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:720px">` +
    `<div style="background:${headColor};color:#fff;padding:14px 18px;border-radius:8px 8px 0 0">` +
    `<h2 style="margin:0;font-size:18px">${headText}</h2>` +
    `<div style="font-size:12px;opacity:.9;margin-top:2px">Uptime ${formatUptime(stats.uptimeSec)} · ${new Date(input.now).toUTCString()}</div></div>` +
    `<div style="border:1px solid #eee;border-top:0;border-radius:0 0 8px 8px;padding:12px">` +
    `<div style="font-size:13px;font-weight:600;color:#374151;margin:4px 0 2px">System</div>${cards}` +
    `<div style="font-size:13px;font-weight:600;color:#374151;margin:12px 0 4px">Backup</div>` +
    `<div style="color:${backupColor};font-weight:600;font-size:14px">${backupText}</div>` +
    `<div style="font-size:13px;font-weight:600;color:#374151;margin:12px 0 4px">Open issues</div>${issues}` +
    `<p style="color:#9ca3af;font-size:12px;margin-top:12px">Huminic Studio Sentinel — daily digest.</p></div></div>`
  )
}

function recordStatSample(brain: BrainLike, stats: HostStats): void {
  const put = (k: string, v: number) =>
    brain.run(
      `INSERT INTO sentinel_meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`,
      k,
      v,
    )
  const get = (k: string) =>
    brain.get<{ v: number }>(`SELECT v FROM sentinel_meta WHERE k=?`, k)?.v
  for (const [base, cur] of [
    ['mem', stats.memUsedPct],
    ['cpu', stats.cpuPct],
  ] as const) {
    put(`stat_${base}_cur`, cur)
    const hi = get(`stat_${base}_hi`)
    const lo = get(`stat_${base}_lo`)
    put(`stat_${base}_hi`, hi == null ? cur : Math.max(hi, cur))
    put(`stat_${base}_lo`, lo == null ? cur : Math.min(lo, cur))
  }
}

function readStatWindow(brain: BrainLike, fallback: HostStats): StatWindow {
  const g = (k: string, d: number) =>
    brain.get<{ v: number }>(`SELECT v FROM sentinel_meta WHERE k=?`, k)?.v ?? d
  return {
    memHi: g('stat_mem_hi', fallback.memUsedPct),
    memLo: g('stat_mem_lo', fallback.memUsedPct),
    cpuHi: g('stat_cpu_hi', fallback.cpuPct),
    cpuLo: g('stat_cpu_lo', fallback.cpuPct),
  }
}

function resetStatWindow(brain: BrainLike, stats: HostStats): void {
  const put = (k: string, v: number) =>
    brain.run(
      `INSERT INTO sentinel_meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v`,
      k,
      v,
    )
  put('stat_mem_hi', stats.memUsedPct)
  put('stat_mem_lo', stats.memUsedPct)
  put('stat_cpu_hi', stats.cpuPct)
  put('stat_cpu_lo', stats.cpuPct)
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
      const age = now - (last.created_at ?? 0)
      // Past SLA AND still recent — a message older than SLA_RECENT_MS is treated
      // as abandoned/handled, not an actively-waiting customer (avoids alerting
      // on stale or test threads forever).
      if (age >= THREAD_SLA_MS && age <= SLA_RECENT_MS) breached++
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
        )}m (within the last ${Math.round(SLA_RECENT_MS / 3_600_000)}h) — an agent may not be responding.`,
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
// Global central-mcp providers (no per-store context needed). VIN is NOT here:
// vin_token_status requires a per-store orgId, so it is checked per-profile by
// vinHealthCheck.
const PROVIDER_PROBES: Array<{ provider: string; tool: string }> = [
  { provider: 'vapi', tool: 'vapi_list_assistants' },
  { provider: 'tavus', tool: 'tavus_list_personas' },
]

/**
 * Re-emit currently-open findings whose key starts with `prefix`. Used by
 * throttled checks when they skip a pass, so their open findings stay "seen"
 * and are NOT auto-resolved between runs (they resolve only when the check
 * actually re-runs and finds them gone).
 */
function reEmitOpen(brain: BrainLike, prefix: string): Array<Finding> {
  return brain.all<Finding>(
    `SELECT key, severity, category, profile, title, detail
       FROM sentinel_event WHERE status='open' AND key LIKE ?`,
    `${prefix}%`,
  )
}

/**
 * Per-store VIN reachability/auth — `vin_token_status` needs the store's orgId.
 * Stores without a configured orgId are skipped (not an alarm). VIN is live for
 * all stores, so this runs per profile.
 */
export const vinHealthCheck: SentinelCheck = {
  name: 'vin-health',
  category: 'integration',
  scope: 'profile',
  async run({ profile, call, vinOrgId }) {
    if (!profile) return []
    const org = vinOrgId(profile)
    if (!org.ok || !org.orgId) return [] // not configured for VIN ⇒ skip
    const res = await call('vin_token_status', { orgId: org.orgId }).catch((e: unknown) => ({
      ok: false as const,
      error: e instanceof Error ? e.message : String(e),
    }))
    if ('unconfigured' in res && res.unconfigured) return []
    if (res.ok) return []
    return [
      {
        key: `integration:vin:${profile}:unreachable`,
        severity: 'warning',
        category: 'integration',
        title: `VIN integration probe failed for ${profile}`,
        detail: `vin_token_status failed: ${
          ('error' in res && res.error) || 'unknown'
        } — VIN may be unreachable or unauthenticated for this store.`,
        profile,
      },
    ]
  },
}

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
  async run({ profile, now, store, widgetTargets }) {
    if (!profile) return []
    // Only meaningful where a conversational channel is live (the widget). VIN
    // leads don't flow through messaging-hub inbound, so a quiet/pre-launch
    // store having "no inbound" is expected, not a fault. Scope to widget
    // targets so this only fires for stores we expect inbound conversations on.
    if (!widgetTargets().some((t) => t.profile === profile)) return []
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
    // When throttled, re-emit this profile's open low-quality findings so they
    // aren't auto-resolved between hourly grading runs.
    if (lastRow && now - lastRow.v < QC_GRADE_INTERVAL_MS) {
      return reEmitOpen(brain, `conversation-qc:${profile}:low-quality:`)
    }

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

/**
 * Synthetic widget monitor — loads each customer's PUBLIC site in a real
 * browser and verifies OUR embedded widget renders + opens + shows the expected
 * channels. Once per day (heavy). Catches "a deploy broke the widget on every
 * customer page" — which no in-app check can see. System-scoped: iterates the
 * configured per-customer targets.
 *
 * A browser that cannot launch yields ONE warning ("coverage down"), never a
 * false "widget broken". A genuine widget failure is CRITICAL.
 */
export const widgetSyntheticCheck: SentinelCheck = {
  name: 'widget-synthetic',
  category: 'widget',
  scope: 'system',
  async run({ now, brain, checkWidget, widgetTargets }) {
    const targets = widgetTargets()
    if (targets.length === 0) return [] // nothing configured ⇒ nothing to assert

    // Throttle to daily; stamp up-front so a slow browser can't re-trigger.
    // When throttled, re-emit open widget findings so they are not auto-resolved
    // between daily runs.
    const last = brain.get<{ v: number }>(
      `SELECT v FROM sentinel_meta WHERE k='widget_checked_at'`,
    )
    if (last && now - last.v < WIDGET_CHECK_INTERVAL_MS) return reEmitOpen(brain, 'widget:')
    brain.run(
      `INSERT INTO sentinel_meta (k, v) VALUES ('widget_checked_at', ?)
       ON CONFLICT(k) DO UPDATE SET v=excluded.v`,
      now,
    )

    const findings: Array<Finding> = []
    let infraDown = false
    for (const t of targets) {
      for (const url of t.urls) {
        const r = await checkWidget(url, { expectChannels: t.expectChannels }).catch(
          (e: unknown) => ({
            url,
            ok: false,
            infra: true,
            error: e instanceof Error ? e.message : String(e),
          }) as WidgetCheckResult,
        )
        if (r.infra) {
          infraDown = true
          continue // coverage gap surfaced once below, not per-URL
        }
        if (!r.ok) {
          findings.push({
            key: `widget:${t.profile}:down:${url}`,
            severity: 'critical',
            category: 'widget',
            title: `Widget not functioning on ${t.profile}`,
            detail: `${url}: ${r.error ?? 'widget failed synthetic check'} (script=${r.scriptPresent}, launcher=${r.launcherPresent}, channels=${Object.keys(
              r.channels,
            )
              .filter((k) => r.channels[k])
              .join('/') || 'none'}).`,
            profile: t.profile,
          })
        }
      }
    }
    if (infraDown) {
      findings.push({
        key: 'widget:browser-unavailable',
        severity: 'warning',
        category: 'widget',
        title: 'Widget monitor could not launch a browser',
        detail:
          'The synthetic widget monitor failed to start a browser — widget coverage is DOWN until this is fixed (check Chromium in the container).',
        profile: '_system',
      })
    }
    return findings
  },
}

export const DEFAULT_CHECKS: Array<SentinelCheck> = [
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
  const checkWidget = deps.checkWidget ?? defaultCheckWidget
  const widgetTargets = deps.widgetTargets ?? defaultReadWidgetTargets
  const sampleStats = deps.sampleStats ?? sampleHostStats
  const runBackup = deps.runBackup ?? (() => runDailyBackup({ now }))
  const vinOrgId =
    deps.vinOrgId ??
    ((p: string) => {
      const r = resolveVinOrgId(p, readStudioConfig(p).config)
      return r.ok ? { ok: true, orgId: r.orgId } : { ok: false }
    })
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
    digestSent: false,
    errors: [],
    healthy: true,
  }

  const seen = new Set<string>()
  const toAlert: Array<Finding> = []

  for (const check of checks) {
    const base = { now, call, brain, store, probeTextmagic, grade, checkWidget, widgetTargets, vinOrgId }
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

  // Sample host stats every pass (feeds the digest's daily high/low).
  let stats: HostStats | null = null
  try {
    stats = sampleStats()
    recordStatSample(brain, stats)
  } catch (e) {
    summary.errors.push({ check: 'host-stats', error: e instanceof Error ? e.message : String(e) })
  }

  // Daily digest — ALWAYS once per heartbeatMs (uptime + system stats + backup
  // + open issues), regardless of health. Immediate alerts above are separate.
  if (alertTo.length > 0 && stats) {
    const lastDigest = brain.get<{ v: number }>(
      `SELECT v FROM sentinel_meta WHERE k='last_heartbeat'`,
    )
    if (!lastDigest || now - lastDigest.v >= heartbeatMs) {
      const window = readStatWindow(brain, stats)
      let backup: BackupReport
      try {
        backup = runBackup()
      } catch (e) {
        backup = {
          ok: false,
          dbCount: 0,
          bytes: 0,
          dir: null,
          at: now,
          errors: [e instanceof Error ? e.message : String(e)],
        }
      }
      const open = brain
        .all<{ severity: Severity; profile: string; title: string; detail: string; category: string }>(
          `SELECT severity, profile, title, detail, category FROM sentinel_event WHERE status='open'
           ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END`,
        )
        .map((r) => ({ ...r, key: '' }) as Finding)
      const r = await sendEmail({
        to: alertTo,
        subject: open.length
          ? `🛡️ Sentinel daily digest — ${open.length} open issue(s)`
          : '🛡️ Sentinel daily digest — all clear',
        html: digestHtml({ now, stats, window, backup, open }),
      })
      if (r.ok) {
        summary.digestSent = true
        brain.run(
          `INSERT INTO sentinel_meta (k, v) VALUES ('last_heartbeat', ?)
           ON CONFLICT(k) DO UPDATE SET v=excluded.v`,
          now,
        )
        resetStatWindow(brain, stats) // start a fresh daily high/low window
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
