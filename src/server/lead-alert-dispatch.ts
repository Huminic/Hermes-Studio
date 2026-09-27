/**
 * Lead-aging alert dispatch (N3.4 — Serra comms recovery).
 *
 * Turns the lead-aging buckets (lead-aging.ts) into a per-store email addressed
 * to the store's management audience (comms.management_audience.emails), NOT the
 * operator. Gated by comms.alerts.enabled; only delivered inside business hours
 * (Mon–Sat 08:00–19:00 CT by default, holidays frozen); deduped by
 * (profile, bucket, leadId) per day so a lead alerts at most once per bucket per
 * day. Aging is business-hours-linear (the operator's rule) via lead-aging.
 *
 * Pure over injected deps (lead fetch, email sink, dedup marker, clock) so the
 * gating / dedup / addressing are unit-tested without VIN, Resend or a Brain.
 * The sentinel check wrapper in sentinel.ts wires the real deps.
 */
import {
  evaluateLeadAlerts,
  businessHoursElapsedMs,
  isWithinBusinessHours,
  DEFAULT_BUSINESS_HOURS,
  type BusinessHoursCfg,
} from './lead-aging'
import {
  renderReportEmail,
  waitingColor,
  statusColor,
  STATUS_AMBER,
  STATUS_BLUE,
  type TableCell,
} from './report-email'

/** One lead the dispatcher reasons about (read-only projection). */
export type AlertLead = {
  leadId: string
  leadStatus?: string | null
  leadStatusType?: string | null
  createdUtc?: string | null
  source?: string | null
  firstName?: string | null
}

export type LeadAlertBucketKey =
  | 'noStatus'
  | 'unactionedOver5Min'
  | 'sittingOver3Days'
  | 'staleStatus'

const BUCKET_LABEL: Record<LeadAlertBucketKey, string> = {
  noStatus: 'No status',
  unactionedOver5Min: 'Unactioned >5m',
  sittingOver3Days: 'Sitting >3d',
  staleStatus: 'Same status >1wk',
}

export type LeadAlertRow = {
  leadId: string
  bucket: LeadAlertBucketKey
  firstName: string | null
  source: string | null
  hoursWaiting: number | null
  status: string | null
}

export type EmailSink = (input: {
  to: string[]
  subject: string
  html: string
  text: string
}) => Promise<{ ok: boolean; error?: string }>

export type DispatchLeadAlertsDeps = {
  /** Read-only lead fetch for the profile. */
  fetchLeads: () => Promise<AlertLead[]>
  /** Email sink (the existing sentinel/notifications path). */
  sendEmail: EmailSink
  /** Dedup marker read: has (profile,bucket,leadId,day) already alerted? */
  wasAlerted: (key: string) => boolean
  /** Dedup marker write: stamp a delivered alert. */
  markAlerted: (key: string) => void
  now?: number
  /** leadIds flagged "same status >1 week" from snapshot history (empty until history exists). */
  staleStatus?: string[]
}

/** Short human status ("ACTIVE_NEW_LEAD" → "New"). */
function statusShort(status?: string | null): string {
  const s = (status ?? '').trim()
  if (!s) return 'no status'
  if (s === 'ACTIVE_NEW_LEAD') return 'New'
  return s.toLowerCase().replace(/_/g, ' ').replace(/\bactive\b/, '').trim().replace(/^\w/, (c) => c.toUpperCase()) || s
}

/** YYYY-MM-DD of `ms` in `tz` (for the per-day dedup key). */
function tzDate(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms))
}

export function dedupKey(profile: string, day: string, bucket: LeadAlertBucketKey, leadId: string): string {
  return `lead-alert:${profile}:${day}:${bucket}:${leadId}`
}

export type DispatchResult = {
  sent: boolean
  alerted: LeadAlertRow[]
  /** Reason nothing was sent (empty when sent or when there was simply nothing new). */
  skipped: string
}

/**
 * Evaluate + deliver lead-aging alerts for one store. Returns which rows were
 * alerted (deduped) and, when nothing went out, why.
 */
