/**
 * Friendly, alertable-metric catalog — the single source the alert wizard's metric
 * picker and the Watchdog alert engine share. Each entry maps a Watchdog metric
 * slug to a plain-language label + description, its category, the value format, and
 * which direction is the concerning one (so the wizard can default sensibly).
 *
 * `source` names the pipeline that produces the value, so the engine can
 * availability-gate (skip silently when that source has no active data) rather than
 * fabricate a zero. Pure data — no I/O.
 */
export type MetricFormat = 'percent' | 'count' | 'currency'
/** Which way is the concerning move — used only to default the wizard's direction. */
export type ConcerningDirection = 'above' | 'below'
export type MetricSource = 'vin-report' | 'hub'

export type CatalogMetric = {
  /** Watchdog metric slug (e.g. 'appt.show_rate'). */
  id: string
  /** Friendly name shown in the picker (e.g. 'Appointment show rate'). */
  label: string
  /** One plain sentence describing what it measures. */
  description: string
  category: string
  format: MetricFormat
  /** The direction that is usually a problem — pre-selects the wizard direction. */
  concerning: ConcerningDirection
  source: MetricSource
}

export const METRIC_CATALOG: ReadonlyArray<CatalogMetric> = [
  // ── Appointments (VinSolutions report) ──
  { id: 'appt.show_rate', label: 'Appointment show rate', description: 'Share of appointments where the customer showed.', category: 'Appointments', format: 'percent', concerning: 'below', source: 'vin-report' },
  { id: 'appt.no_show_rate', label: 'Appointment no-show rate', description: 'Share of appointments flagged as a no-show.', category: 'Appointments', format: 'percent', concerning: 'above', source: 'vin-report' },
  { id: 'appt.confirmed_rate', label: 'Appointment confirmed rate', description: 'Share of appointments confirmed.', category: 'Appointments', format: 'percent', concerning: 'below', source: 'vin-report' },
  { id: 'appt.cancel_rate', label: 'Appointment cancel rate', description: 'Share of appointments cancelled.', category: 'Appointments', format: 'percent', concerning: 'above', source: 'vin-report' },

  // ── Leads & ROI (VinSolutions report) ──
  { id: 'roi.total_leads', label: 'Total leads (all sources)', description: 'Total leads across lead sources in the period.', category: 'Leads & ROI', format: 'count', concerning: 'below', source: 'vin-report' },
  { id: 'roi.sold_from_leads', label: 'Sold from leads', description: 'Leads that reached sold in the period.', category: 'Leads & ROI', format: 'count', concerning: 'below', source: 'vin-report' },
  { id: 'roi.duplicate_rate', label: 'Duplicate-lead rate', description: 'Share of leads flagged as duplicates.', category: 'Leads & ROI', format: 'percent', concerning: 'above', source: 'vin-report' },

  // ── Gross (VinSolutions report) ──
  { id: 'gross.total_sum', label: 'Total gross', description: 'Sum of total gross across sold deals in the period.', category: 'Gross', format: 'currency', concerning: 'below', source: 'vin-report' },
  { id: 'gross.reconciliation_mismatches', label: 'Gross reconciliation mismatches', description: 'Deals where front + back gross does not equal total gross.', category: 'Gross', format: 'count', concerning: 'above', source: 'vin-report' },

  // ── Team (CAGE / Enterprise Performance) ──
  { id: 'cage.total_comms', label: 'Total rep communications', description: 'Total communications logged by reps in the period.', category: 'Team', format: 'count', concerning: 'below', source: 'vin-report' },
  { id: 'cage.deals_from_leads', label: 'Deals from leads', description: 'Deals attributed to leads (rep-reported).', category: 'Team', format: 'count', concerning: 'below', source: 'vin-report' },
  { id: 'cage.rep_count', label: 'Active reps', description: 'Distinct reps active in the period.', category: 'Team', format: 'count', concerning: 'below', source: 'vin-report' },

  // ── Communications (Sales Communication Log) ──
  { id: 'comm.escalation_keyword_screen', label: 'Escalation-keyword messages', description: 'Messages containing escalation keywords (manager, refund, complaint…).', category: 'Communications', format: 'count', concerning: 'above', source: 'vin-report' },
  { id: 'comm.template_overuse', label: 'Template overuse', description: 'Message bodies reused five or more times.', category: 'Communications', format: 'count', concerning: 'above', source: 'vin-report' },
  { id: 'comm.inbound_high_intent_keywords', label: 'Inbound high-intent messages', description: 'Inbound messages with high-intent language (price, trade, test drive…).', category: 'Communications', format: 'count', concerning: 'below', source: 'vin-report' },
  { id: 'comm.multi_rep_within_24h', label: 'Customers worked by multiple reps (24h)', description: 'Customers contacted by two or more reps within 24 hours.', category: 'Communications', format: 'count', concerning: 'above', source: 'vin-report' },

  // ── Engagement (messaging hub — surfaced on the dashboard) ──
  { id: 'engagement.reply_rate', label: 'SMS reply rate', description: 'Share of texted customers who replied.', category: 'Engagement', format: 'percent', concerning: 'below', source: 'hub' },
  { id: 'engagement.conversations', label: 'Conversations held', description: 'Threads with at least one real customer reply.', category: 'Engagement', format: 'count', concerning: 'below', source: 'hub' },
  { id: 'engagement.resurrections', label: 'Safety-net resurrections', description: 'Customers silent after the first touch who replied after the 24h follow-up.', category: 'Engagement', format: 'count', concerning: 'below', source: 'hub' },
]

const BY_ID = new Map(METRIC_CATALOG.map((m) => [m.id, m]))

export function getCatalogMetric(id: string): CatalogMetric | undefined {
  return BY_ID.get(id)
}

export function isCatalogMetric(id: string): boolean {
  return BY_ID.has(id)
}

/** Catalog grouped by category, in declaration order — for the picker UI. */
export function catalogByCategory(): Array<{ category: string; metrics: Array<CatalogMetric> }> {
  const groups: Array<{ category: string; metrics: Array<CatalogMetric> }> = []
  for (const m of METRIC_CATALOG) {
    let g = groups.find((x) => x.category === m.category)
    if (!g) { g = { category: m.category, metrics: [] }; groups.push(g) }
    g.metrics.push(m)
  }
  return groups
}
