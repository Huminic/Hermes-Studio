#!/usr/bin/env npx tsx
/**
 * Comms preview runner (N1.2 — Serra comms recovery).
 *
 * Read-only live shell around `assemblePreviewBundle` / `writePreviewArtifacts`.
 * Fetches everything the Daily AI Management report, Lead Source report, nightly
 * text report and lead-aging alerts need from live data (VinSolutions leads +
 * the messaging hub), derives each figure, and writes six artifacts to --out for
 * a supervisor to reconcile from `<profile>-raw-counts.json`. It NEVER sends:
 * it imports no dispatch/automation/TextMagic path (guarded by a test).
 *
 * Run INSIDE the studio container (read-only):
 *   docker exec $(docker ps --format '{{.Names}}' | grep -m1 '^hermes-studio-') \
 *     npx tsx scripts/comms-preview.ts --profile serra-ford --out /tmp/preview
 */
import { readStudioConfig } from '../src/server/studio-config'
import { resolveVinOrgId, resolveLeadNames } from '../src/server/vin-client'
import {
  fetchAllLeads,
  fetchLeadSources,
  summarizeOpportunities,
  resolveSourceLabel,
  SALES_LEAD_TYPES,
  type LeadSourceOpportunities,
} from '../src/server/lead-opportunities'
import { listMessagesInWindow, type WindowMessage } from '../src/server/messaging-hub-store'
import {
  writePreviewArtifacts,
  type PreviewInput,
  type PreviewRawCounts,
  type AlertLeadDetail,
} from '../src/server/comms-preview'
import {
  splitByBusinessHours,
  avgAfterHoursTimeToTextMin,
  type ContactGap,
} from '../src/server/daily-management-report'
import {
  isWithinBusinessHours,
  evaluateLeadAlerts,
  DEFAULT_BUSINESS_HOURS,
  type BusinessHoursCfg,
  type LeadForAlert,
} from '../src/server/lead-aging'
import { deltaOf } from '../src/server/text-report'
import { localMidnight } from '../src/server/catchup-common'

const H = 60 * 60_000
const DAY = 24 * H
const VOICE_CHANNELS = new Set(['voice', 'vapi'])

type Window = 'morning' | 'wrapup'
type Args = { profile: string; date: string | null; out: string; window: Window; help: boolean }

const USAGE = `comms-preview.ts — read-only live preview of the daily reports, text report and alerts

  --profile <p>     store profile (required)
  --date YYYY-MM-DD report day (default: today in the store's comms.business_hours tz)
  --window <w>      morning (default): prev business-day CLOSE → report-day OPEN
                    wrapup: report-day OPEN → now (end-of-day). Files get a -wrapup prefix.
  --out <dir>       output directory for the six artifacts (default: .)
  --help            this message

Writes (morning): <profile>-preview.txt, <profile>-daily-management.json, <profile>-lead-source.json,
        <profile>-text-report.txt, <profile>-alerts.json, <profile>-raw-counts.json
Writes (wrapup):  the same set with a <profile>-wrapup- prefix`

function parseArgs(argv: string[]): Args {
  const a: Args = { profile: '', date: null, out: '.', window: 'morning', help: false }
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]
    if (t === '--help' || t === '-h') a.help = true
    else if (t === '--profile') a.profile = argv[++i]
    else if (t.startsWith('--profile=')) a.profile = t.slice('--profile='.length)
    else if (t === '--date') a.date = argv[++i]
    else if (t.startsWith('--date=')) a.date = t.slice('--date='.length)
    else if (t === '--out') a.out = argv[++i]
    else if (t.startsWith('--out=')) a.out = t.slice('--out='.length)
    else if (t === '--window') a.window = argv[++i] === 'wrapup' ? 'wrapup' : 'morning'
    else if (t.startsWith('--window=')) a.window = t.slice('--window='.length) === 'wrapup' ? 'wrapup' : 'morning'
  }
  return a
}

// ── Field accessors (VIN response shape isn't ours — accept variants) ─────────
function str(v: unknown): string | null {
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (typeof v === 'number') return String(v)
  return null
}
function leadTypeOf(l: Record<string, unknown>): string {
  return (str(l.leadType) ?? str(l.lead_type) ?? '').toUpperCase()
}
function createdMsOf(l: Record<string, unknown>): number | null {
  const c = str(l.createdUtc)
  if (!c) return null
  const t = Date.parse(c)
  return Number.isFinite(t) ? t : null
}

