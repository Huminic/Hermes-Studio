/**
 * Manual / alert notifications store (per-profile brain.db). Distinct from the
 * studio's notification *routing rules*: this is a table of concrete alerts a
 * user created, shown on the Notifications page. Two shapes share the table:
 *
 *  - MANUAL notification (e.g. from an Issue's "Create Alert") — email + a human
 *    query name + a non-technical description; rule columns are null.
 *  - METRIC ALERT (from the alert wizard) — watches ONE Watchdog metric slug and
 *    fires when it crosses a manual threshold or moves beyond a per-dealer baseline
 *    band. Carries metric_id/label, rule_type, direction, threshold OR baseline_sigma,
 *    and last_fired_at for 24h dedup. Firing NEVER takes an autonomous action — it
 *    only notifies the configured email.
 */
import { openBrain, uuid } from '../brain-store'

export type AlertRuleType = 'threshold' | 'baseline'
/** 'above' = crosses above (rising past the bound); 'below' = falls below. */
export type AlertDirection = 'above' | 'below'

export type NotificationRecord = {
  id: string
  profile: string
  email: string
  /** Human name of the underlying query/rule (e.g. "Customer waiting on a reply"). */
  query_name: string
  /** Non-technical description of what it does (shown in the modal + list). */
  description: string
  /** Origin: a watchdog finding key, 'manual', 'metric-alert', etc. */
  source: string
  status: 'active' | 'paused'
  created_at: number
  // ── metric-alert rule (null on manual notifications) ──
  /** Watchdog metric slug this alert watches (e.g. 'appt.show_rate'), or null. */
  metric_id: string | null
  /** Friendly metric name shown in the UI (e.g. 'Appointment show rate'). */
  metric_label: string | null
  rule_type: AlertRuleType | null
  direction: AlertDirection | null
  /** Manual threshold value (rule_type='threshold'). */
  threshold: number | null
  /** Baseline band width in standard deviations (rule_type='baseline', e.g. 2 or 3). */
  baseline_sigma: number | null
  /** Epoch ms of the last time this alert fired (24h dedup); null if never. */
  last_fired_at: number | null
}

type Handle = ReturnType<typeof openBrain>

/** Columns added after the original manual-only schema — migrated in on open. */
const RULE_COLUMNS: Array<[string, string]> = [
  ['metric_id', 'TEXT'],
  ['metric_label', 'TEXT'],
  ['rule_type', 'TEXT'],
  ['direction', 'TEXT'],
  ['threshold', 'REAL'],
  ['baseline_sigma', 'REAL'],
  ['last_fired_at', 'INTEGER'],
]

function ensure(profile: string, profileRoot?: string): Handle {
  const h = openBrain(profile, { profileRoot })
  h.exec(
    `CREATE TABLE IF NOT EXISTS notification (
       id          TEXT PRIMARY KEY,
       profile     TEXT NOT NULL,
       email       TEXT NOT NULL,
       query_name  TEXT NOT NULL,
       description TEXT NOT NULL,
       source      TEXT NOT NULL DEFAULT 'manual',
       status      TEXT NOT NULL DEFAULT 'active',
       created_at  INTEGER NOT NULL
     )`,
  )
  // Backward-compatible migration: add metric-alert columns if an older DB predates them.
  const existing = new Set(
    h.all<{ name: string }>(`PRAGMA table_info(notification)`).map((r) => r.name),
  )
  for (const [col, type] of RULE_COLUMNS) {
    if (!existing.has(col)) h.exec(`ALTER TABLE notification ADD COLUMN ${col} ${type}`)
  }
  return h
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim())
}

/** Accepts one email or a comma/semicolon-separated list; all must be valid. */
export function parseRecipients(raw: string): { ok: true; emails: Array<string> } | { ok: false; error: string } {
  const emails = raw.split(/[;,]/).map((e) => e.trim()).filter(Boolean)
  if (emails.length === 0) return { ok: false, error: 'A valid recipient email is required.' }
  const bad = emails.filter((e) => !isValidEmail(e))
  if (bad.length > 0) return { ok: false, error: `Invalid email(s): ${bad.join(', ')}` }
  return { ok: true, emails }
}