export async function dispatchLeadAlerts(opts: {
  profile: string
  storeName: string
  agentName: string
  emails: string[]
  alertsEnabled: boolean
  businessHours?: BusinessHoursCfg
  deps: DispatchLeadAlertsDeps
}): Promise<DispatchResult> {
  const cfg = opts.businessHours ?? DEFAULT_BUSINESS_HOURS
  const now = opts.deps.now ?? Date.now()

  if (!opts.alertsEnabled) return { sent: false, alerted: [], skipped: 'alerts disabled' }
  if (opts.emails.length === 0) return { sent: false, alerted: [], skipped: 'no recipients' }
  // Alerts are business-hours only (Mon–Sat 08:00–19:00, holidays frozen).
  if (!isWithinBusinessHours(now, cfg)) {
    return { sent: false, alerted: [], skipped: 'outside business hours' }
  }

  const leads = await opts.deps.fetchLeads()
  const byId = new Map<string, AlertLead>()
  for (const l of leads) if (l.leadId) byId.set(l.leadId, l)

  const buckets = evaluateLeadAlerts({ leads, now, businessHours: cfg })
  const bucketIds: Array<[LeadAlertBucketKey, string[]]> = [
    ['noStatus', buckets.noStatus],
    ['unactionedOver5Min', buckets.unactionedOver5Min],
    ['sittingOver3Days', buckets.sittingOver3Days],
    ['staleStatus', opts.deps.staleStatus ?? []],
  ]

  const day = tzDate(now, cfg.tz)
  const rows: LeadAlertRow[] = []
  const keys: string[] = []
  const seenLead = new Set<string>() // a lead appears once even if in multiple buckets
  for (const [bucket, ids] of bucketIds) {
    for (const id of ids) {
      if (!id) continue
      const key = dedupKey(opts.profile, day, bucket, id)
      if (opts.deps.wasAlerted(key)) continue
      if (seenLead.has(id)) {
        // Still stamp so the same lead in a second bucket doesn't re-alert later today.
        keys.push(key)
        continue
      }
      seenLead.add(id)
      const lead = byId.get(id)
      const createdMs = lead?.createdUtc ? Date.parse(lead.createdUtc) : NaN
      const hoursWaiting = Number.isFinite(createdMs)
        ? Math.round(businessHoursElapsedMs(createdMs, now, cfg) / 3_600_000)
        : null
      rows.push({
        leadId: id,
        bucket,
        firstName: lead?.firstName ?? null,
        source: lead?.source ?? null,
        hoursWaiting,
        status: lead?.leadStatus ?? null,
      })
      keys.push(key)
    }
  }

  if (rows.length === 0) return { sent: false, alerted: [], skipped: 'nothing new' }

  const { html, text } = renderLeadAlertEmail({
    storeName: opts.storeName,
    agentName: opts.agentName,
    rows,
  })
  const subject = `Lead alert — ${opts.storeName}: ${rows.length} ${rows.length === 1 ? 'lead needs' : 'leads need'} attention`
  const res = await opts.deps.sendEmail({ to: opts.emails, subject, html, text })
  if (!res.ok) return { sent: false, alerted: [], skipped: `send failed: ${res.error ?? 'unknown'}` }

  for (const k of keys) opts.deps.markAlerted(k)
  return { sent: true, alerted: rows, skipped: '' }
}

/** Render the lead-alert email as a short table (lead, source, waiting, status). */
export function renderLeadAlertEmail(input: {
  storeName: string
  agentName: string
  rows: LeadAlertRow[]
}): { html: string; text: string } {
  const tableRows: TableCell[][] = input.rows.map((r) => [
    { value: (r.firstName && r.firstName.trim()) || `Lead ${r.leadId}`, bold: true },
    r.source ?? 'n/a',
    {
      value: r.hoursWaiting == null ? 'n/a' : `${r.hoursWaiting}h`,
      color: waitingColor(r.hoursWaiting),
    },
    { value: statusShort(r.status), color: statusColor(r.status) },
    BUCKET_LABEL[r.bucket],
  ])
  const context =
    `${input.rows.length} ${input.rows.length === 1 ? 'lead needs' : 'leads need'} a salesperson at ${input.storeName}. ` +
    `Aging is counted in business hours only.`
  return renderReportEmail({
    storeName: input.storeName,
    agentName: input.agentName,
    headline: 'Leads need attention',
    greeting: 'Hi team,',
    context,
    tiles: [],
    sections: [
      {
        kind: 'table',
        title: 'Leads needing attention',
        columns: [
          { label: 'Lead', align: 'left' },
          { label: 'Source', align: 'left' },
          { label: 'Waiting', color: STATUS_AMBER, align: 'left' },
          { label: 'Status', color: STATUS_BLUE, align: 'left' },
          { label: 'Bucket', align: 'left' },
        ],
        rows: tableRows,
      },
    ],
    cta: { label: 'Open VinSolutions', url: 'https://apps.vinsolutions.com/' },
    footnotes: ['Sales only (service excluded). Aging counted in business hours only.'],
  })
}