// ── Business-hours config from the store's comms.business_hours ───────────────
function parseHour(hhmm: string | undefined, fallback: number): number {
  if (!hhmm) return fallback
  const h = parseInt(hhmm.split(':')[0] ?? '', 10)
  return Number.isFinite(h) ? h : fallback
}
function toBusinessHoursCfg(comms: unknown): BusinessHoursCfg {
  const bh =
    (comms as { business_hours?: { tz?: string; start?: string; end?: string } })?.business_hours ?? {}
  const holidays = (comms as { holidays?: string[] })?.holidays ?? []
  return {
    tz: bh.tz ?? DEFAULT_BUSINESS_HOURS.tz,
    startHour: parseHour(bh.start, DEFAULT_BUSINESS_HOURS.startHour),
    endHour: parseHour(bh.end, DEFAULT_BUSINESS_HOURS.endHour),
    businessWeekdays: new Set(DEFAULT_BUSINESS_HOURS.businessWeekdays),
    holidays: new Set(holidays),
  }
}

/** Local midnight (ms) of a calendar date in `tz`. Assumes a US tz (noon UTC is
 *  the same calendar day locally), which holds for every Serra store. */
function localMidnightOfDate(tz: string, dateStr: string): number {
  return localMidnight(tz, Date.parse(`${dateStr}T12:00:00Z`))
}