export function createNotification(
  input: {
    profile: string
    email: string
    query_name: string
    description: string
    source?: string
  },
  now: number,
  opts: { profileRoot?: string } = {},
): { ok: true; id: string } | { ok: false; error: string } {
  if (!isValidEmail(input.email)) return { ok: false, error: 'A valid email is required.' }
  if (!input.query_name.trim()) return { ok: false, error: 'A query name is required.' }
  const h = ensure(input.profile, opts.profileRoot)
  const id = uuid()
  h.run(
    `INSERT INTO notification (id, profile, email, query_name, description, source, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
    id, input.profile, input.email.trim(), input.query_name.trim(),
    input.description.trim(), input.source ?? 'manual', now,
  )
  return { ok: true, id }
}

export type MetricAlertInput = {
  profile: string
  email: string
  /** Watchdog metric slug (e.g. 'appt.show_rate'). */
  metric_id: string
  /** Friendly label shown in the UI. */
  metric_label: string
  rule_type: AlertRuleType
  direction: AlertDirection
  /** Required when rule_type='threshold'. */
  threshold?: number | null
  /** Required when rule_type='baseline' (e.g. 2 or 3). */
  baseline_sigma?: number | null
  /** Optional human query name; defaults from the metric label + rule. */
  query_name?: string
  description?: string
}

/** Human, non-technical sentence describing what a metric alert watches. */
export function describeMetricAlert(a: {
  metric_label: string
  rule_type: AlertRuleType
  direction: AlertDirection
  threshold?: number | null
  baseline_sigma?: number | null
}): string {
  const dir = a.direction === 'above' ? 'rises above' : 'falls below'
  if (a.rule_type === 'threshold') {
    return `Alerts when ${a.metric_label} ${dir} ${a.threshold}.`
  }
  const sig = a.baseline_sigma ?? 2
  const side = a.direction === 'above' ? 'unusually high' : 'unusually low'
  return `Alerts when ${a.metric_label} is ${side} for this dealer (beyond ${sig}σ of its recent baseline).`
}

/** Create a metric-driven alert (from the wizard). Per-dealer (profile-scoped). */
export function createMetricAlert(
  input: MetricAlertInput,
  now: number,
  opts: { profileRoot?: string } = {},
): { ok: true; id: string } | { ok: false; error: string } {
  const rec = parseRecipients(input.email)
  if (!rec.ok) return rec
  if (!input.metric_id.trim()) return { ok: false, error: 'A metric is required.' }
  if (input.rule_type === 'threshold') {
    if (input.threshold == null || !Number.isFinite(input.threshold)) {
      return { ok: false, error: 'A numeric threshold is required.' }
    }
  } else if (input.rule_type === 'baseline') {
    const sig = input.baseline_sigma
    if (sig == null || !Number.isFinite(sig) || sig <= 0) {
      return { ok: false, error: 'A positive baseline band (σ) is required.' }
    }
  } else {
    return { ok: false, error: 'Unknown rule type.' }
  }
  const query_name = (input.query_name ?? `${input.metric_label} ${input.direction === 'above' ? 'high' : 'low'}`).trim()
  const description = (input.description ?? describeMetricAlert({
    metric_label: input.metric_label, rule_type: input.rule_type, direction: input.direction,
    threshold: input.threshold, baseline_sigma: input.baseline_sigma,
  })).trim()

  const h = ensure(input.profile, opts.profileRoot)
  const id = uuid()
  h.run(
    `INSERT INTO notification
       (id, profile, email, query_name, description, source, status, created_at,
        metric_id, metric_label, rule_type, direction, threshold, baseline_sigma, last_fired_at)
     VALUES (?, ?, ?, ?, ?, 'metric-alert', 'active', ?, ?, ?, ?, ?, ?, ?, NULL)`,
    id, input.profile, rec.emails.join(', '), query_name, description, now,
    input.metric_id.trim(), input.metric_label.trim(), input.rule_type, input.direction,
    input.rule_type === 'threshold' ? input.threshold : null,
    input.rule_type === 'baseline' ? input.baseline_sigma : null,
  )
  return { ok: true, id }
}

/**
 * Create a metric alert as an INACTIVE (paused) record. Additive + safe: existing
 * createMetricAlert is unchanged (still inserts 'active'). A paused rule is excluded from
 * listMetricAlerts, so the Watchdog engine never evaluates it and dispatch never sends.
 * Because it can never send, a recipient is OPTIONAL here (empty email allowed). Only a
 * BOUND rule (metric_id + valid threshold/baseline) is registrable.
 */
export function createPausedMetricAlert(
  input: MetricAlertInput,
  now: number,
  opts: { profileRoot?: string } = {},
): { ok: true; id: string } | { ok: false; error: string } {
  if (!input.metric_id.trim()) return { ok: false, error: 'A metric is required.' }
  if (input.rule_type === 'threshold') {
    if (input.threshold == null || !Number.isFinite(input.threshold)) {
      return { ok: false, error: 'A numeric threshold is required.' }
    }
  } else if (input.rule_type === 'baseline') {
    const sig = input.baseline_sigma
    if (sig == null || !Number.isFinite(sig) || sig <= 0) {
      return { ok: false, error: 'A positive baseline band (σ) is required.' }
    }
  } else {
    return { ok: false, error: 'Unknown rule type.' }
  }
  // Recipient optional (paused never sends). If provided, it must still be valid.
  let email = ''
  if (input.email && input.email.trim()) {
    const rec = parseRecipients(input.email)
    if (!rec.ok) return rec
    email = rec.emails.join(', ')
  }
  const query_name = (input.query_name ?? `${input.metric_label} ${input.direction === 'above' ? 'high' : 'low'}`).trim()
  const description = (input.description ?? describeMetricAlert({
    metric_label: input.metric_label, rule_type: input.rule_type, direction: input.direction,
    threshold: input.threshold, baseline_sigma: input.baseline_sigma,
  })).trim()
  const h = ensure(input.profile, opts.profileRoot)
  const id = uuid()
  h.run(
    `INSERT INTO notification
       (id, profile, email, query_name, description, source, status, created_at,
        metric_id, metric_label, rule_type, direction, threshold, baseline_sigma, last_fired_at)
     VALUES (?, ?, ?, ?, ?, 'metric-alert', 'paused', ?, ?, ?, ?, ?, ?, ?, NULL)`,
    id, input.profile, email, query_name, description, now,
    input.metric_id.trim(), input.metric_label.trim(), input.rule_type, input.direction,
    input.rule_type === 'threshold' ? input.threshold : null,
    input.rule_type === 'baseline' ? input.baseline_sigma : null,
  )
  return { ok: true, id }
}

export function listNotifications(
  profile: string,
  opts: { limit?: number; profileRoot?: string } = {},
): Array<NotificationRecord> {
  const h = ensure(profile, opts.profileRoot)
  return h.all<NotificationRecord>(
    `SELECT * FROM notification WHERE profile = ? ORDER BY created_at DESC LIMIT ?`,
    profile, opts.limit ?? 200,
  )
}

/** Active metric-alert rules for a profile (the set the Watchdog engine evaluates). */
export function listMetricAlerts(
  profile: string,
  opts: { profileRoot?: string } = {},
): Array<NotificationRecord> {
  return listNotifications(profile, opts).filter(
    (n) => n.status === 'active' && n.metric_id != null && n.rule_type != null,
  )
}

export function deleteNotification(
  profile: string,
  id: string,
  opts: { profileRoot?: string } = {},
): boolean {
  const h = ensure(profile, opts.profileRoot)
  return h.run(`DELETE FROM notification WHERE profile = ? AND id = ?`, profile, id).changes > 0
}

/** Record that an alert fired (for 24h dedup). */
export function markAlertFired(
  profile: string,
  id: string,
  now: number,
  opts: { profileRoot?: string } = {},
): void {
  const h = ensure(profile, opts.profileRoot)
  h.run(`UPDATE notification SET last_fired_at = ? WHERE profile = ? AND id = ?`, now, profile, id)
}

const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000

export type AlertEvaluation =
  | { fires: false; reason: string }
  | { fires: true; observed: number; bound: number; message: string }

/**
 * Pure rule evaluation for one metric alert against a current value and (for
 * baseline rules) a per-dealer baseline band. NEVER takes an action — returns a
 * decision. Withholds (fires:false) when the value is null/absent (missing is not
 * zero) or when the alert already fired within the 24h dedup window.
 */
export function evaluateAlertRule(
  rule: Pick<NotificationRecord, 'metric_label' | 'rule_type' | 'direction' | 'threshold' | 'baseline_sigma' | 'last_fired_at'>,
  ctx: {
    value: number | null
    now: number
    /** Per-dealer baseline for rule_type='baseline'. */
    baseline?: { mean: number; stddev: number } | null
  },
): AlertEvaluation {
  if (ctx.value == null || !Number.isFinite(ctx.value)) {
    return { fires: false, reason: 'no current value for the metric (withheld — missing is not zero)' }
  }
  if (rule.last_fired_at != null && ctx.now - rule.last_fired_at < DEDUP_WINDOW_MS) {
    return { fires: false, reason: 'already alerted within the last 24h (dedup)' }
  }
  const dir = rule.direction ?? 'below'
  let bound: number
  if (rule.rule_type === 'threshold') {
    if (rule.threshold == null) return { fires: false, reason: 'threshold rule missing a threshold' }
    bound = rule.threshold
  } else if (rule.rule_type === 'baseline') {
    if (!ctx.baseline || rule.baseline_sigma == null) {
      return { fires: false, reason: 'baseline rule needs a per-dealer baseline (still building history)' }
    }
    bound = dir === 'above'
      ? ctx.baseline.mean + rule.baseline_sigma * ctx.baseline.stddev
      : ctx.baseline.mean - rule.baseline_sigma * ctx.baseline.stddev
  } else {
    return { fires: false, reason: 'unknown rule type' }
  }
  const crossed = dir === 'above' ? ctx.value > bound : ctx.value < bound
  if (!crossed) return { fires: false, reason: `${ctx.value} did not ${dir === 'above' ? 'exceed' : 'fall below'} ${bound}` }
  const verb = dir === 'above' ? 'rose above' : 'fell below'
  return {
    fires: true,
    observed: ctx.value,
    bound,
    message: `${rule.metric_label} ${verb} ${round(bound)} (now ${round(ctx.value)}).`,
  }
}

const round = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000))
