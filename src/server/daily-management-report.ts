/**
 * Daily AI Management report assembly (AC6 / P5 — Serra comms recovery).
 *
 * Generated at the end of the after-hours shift so it's on the desk at 08:00 CT.
 * Most fields are pass-through counts the caller pre-computes from live data;
 * the two NET-NEW derivations (day-vs-after-hours lead split, after-hours avg
 * time-to-text) live here as pure helpers over timestamps. Appointments and
 * per-salesperson performance are intentionally OMITTED (no VinSolutions MCP
 * source). Sales-only is enforced upstream (summarizeOpportunities / thread
 * domain) — this assembler never re-introduces service.
 */
import {
  isWithinBusinessHours,
  businessHoursElapsedMs,
  DEFAULT_BUSINESS_HOURS,
  type BusinessHoursCfg,
} from './lead-aging'

/** Split lead-creation instants into during-business-hours vs after-hours. */
export function splitByBusinessHours(
  instantsMs: ReadonlyArray<number>,
  cfg: BusinessHoursCfg = DEFAULT_BUSINESS_HOURS,
): { during: number; after: number } {
  let during = 0
  let after = 0
  for (const ms of instantsMs) {
    if (isWithinBusinessHours(ms, cfg)) during++
    else after++
  }
  return { during, after }
}

export type ContactGap = { inboundMs: number; firstOutboundMs: number }

/**
 * Average BUSINESS-hours minutes from an AFTER-HOURS inbound to its first
 * outbound reply (overnight is frozen — a 20:00 text answered at 08:05 is ~5
 * min, not ~12h). Business-hours inbounds are excluded (this metric is about the
 * after-hours shift). Returns null when there are no qualifying pairs.
 */
export function avgAfterHoursTimeToTextMin(
  pairs: ReadonlyArray<ContactGap>,
  cfg: BusinessHoursCfg = DEFAULT_BUSINESS_HOURS,
): number | null {
  const qualifying = pairs.filter(
    (p) => !isWithinBusinessHours(p.inboundMs, cfg) && p.firstOutboundMs > p.inboundMs,
  )
  if (qualifying.length === 0) return null
  const totalMs = qualifying.reduce(
    (sum, p) => sum + businessHoursElapsedMs(p.inboundMs, p.firstOutboundMs, cfg),
    0,
  )
  return Math.round(totalMs / qualifying.length / 60_000)
}

export type DailyMgmtMetrics = {
  leadsDuringDay: number
  leadsAfterHours: number
  afterHoursInboundCalls: number
  textsSentOnBehalf: number
  teamboxSent: number
  teamboxReceived: number
  afterHoursAvgTimeToTextMin: number | null
  /** Business-hours outbound texts, incl. 72h follow-ups. */
  businessHoursTextCount: number
  leadsLeftBehind: number
  activeLeads30d: number
}

export type ReportLine = { label: string; value: string | number }
export type DailyMgmtReport = {
  title: string
  date: string
  lines: ReportLine[]
  footnote: string
}

const OMISSION_FOOTNOTE =
  'Sales only (service excluded). Appointments and per-salesperson performance ' +
  'are not available via the VinSolutions API and are intentionally omitted.'

/** Assemble the report object (numbers verbatim; no appointment/per-rep lines). */
export function buildDailyManagementReport(input: {
  date: string
  metrics: DailyMgmtMetrics
}): DailyMgmtReport {
  const m = input.metrics
  return {
    title: 'Daily AI Management Report',
    date: input.date,
    lines: [
      { label: 'Leads in (business hours)', value: m.leadsDuringDay },
      { label: 'Leads in (after hours)', value: m.leadsAfterHours },
      { label: 'After-hours inbound calls', value: m.afterHoursInboundCalls },
      { label: "Texts sent on store's behalf", value: m.textsSentOnBehalf },
      { label: 'Teambox messages sent', value: m.teamboxSent },
      { label: 'Teambox messages received', value: m.teamboxReceived },
      {
        label: 'After-hours avg time-to-text (min)',
        value: m.afterHoursAvgTimeToTextMin ?? 'n/a',
      },
      { label: 'Business-hours texts (incl. 72h follow-ups)', value: m.businessHoursTextCount },
      { label: 'Leads left behind', value: m.leadsLeftBehind },
      { label: 'Active leads (last 30d)', value: m.activeLeads30d },
    ],
    footnote: OMISSION_FOOTNOTE,
  }
}