/** Today's YYYY-MM-DD in `tz`. */
function todayInTz(tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** 1-based day-of-year for the text-report variant rotation. */
function dayOfYear(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00Z`)
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 0))
  return Math.floor((d.getTime() - start.getTime()) / DAY)
}

/**
 * Report window bounds (N3.2). Both are ms.
 *
 * MORNING: previous business-day CLOSE → report-day OPEN. The previous business
 * day is the most recent day before report-day that is a business weekday and
 * not a holiday (Sunday/holidays skipped), so a Monday report covers Saturday
 * 19:00 → Monday 08:00 and never repeats Saturday's wrap-up. WRAPUP: report-day
 * OPEN → now. Pure over the injected cfg + clock so Monday/Tuesday are testable.
 */
export function computeReportWindow(opts: {
  date: string
  window: Window
  cfg: BusinessHoursCfg
  now: number
}): { start: number; end: number } {
  const { date, window, cfg, now } = opts
  const tz = cfg.tz
  const reportDayOpen = localMidnightOfDate(tz, date) + cfg.startHour * H
  if (window === 'wrapup') {
    return { start: reportDayOpen, end: now }
  }
  const end = reportDayOpen
  // Default fallback: a plain 24h look-back if no business day is found.
  let start = end - DAY
  let dayMid = localMidnight(tz, end - 12 * H) // previous calendar day's midnight
  for (let i = 0; i < 14; i++) {
    // A day is a business day iff its open hour is inside business hours
    // (business weekday, not a holiday). Take that day's CLOSE as the start.
    if (isWithinBusinessHours(dayMid + cfg.startHour * H, cfg)) {
      start = dayMid + cfg.endHour * H
      break
    }
    dayMid = localMidnight(tz, dayMid - 12 * H)
  }
  return { start, end }
}

function toSourceSummary(rows: Array<LeadSourceOpportunities>) {
  return rows.map((r) => ({ lead_source: r.lead_source, opportunities: r.opportunities, sold: r.sold }))
}

/** Per-thread (inbound, first later outbound) pairs for the time-to-text metric. */
function timeToTextPairs(messages: Array<WindowMessage>): Array<ContactGap> {
  const byThread = new Map<string, Array<WindowMessage>>()
  for (const m of messages) {
    const arr = byThread.get(m.thread_id) ?? []
    arr.push(m)
    byThread.set(m.thread_id, arr)
  }
  const pairs: Array<ContactGap> = []
  for (const arr of byThread.values()) {
    arr.sort((a, b) => a.created_at - b.created_at)
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].direction !== 'inbound') continue
      const out = arr.find((m, j) => j > i && m.direction === 'outbound')
      if (out) pairs.push({ inboundMs: arr[i].created_at, firstOutboundMs: out.created_at })
    }
  }
  return pairs
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(USAGE)
    process.exit(0)
  }
  if (!args.profile) {
    console.error('[comms-preview] --profile is required')
    process.exit(1)
  }

  const { config } = readStudioConfig(args.profile)
  const cfg = toBusinessHoursCfg(config.comms)
  const tz = cfg.tz
  const date = args.date ?? todayInTz(tz)

  // N3.2 windows: MORNING = previous business-day CLOSE → report-day OPEN (so
  // the overnight/weekend after-hours shift rolls in and Saturday's wrap-up is
  // never repeated on Monday); WRAP-UP = report-day OPEN → now.
  const { start, end } = computeReportWindow({ date, window: args.window, cfg, now: Date.now() })

  const org = resolveVinOrgId(args.profile, config)
  if (!org.ok) {
    console.error(`[comms-preview] unconfigured VIN org for ${args.profile}: ${org.reason}`)
    process.exit(1)
  }

  // ONE 30-day VIN pull covers every window; sub-windows are filtered by createdUtc.
  const win30Start = end - 30 * DAY
  const fetched = await fetchAllLeads({
    orgId: org.orgId,
    startDate: new Date(win30Start).toISOString(),
    endDate: new Date(end).toISOString(),
  })
  if (!fetched.ok) {
    console.error(`[comms-preview] lead query failed: ${fetched.reason}`)
    process.exit(1)
  }
  const leads30 = fetched.leads
  const sourceNames = await fetchLeadSources({ orgId: org.orgId })

  const inWindow = (l: Record<string, unknown>, s: number, e: number) => {
    const t = createdMsOf(l)
    return t != null && t >= s && t < e
  }
  const salesLeads = (rows: Array<Record<string, unknown>>) =>
    rows.filter((l) => SALES_LEAD_TYPES.has(leadTypeOf(l)))

  // ── Daily AI Management metrics ─────────────────────────────────────────────
  const reportLeads = salesLeads(leads30.filter((l) => inWindow(l, start, end)))
  const leadInstants = reportLeads.map((l) => createdMsOf(l)).filter((t): t is number => t != null)
  const leadSplit = splitByBusinessHours(leadInstants, cfg)

  const winMessages = listMessagesInWindow(args.profile, start, end)
  const inboundVoiceAfterHours = winMessages.filter(
    (m) => m.direction === 'inbound' && VOICE_CHANNELS.has(m.channel) && !isWithinBusinessHours(m.created_at, cfg),
  ).length
  const outboundSms = winMessages.filter((m) => m.direction === 'outbound' && m.channel === 'sms')
  const inboundSms = winMessages.filter((m) => m.direction === 'inbound' && m.channel === 'sms').length
  const businessHoursTextCount = outboundSms.filter((m) => isWithinBusinessHours(m.created_at, cfg)).length
  // No dedicated Teambox aggregate helper exists — approximate with non-sms
  // message direction counts (documented in raw-counts).
  const teamboxSent = winMessages.filter((m) => m.direction === 'outbound' && m.channel !== 'sms').length
  const teamboxReceived = winMessages.filter((m) => m.direction === 'inbound' && m.channel !== 'sms').length
  const timePairs = timeToTextPairs(winMessages)
  const afterHoursAvgTimeToTextMin = avgAfterHoursTimeToTextMin(timePairs, cfg)

  const activeLeads30d = salesLeads(leads30).filter((l) => str(l.leadStatusType) === 'ACTIVE').length
  // leadsLeftBehind: sales leads created ≥24h before window end still ACTIVE_NEW_LEAD.
  // The "no outbound sms" sub-filter is NOT applied (per-lead phone resolution is
  // capped) — this is an UPPER BOUND; recorded in raw-counts.
  const leftBehindLeads = salesLeads(leads30).filter((l) => {
    const t = createdMsOf(l)
    return str(l.leadStatus) === 'ACTIVE_NEW_LEAD' && t != null && t <= end - DAY
  })
  const leadsLeftBehind = leftBehindLeads.length

  // ── Lead source windows (deduped per window) ────────────────────────────────
  const summ = (s: number, e: number) =>
    summarizeOpportunities(leads30.filter((l) => inWindow(l, s, e)), sourceNames)
  const s24 = summ(end - DAY, end)
  const s7 = summ(end - 7 * DAY, end)
  const s30 = summ(win30Start, end)
  const sPrev = summ(end - 2 * DAY, end - DAY)

  // ── Alerts over the current lead set ────────────────────────────────────────
  const alertLeads: Array<LeadForAlert> = salesLeads(leads30).map((l) => ({
    leadId: str(l.leadId) ?? str(l.id) ?? '',
    leadStatus: str(l.leadStatus),
    leadStatusType: str(l.leadStatusType),
    createdUtc: str(l.createdUtc),
  }))
  const alertBuckets = evaluateLeadAlerts({ leads: alertLeads, now: end, businessHours: cfg })

  // ── Enriched alert detail (N2.1) ────────────────────────────────────────────
  // Resolve first names (capped broker reads) + source labels for the leads in
  // the alert buckets so the report email's "Needs attention" section shows
  // identities, not bare ids. Read-only; never invents a name (null when unknown).
  const leadById = new Map<string, Record<string, unknown>>()
  for (const l of salesLeads(leads30)) {
    const id = str(l.leadId) ?? str(l.id)
    if (id) leadById.set(id, l)
  }
  const alertIds = new Set<string>([
    ...alertBuckets.noStatus,
    ...alertBuckets.unactionedOver5Min,
    ...alertBuckets.sittingOver3Days,
  ])
  const alertLeadRecords = [...alertIds]
    .map((id) => leadById.get(id))
    .filter((l): l is Record<string, unknown> => !!l)
  const resolved = await resolveLeadNames(alertLeadRecords, { orgId: org.orgId })
  const firstNameByLeadId = new Map<string, string | null>()
  for (const r of resolved) {
    const id = str(r.leadId) ?? str(r.id)
    if (id) firstNameByLeadId.set(id, r.resolved?.firstName ?? null)
  }
  const detailFor = (id: string): AlertLeadDetail => {
    const l = leadById.get(id)
    return {
      leadId: id,
      firstName: firstNameByLeadId.get(id) ?? null,
      source: l ? resolveSourceLabel(str(l.leadSource) ?? str(l.source) ?? 'Unknown', sourceNames) : null,
      createdUtc: l ? str(l.createdUtc) : null,
      leadStatus: l ? str(l.leadStatus) : null,
      leadType: l ? leadTypeOf(l) || null : null,
    }
  }

  // ── Text report ─────────────────────────────────────────────────────────────
  const leadsToday = leadSplit.during + leadSplit.after
  const salesLost = reportLeads.filter((l) => str(l.leadStatusType) === 'LOST').length
  const salesSold = reportLeads.filter((l) => str(l.leadStatusType) === 'SOLD').length
  const needsAttention = alertBuckets.unactionedOver5Min.length + alertBuckets.sittingOver3Days.length
  const agentName = /ford/i.test(args.profile) ? 'Georgia' : 'Caroline'

  const input: PreviewInput = {
    profile: args.profile,
    date,
    dailyMetrics: {
      leadsDuringDay: leadSplit.during,
      leadsAfterHours: leadSplit.after,
      afterHoursInboundCalls: inboundVoiceAfterHours,
      textsSentOnBehalf: outboundSms.length,
      teamboxSent,
      teamboxReceived,
      afterHoursAvgTimeToTextMin,
      businessHoursTextCount,
      leadsLeftBehind,
      activeLeads30d,
    },
    leadSource: {
      window24h: toSourceSummary(s24.by_source),
      window7d: toSourceSummary(s7.by_source),
      window30d: toSourceSummary(s30.by_source),
      prev24h: toSourceSummary(sPrev.by_source),
    },
    textReport: {
      leadsToday,
      salesLost,
      active: activeLeads30d,
      needsAttention,
      leadsDelta: deltaOf(s24.opportunities, sPrev.opportunities),
      salesDelta: deltaOf(s24.sold, sPrev.sold),
      agentName,
      rotation: dayOfYear(date),
    },
    alerts: {
      noStatus: alertBuckets.noStatus,
      unactionedOver5Min: alertBuckets.unactionedOver5Min,
      sittingOver3Days: alertBuckets.sittingOver3Days,
      // No lead-status snapshot history yet tonight → no same-status-over-1-week set.
      staleStatus: [],
      details: {
        noStatus: alertBuckets.noStatus.map(detailFor),
        unactionedOver5Min: alertBuckets.unactionedOver5Min.map(detailFor),
        sittingOver3Days: alertBuckets.sittingOver3Days.map(detailFor),
      },
    },
  }

  const rawCounts: PreviewRawCounts = {
    profile: args.profile,
    date,
    generatedAt: new Date().toISOString(),
    businessHours: { tz, startHour: cfg.startHour, endHour: cfg.endHour },
    reportWindow: { start: new Date(start).toISOString(), end: new Date(end).toISOString() },
    query: `vin_query_leads org=${org.orgId} ${new Date(win30Start).toISOString()}..${new Date(end).toISOString()} (one 30d pull, sub-windows filtered by createdUtc)`,
    leadPull: { total: leads30.length, sales: salesLeads(leads30).length, pages: fetched.pages, capped: fetched.capped, incomplete: fetched.incomplete },
    dailyManagement: {
      leadsDuringDay: leadSplit.during,
      leadsAfterHours: leadSplit.after,
      reportWindowSalesLeads: reportLeads.length,
      afterHoursInboundCalls: { value: inboundVoiceAfterHours, channelsCounted: [...VOICE_CHANNELS] },
      textsSentOnBehalf: outboundSms.length,
      businessHoursTextCount,
      teambox: { note: 'no Teambox aggregate helper — non-sms message direction counts', sent: teamboxSent, received: teamboxReceived },
      afterHoursAvgTimeToTextMin: { value: afterHoursAvgTimeToTextMin, pairs: timePairs.length },
      leadsLeftBehind: { value: leadsLeftBehind, rule: 'sales + ACTIVE_NEW_LEAD + created ≥24h before window end; "no outbound sms" filter NOT applied → upper bound' },
      activeLeads30d,
      // N2.3 wrap-up inputs (inbound sms replies + sold/lost cohort of window leads).
      repliesReceived: inboundSms,
      soldToday: salesSold,
      lostToday: salesLost,
    },
    leadSource: {
      window24h: { start: new Date(end - DAY).toISOString(), end: new Date(end).toISOString(), opportunities: s24.opportunities, sold: s24.sold },
      window7d: { start: new Date(end - 7 * DAY).toISOString(), end: new Date(end).toISOString(), opportunities: s7.opportunities, sold: s7.sold },
      window30d: { start: new Date(win30Start).toISOString(), end: new Date(end).toISOString(), opportunities: s30.opportunities, sold: s30.sold },
      prev24h: { start: new Date(end - 2 * DAY).toISOString(), end: new Date(end - DAY).toISOString(), opportunities: sPrev.opportunities, sold: sPrev.sold },
    },
    textReport: { leadsToday, salesLost, active: activeLeads30d, needsAttention, leadsDelta: deltaOf(s24.opportunities, sPrev.opportunities), salesDelta: deltaOf(s24.sold, sPrev.sold), rotation: dayOfYear(date) },
    alerts: {
      noStatus: alertBuckets.noStatus.length,
      unactionedOver5Min: alertBuckets.unactionedOver5Min.length,
      sittingOver3Days: alertBuckets.sittingOver3Days.length,
      staleStatus: { value: 0, note: 'lead-status snapshot has no history tonight → empty' },
      evaluatedLeads: alertLeads.length,
    },
    messagesInWindow: winMessages.length,
  }

  const namePrefix = args.window === 'wrapup' ? `${args.profile}-wrapup` : args.profile
  const { files } = writePreviewArtifacts({ bundle: input, outDir: args.out, rawCounts, namePrefix })
  console.log(`[comms-preview] ${args.profile} ${date} (${args.window}): wrote ${files.length} files to ${args.out}`)
  for (const f of files) console.log(`  ${f}`)
}

// Only run when invoked directly (so tests can import without executing).
if (process.argv[1] && /comms-preview\.ts$/.test(process.argv[1])) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[comms-preview] fatal:', err)
      process.exit(1)
    })
}
