/**
 * Polished Halo Sales Performance & Growth preview card — built PURELY from the
 * real-data E2E receipt (E2ECell[]). No hard-coded totals: every figure is read from
 * the receipt the runner emitted, so the report model demonstrably consumes the E2E
 * runner output.
 *
 * PRESENTATION (per Duane's report-card correction):
 *   - Reads like a customer-facing Halo sales document: positive headings, ranked impact,
 *     data age, suggested manager / sales-manager / salesperson coverage.
 *   - A SUBTLE "Draft Preview · Internal Review" label — NOT the loud orange
 *     "Not Strict M1R Acceptance" prototype banner.
 *   - Truth/safety is not hidden: directional/provisional status and provenance live in
 *     concise numbered endnotes + a provenance table, not in the headline.
 *
 * PRIVACY: aggregate values + filenames/checksums/exclusion counts only. No customer names,
 * emails, phones, message bodies, or lead IDs ever enter this model or its HTML.
 */
import type { E2ECell, FamilySlug } from './real-data-e2e'

export const PREVIEW_LABEL = 'Draft Preview · Internal Review'

export type CardFootnote = { n: number; text: string }
export type CardItem = { text: string; notes: number[] }
export type CardSection = { heading: string; items: CardItem[] }
export type CardRecommendation = { audience: 'Manager' | 'Sales Manager' | 'Salesperson'; text: string; status: string }
export type CardProvenanceRow = {
  family: string
  lane: string
  period: string
  rows: number | null
  serviceExcluded: number | null
  reconciles: boolean | null
  checksum12: string
  status: string
}
export type HaloPreviewCard = {
  label: string
  title: string
  dataThrough: string
  sections: CardSection[]
  opportunities: CardItem[]
  recommendations: CardRecommendation[]
  footnotes: CardFootnote[]
  provenance: CardProvenanceRow[]
  /** 'internal' = full audit card (provenance/lanes/checksums); 'external' = customer-facing sample. */
  variant: 'internal' | 'external'
  footer: string
}

const INTERNAL_FOOTER = (label: string) =>
  `${label} — figures marked with an endnote are provisional/directional and remain outside strict M1R acceptance; strict families are read from the governed dev store. Aggregate-only; no customer PII.`
// External (customer) footer carries NO internal workflow status — review/send state lives only in the
// companion and the file naming, never on the customer-facing document.
const EXTERNAL_FOOTER =
  'Sample weekly performance summary. Figures marked with a note are directional CRM signals under active refinement.'

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`
const pct = (num: number, den: number) => (den > 0 ? `${Math.round((num / den) * 100)}%` : '—')

class Notes {
  private byText = new Map<string, number>()
  list: CardFootnote[] = []
  add(text: string): number {
    const seen = this.byText.get(text)
    if (seen) return seen
    const n = this.list.length + 1
    this.byText.set(text, n)
    this.list.push({ n, text })
    return n
  }
}

const DIRECTIONAL_NOTE =
  'Provisional / directional figure. The governed Sales-only gate quarantined this VinSolutions family because the report’s hidden Lead Intent metadata includes Parts/Service and cannot be separated after aggregation; it is a strong operational signal, not strict accepted proof.'
const SERVICE_EXCL_NOTE = 'Service/Parts-coded rows were detected and excluded before this count.'
const APPT_RETRO_NOTE = 'Retrospective: the weekly pool includes completed / cancelled / no-show records and is not necessarily presently actionable; review the confirmation workflow.'
const deliveredDiscrepancyNote = (rows: number, sold: number) =>
  `CRM Sales Gross and the Dealer Dashboard disagree on the delivered/sold count for this week (${rows} delivered-sale rows vs ${sold} sold). Both figures are shown unreconciled; neither is treated as authoritative pending review.`

/**
 * A Service/Parts observation line that never overclaims. When count > 0 we say the rows were
 * excluded (SERVICE_EXCL footnote); when count == 0 we say ONLY that none were visible — we do
 * NOT claim the aggregate is proven Sales-only (the hidden Lead Intent directional caveat still
 * applies, so the directional footnote is retained).
 */
function serviceObservation(svc: number | null, directionalNote: number, serviceNote: () => number): CardItem | null {
  if (svc == null) return null
  if (svc > 0) return { text: `${svc} Service/Parts-coded rows excluded before counting`, notes: [serviceNote(), directionalNote] }
  return { text: '0 visible Service/Parts-coded rows detected', notes: [directionalNote] }
}

/** Read one metric value from the receipt cell for a family (null when withheld/absent). */
function metric(cells: E2ECell[], family: FamilySlug, id: string): number | null {
  const cell = cells.find((c) => c.family === family)
  if (!cell) return null
  const v = cell.metrics_emitted[id]
  return v === undefined ? null : v
}
function cellOf(cells: E2ECell[], family: FamilySlug): E2ECell | undefined {
  return cells.find((c) => c.family === family)
}

/**
 * PURE builder. `cells` are the six receipt cells for one rooftop; `dataThrough` is a
 * human freshness label. Every value flows from the receipt — nothing is hard-coded.
 */
export function buildHaloPreviewCard(dealerName: string, cells: E2ECell[], dataThrough: string): HaloPreviewCard {
  const notes = new Notes()
  const sections: CardSection[] = []

  // ── Executive Snapshot (strict-accepted) ──
  const gross = metric(cells, 'crm_sales_gross', 'gross.total_sum')
  const delivered = metric(cells, 'crm_sales_gross', 'gross.row_count') // CRM Sales Gross delivered-sale rows
  const dashSold = metric(cells, 'dealership_performance', 'dp.sold_in_period') // Dashboard sold-in-period
  const apptTotal = metric(cells, 'appointments', 'appt.total')
  const apptShow = metric(cells, 'appointments', 'appt.show')
  // Delivered/sold sources disagree only when BOTH are present and unequal (e.g. Ford 7 vs 6). Then we
  // qualify the count and footnote the discrepancy — never an unqualified "N vehicles delivered", never
  // a chosen winner.
  const deliveredDiscrepant = delivered != null && dashSold != null && delivered !== dashSold
  const discNote = deliveredDiscrepant ? notes.add(deliveredDiscrepancyNote(delivered!, dashSold!)) : 0
  const deliveredUnit = deliveredDiscrepant ? 'delivered-sale rows' : 'delivered deals'
  const snapshot: CardItem[] = []
  if (delivered != null) {
    if (deliveredDiscrepant) snapshot.push({ text: `${delivered} delivered-sale rows in CRM Sales Gross · Dashboard reports ${dashSold} sold`, notes: [discNote] })
    else snapshot.push({ text: `${delivered} vehicles delivered this week`, notes: [] })
  }
  if (gross != null) snapshot.push({ text: `${money(gross)} in total gross`, notes: [] })
  if (apptTotal != null) snapshot.push({ text: `${apptTotal} sales appointments recorded`, notes: [] })
  if (apptTotal != null && apptShow != null && apptTotal > 0) snapshot.push({ text: `${pct(apptShow, apptTotal)} appointment show rate`, notes: [] })
  if (snapshot.length) sections.push({ heading: 'Executive Snapshot', items: snapshot })

  // ── Revenue & Customer Journey (strict) ──
  const revenue: CardItem[] = []
  if (gross != null && delivered != null && delivered > 0) {
    revenue.push({ text: `${money(gross)} total gross across ${delivered} ${deliveredUnit}`, notes: deliveredDiscrepant ? [discNote] : [] })
    revenue.push({ text: `${money(gross / delivered)} average gross per ${deliveredDiscrepant ? 'delivered-sale row' : 'delivered deal'}`, notes: [] })
  }
  const front = metric(cells, 'crm_sales_gross', 'gross.front_sum')
  const back = metric(cells, 'crm_sales_gross', 'gross.back_sum')
  if (front != null && back != null) revenue.push({ text: `${money(front)} front gross, ${money(back)} back gross`, notes: [] })
  const dpLeads = metric(cells, 'dealership_performance', 'dp.leads')
  const dpSet = metric(cells, 'dealership_performance', 'dp.appts_set')
  const dpShow = metric(cells, 'dealership_performance', 'dp.appts_show')
  if (dpLeads != null && dpSet != null && dpShow != null) {
    revenue.push({ text: `Dashboard lead funnel: ${dpLeads} leads → ${dpSet} appointments set → ${dpShow} shown${dashSold != null ? ` → ${dashSold} sold` : ''}`, notes: [] })
  }
  if (revenue.length) sections.push({ heading: 'Revenue & Customer Journey', items: revenue })

  // ── Appointment Detail (strict; compact) ──
  const apptConfirmed = metric(cells, 'appointments', 'appt.confirmed')
  const apptNoShow = metric(cells, 'appointments', 'appt.no_show')
  const apptCancelled = metric(cells, 'appointments', 'appt.cancelled')
  const apptResched = metric(cells, 'appointments', 'appt.rescheduled')
  if (apptTotal != null && [apptConfirmed, apptShow, apptNoShow, apptCancelled, apptResched].some((v) => v != null)) {
    sections.push({ heading: 'Appointment Detail', items: [{
      text: `${apptTotal} appointments — ${apptConfirmed ?? '—'} confirmed, ${apptShow ?? '—'} shown, ${apptNoShow ?? '—'} no-show, ${apptCancelled ?? '—'} cancelled, ${apptResched ?? '—'} rescheduled`,
      notes: [],
    }] })
  }

  // ── Lead Source Performance (provisional ROI) ──
  const roiCell = cellOf(cells, 'lead_source_roi')
  if (roiCell && roiCell.reader_used.startsWith('provisional-adapter (non-promoting)')) {
    const dn = notes.add(DIRECTIONAL_NOTE)
    const items: CardItem[] = []
    const tl = metric(cells, 'lead_source_roi', 'roi.total_leads')
    const sold = metric(cells, 'lead_source_roi', 'roi.sold_from_leads')
    const gr = metric(cells, 'lead_source_roi', 'roi.total_gross')
    const dup = metric(cells, 'lead_source_roi', 'roi.duplicate_rate')
    if (tl != null) items.push({ text: `${tl} leads worked across sources`, notes: [dn] })
    if (sold != null) items.push({ text: `${sold} sold from those leads`, notes: [dn] })
    if (gr != null) items.push({ text: `${money(gr)} total gross attributed across sources`, notes: [dn] })
    if (dup != null) items.push({ text: `${Math.round(dup * 100)}% duplicate-lead rate — a source-hygiene signal`, notes: [dn] })
    const svcItem = serviceObservation(roiCell.service_parts_excluded, dn, () => notes.add(SERVICE_EXCL_NOTE))
    if (svcItem) items.push(svcItem)
    if (items.length) sections.push({ heading: 'Lead Source Performance', items })
  }

  // ── Team Activity & Engagement (provisional CAGE) ──
  const cageCell = cellOf(cells, 'cage_kpi')
  if (cageCell && cageCell.reader_used.startsWith('provisional-adapter (non-promoting)')) {
    const dn = notes.add(DIRECTIONAL_NOTE)
    const items: CardItem[] = []
    const reps = metric(cells, 'cage_kpi', 'cage.rep_count')
    const leads = metric(cells, 'cage_kpi', 'cage.total_leads')
    const set = metric(cells, 'cage_kpi', 'cage.appts_set')
    const shown = metric(cells, 'cage_kpi', 'cage.appts_shown')
    if (reps != null) items.push({ text: `${reps} sales reps active this week`, notes: [dn] })
    if (leads != null) items.push({ text: `${leads} leads worked by the team`, notes: [dn] })
    if (set != null && shown != null) items.push({ text: `${set} appointments set, ${shown} shown`, notes: [dn] })
    const totalComms = metric(cells, 'cage_kpi', 'cage.total_comms')
    const tCalls = metric(cells, 'cage_kpi', 'cage.total_calls')
    const tEmails = metric(cells, 'cage_kpi', 'cage.total_emails')
    const tTexts = metric(cells, 'cage_kpi', 'cage.total_texts')
    if (totalComms != null) items.push({ text: `${totalComms} total communications`, notes: [dn] })
    if (tCalls != null && tEmails != null && tTexts != null) items.push({ text: `${tCalls} calls, ${tEmails} emails, ${tTexts} texts`, notes: [dn] })
    if (items.length) {
      const svcItem = serviceObservation(cageCell.service_parts_excluded, dn, () => notes.add(SERVICE_EXCL_NOTE))
      if (svcItem) items.push(svcItem)
    }
    if (items.length) sections.push({ heading: 'Team Activity & Engagement', items })
  }

  // ── Customer Communication (provisional comm) ──
  const commCell = cellOf(cells, 'sales_comm_log')
  if (commCell && commCell.reader_used.startsWith('provisional-adapter (non-promoting)')) {
    const dn = notes.add(DIRECTIONAL_NOTE)
    const items: CardItem[] = []
    const sales = metric(cells, 'sales_comm_log', 'comm.sales_communications')
    const inb = metric(cells, 'sales_comm_log', 'comm.inbound')
    const outb = metric(cells, 'sales_comm_log', 'comm.outbound')
    const svc = commCell.service_parts_excluded
    if (sales != null) {
      const excl = svc != null && svc > 0 ? ` (${svc} Service/Parts rows excluded)` : ''
      const noteRefs = svc != null && svc > 0 ? [dn, notes.add(SERVICE_EXCL_NOTE)] : [dn]
      items.push({ text: `${sales} customer communications logged${excl}`, notes: noteRefs })
    }
    if (inb != null && outb != null) items.push({ text: `${outb} outbound rep messages, ${inb} inbound customer replies`, notes: [dn] })
    const cEmail = metric(cells, 'sales_comm_log', 'comm.email')
    const cCall = metric(cells, 'sales_comm_log', 'comm.logged_call')
    const cText = metric(cells, 'sales_comm_log', 'comm.text')
    if (cEmail != null && cCall != null && cText != null) items.push({ text: `${cCall} calls, ${cEmail} emails, ${cText} texts`, notes: [dn] })
    if (svc === 0) items.push({ text: '0 visible Service/Parts-coded rows detected', notes: [dn] })
    if (items.length) sections.push({ heading: 'Customer Communication', items })
  }

  // ── High-Impact Growth Opportunities (ranked; strict signals first) ──
  const opps: CardItem[] = []
  const noShow = metric(cells, 'appointments', 'appt.no_show')
  const confirmed = metric(cells, 'appointments', 'appt.confirmed')
  if (apptTotal != null && noShow != null && apptTotal > 0 && noShow > 0) {
    opps.push({ text: `Recover ${noShow} no-show appointments with a same-week reminder cadence`, notes: [] })
  }
  if (apptTotal != null && confirmed != null && confirmed < apptTotal) {
    opps.push({ text: `${apptTotal - confirmed} of ${apptTotal} appointment records were not marked confirmed during the week — review confirmation workflow`, notes: [notes.add(APPT_RETRO_NOTE)] })
  }
  const dup = metric(cells, 'lead_source_roi', 'roi.duplicate_rate')
  if (dup != null && dup > 0) {
    opps.push({ text: `Reduce duplicate leads (${Math.round(dup * 100)}%) by tightening source routing`, notes: [notes.add(DIRECTIONAL_NOTE)] })
  }
  const inb = metric(cells, 'sales_comm_log', 'comm.inbound')
  const outb = metric(cells, 'sales_comm_log', 'comm.outbound')
  if (inb != null && outb != null && inb > 0 && outb / inb >= 4) {
    opps.push({ text: `Balance a high outbound-to-inbound ratio (${outb}:${inb}) with faster first-reply handling`, notes: [notes.add(DIRECTIONAL_NOTE)] })
  }
  const opportunities = opps.map((o, i) => ({ text: `Priority ${i + 1} — ${o.text}`, notes: o.notes }))

  // ── Suggested coverage (INERT) ──
  const INERT = 'Suggested — not activated, scheduled, or sent'
  const recommendations: CardRecommendation[] = [
    { audience: 'Manager', text: 'Weekly digest: delivered vehicles, total gross, and appointment show rate', status: INERT },
    { audience: 'Sales Manager', text: 'Flag unconfirmed appointments before the weekend to protect show rate', status: INERT },
    { audience: 'Salesperson', text: 'Re-engage this week’s no-shows within 24 hours', status: INERT },
  ]

  // ── Provenance (aggregate; filenames & checksums only) ──
  const provenance: CardProvenanceRow[] = cells.map((c) => ({
    family: c.family,
    lane: c.preview_lane === 'strict-governed' ? 'strict (governed)' : 'provisional (preview)',
    period: c.hold.period.start ? `${c.hold.period.start}..${c.hold.period.end}` : c.period_hint.replace('/', '..'),
    rows: c.rows.observed ?? c.rows.accepted,
    serviceExcluded: c.service_parts_excluded,
    reconciles: c.reconciliation.reconciles,
    checksum12: c.source.sha256.slice(0, 12),
    status: c.strict_state === 'accepted' ? 'accepted' : 'quarantined · provisional',
  }))

  return {
    label: PREVIEW_LABEL,
    title: `${dealerName} — Sales Performance & Growth`,
    dataThrough,
    sections,
    opportunities,
    recommendations,
    footnotes: notes.list,
    provenance,
    variant: 'internal',
    footer: INTERNAL_FOOTER(PREVIEW_LABEL),
  }
}

// ── external-facing customer sample ───────────────────────────────────────────
// Same underlying receipt numbers, translated for a dealer audience: NO data provenance, family
// slugs, lane labels, checksums, or governed-dev/M1R/quarantine language; NO internal limitation
// headings. Provisional caveats become concise customer language; the Ford delivered/sold gap is
// retained in plain words. Suggested coverage becomes sales-oriented pilots/next steps.
const EXT_DIRECTIONAL = 'Directional CRM signal — the underlying report categories overlap and are pending refinement.'
const EXT_RETRO = 'Reflects the full week’s appointment records, including completed and cancelled.'
const extDeliveredNote = (rows: number, sold: number) =>
  `Two sales reports show different counts for this week (${rows} recorded sales vs ${sold} on the dashboard); both are shown while the figures are being reconciled.`

export function buildExternalCard(dealerName: string, cells: E2ECell[], dataThrough: string): HaloPreviewCard {
  const notes = new Notes()
  const sections: CardSection[] = []
  const has = (family: FamilySlug) => {
    const c = cellOf(cells, family)
    return c && c.reader_used.startsWith('provisional-adapter (non-promoting)')
  }

  // Executive Snapshot
  const gross = metric(cells, 'crm_sales_gross', 'gross.total_sum')
  const delivered = metric(cells, 'crm_sales_gross', 'gross.row_count')
  const dashSold = metric(cells, 'dealership_performance', 'dp.sold_in_period')
  const apptTotal = metric(cells, 'appointments', 'appt.total')
  const apptShow = metric(cells, 'appointments', 'appt.show')
  const discrepant = delivered != null && dashSold != null && delivered !== dashSold
  const discNote = discrepant ? notes.add(extDeliveredNote(delivered!, dashSold!)) : 0
  const snap: CardItem[] = []
  if (delivered != null) {
    if (discrepant) snap.push({ text: `${delivered} recorded sales this week · dashboard shows ${dashSold}`, notes: [discNote] })
    else snap.push({ text: `${delivered} vehicles delivered this week`, notes: [] })
  }
  if (gross != null) snap.push({ text: `${money(gross)} in total gross`, notes: [] })
  if (apptTotal != null) snap.push({ text: `${apptTotal} sales appointments recorded`, notes: [] })
  if (apptTotal != null && apptShow != null && apptTotal > 0) snap.push({ text: `${pct(apptShow, apptTotal)} appointment show rate`, notes: [] })
  if (snap.length) sections.push({ heading: 'Executive Snapshot', items: snap })

  // Revenue & Customer Journey
  const rev: CardItem[] = []
  if (gross != null && delivered != null && delivered > 0) {
    rev.push({ text: `${money(gross)} total gross across ${delivered} ${discrepant ? 'recorded sales' : 'delivered deals'}`, notes: discrepant ? [discNote] : [] })
    rev.push({ text: `${money(gross / delivered)} average gross per sale`, notes: [] })
  }
  const front = metric(cells, 'crm_sales_gross', 'gross.front_sum')
  const back = metric(cells, 'crm_sales_gross', 'gross.back_sum')
  if (front != null && back != null) rev.push({ text: `${money(front)} front gross, ${money(back)} back gross`, notes: [] })
  const dpLeads = metric(cells, 'dealership_performance', 'dp.leads')
  const dpSet = metric(cells, 'dealership_performance', 'dp.appts_set')
  const dpShow = metric(cells, 'dealership_performance', 'dp.appts_show')
  if (dpLeads != null && dpSet != null && dpShow != null) rev.push({ text: `Lead funnel: ${dpLeads} leads → ${dpSet} appointments set → ${dpShow} shown${dashSold != null ? ` → ${dashSold} sold` : ''}`, notes: [] })
  if (rev.length) sections.push({ heading: 'Revenue & Customer Journey', items: rev })

  // Appointment Detail
  const conf = metric(cells, 'appointments', 'appt.confirmed'), ns = metric(cells, 'appointments', 'appt.no_show')
  const canc = metric(cells, 'appointments', 'appt.cancelled'), resc = metric(cells, 'appointments', 'appt.rescheduled')
  if (apptTotal != null) sections.push({ heading: 'Appointment Detail', items: [{ text: `${apptTotal} appointments — ${conf ?? '—'} confirmed, ${apptShow ?? '—'} shown, ${ns ?? '—'} no-show, ${canc ?? '—'} cancelled, ${resc ?? '—'} rescheduled`, notes: [] }] })

  // Lead Source Performance (directional)
  if (has('lead_source_roi')) {
    const dn = notes.add(EXT_DIRECTIONAL)
    const items: CardItem[] = []
    const tl = metric(cells, 'lead_source_roi', 'roi.total_leads'), sold = metric(cells, 'lead_source_roi', 'roi.sold_from_leads')
    const gr = metric(cells, 'lead_source_roi', 'roi.total_gross'), dup = metric(cells, 'lead_source_roi', 'roi.duplicate_rate')
    if (tl != null) items.push({ text: `${tl} leads worked across sources`, notes: [dn] })
    if (sold != null) items.push({ text: `${sold} sold from those leads`, notes: [dn] })
    if (gr != null) items.push({ text: `${money(gr)} total gross attributed across sources`, notes: [dn] })
    if (dup != null) items.push({ text: `${Math.round(dup * 100)}% duplicate-lead rate — a source-hygiene signal`, notes: [dn] })
    if (items.length) sections.push({ heading: 'Lead Source Performance', items })
  }

  // Team Activity (directional)
  if (has('cage_kpi')) {
    const dn = notes.add(EXT_DIRECTIONAL)
    const items: CardItem[] = []
    const reps = metric(cells, 'cage_kpi', 'cage.rep_count'), leads = metric(cells, 'cage_kpi', 'cage.total_leads')
    const set = metric(cells, 'cage_kpi', 'cage.appts_set'), shown = metric(cells, 'cage_kpi', 'cage.appts_shown')
    const tc = metric(cells, 'cage_kpi', 'cage.total_comms'), ca = metric(cells, 'cage_kpi', 'cage.total_calls')
    const em = metric(cells, 'cage_kpi', 'cage.total_emails'), tx = metric(cells, 'cage_kpi', 'cage.total_texts')
    if (reps != null) items.push({ text: `${reps} sales reps active this week`, notes: [dn] })
    if (leads != null) items.push({ text: `${leads} leads worked by the team`, notes: [dn] })
    if (set != null && shown != null) items.push({ text: `${set} appointments set, ${shown} shown`, notes: [dn] })
    if (tc != null) items.push({ text: `${tc} total communications`, notes: [dn] })
    if (ca != null && em != null && tx != null) items.push({ text: `${ca} calls, ${em} emails, ${tx} texts`, notes: [dn] })
    if (items.length) sections.push({ heading: 'Team Activity & Engagement', items })
  }

  // Customer Communication (directional; no service-exclusion line)
  if (has('sales_comm_log')) {
    const dn = notes.add(EXT_DIRECTIONAL)
    const items: CardItem[] = []
    const sales = metric(cells, 'sales_comm_log', 'comm.sales_communications')
    const inb = metric(cells, 'sales_comm_log', 'comm.inbound'), outb = metric(cells, 'sales_comm_log', 'comm.outbound')
    const cc = metric(cells, 'sales_comm_log', 'comm.logged_call'), ce = metric(cells, 'sales_comm_log', 'comm.email'), ct = metric(cells, 'sales_comm_log', 'comm.text')
    if (sales != null) items.push({ text: `${sales} customer communications logged`, notes: [dn] })
    if (inb != null && outb != null) items.push({ text: `${outb} outbound rep messages, ${inb} inbound customer replies`, notes: [dn] })
    if (cc != null && ce != null && ct != null) items.push({ text: `${cc} calls, ${ce} emails, ${ct} texts`, notes: [dn] })
    if (items.length) sections.push({ heading: 'Customer Communication', items })
  }

  // Opportunities (ranked)
  const opps: CardItem[] = []
  const noShow = metric(cells, 'appointments', 'appt.no_show'), confirmed = metric(cells, 'appointments', 'appt.confirmed')
  if (apptTotal != null && noShow != null && apptTotal > 0 && noShow > 0) opps.push({ text: `Recover ${noShow} no-show appointments with a same-week reminder cadence`, notes: [] })
  if (apptTotal != null && confirmed != null && confirmed < apptTotal) opps.push({ text: `${apptTotal - confirmed} of ${apptTotal} appointments were not marked confirmed during the week — review the confirmation workflow`, notes: [notes.add(EXT_RETRO)] })
  const dup = metric(cells, 'lead_source_roi', 'roi.duplicate_rate')
  if (dup != null && dup > 0) opps.push({ text: `Reduce duplicate leads (${Math.round(dup * 100)}%) by tightening source routing`, notes: [notes.add(EXT_DIRECTIONAL)] })
  const opportunities = opps.map((o, i) => ({ text: `Priority ${i + 1} — ${o.text}`, notes: o.notes }))

  // Sales-oriented recommendations (no inert language)
  const recommendations: CardRecommendation[] = [
    { audience: 'Manager', text: 'Weekly performance digest: delivered vehicles, total gross, and appointment show rate', status: 'Available next step' },
    { audience: 'Sales Manager', text: 'Weekend appointment-confirmation push to protect show rate', status: 'Recommended pilot' },
    { audience: 'Salesperson', text: 'Same-day re-engagement of this week’s no-shows', status: 'Recommended pilot' },
  ]

  return {
    label: 'Sample',
    title: `${dealerName} — Sales Performance & Growth`,
    dataThrough,
    sections,
    opportunities,
    recommendations,
    footnotes: notes.list,
    provenance: [], // external: no data-provenance / lanes / checksums
    variant: 'external',
    footer: EXTERNAL_FOOTER,
  }
}

// ── renderer (subtle label; numbered endnotes; print-friendly) ───────────────
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const sup = (nums: number[]) => (nums.length ? `<sup class="fn">${nums.join(',')}</sup>` : '')

const CSS = `
  :root{--ink:#0f172a;--muted:#5b6b7f;--line:#e6ebf1;--brand:#0b5cab;--brand2:#0a7d55;--bg:#f6f8fb;--card:#fff;--chip:#eef4fb}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{max-width:880px;margin:0 auto;padding:30px 28px;position:relative}
  header.masthead{border-bottom:3px solid var(--brand);padding-bottom:14px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
  .eyebrow{letter-spacing:.14em;text-transform:uppercase;font-size:11px;color:var(--brand);font-weight:700;margin:0 0 6px}
  h1{font-size:26px;line-height:1.2;margin:0 0 10px;font-weight:800}
  .data-through{display:inline-block;background:var(--chip);color:var(--brand);font-weight:600;font-size:13px;padding:5px 12px;border-radius:999px;margin:0}
  .preview-chip{flex:none;background:#f1f5f9;border:1px solid #cbd5e1;color:#475569;font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:5px 10px;border-radius:999px;white-space:nowrap}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  section.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;box-shadow:0 1px 2px rgba(16,24,40,.04);break-inside:avoid}
  section.card h2{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:0 0 10px;font-weight:700}
  section.full{grid-column:1 / -1}
  ul{margin:0;padding:0;list-style:none}
  li{position:relative;padding:6px 0 6px 20px;border-bottom:1px solid #f1f4f8;font-size:14.5px}
  li:last-child{border-bottom:0}
  li::before{content:"";position:absolute;left:2px;top:13px;width:8px;height:8px;border-radius:50%;background:var(--brand2)}
  sup.fn{color:var(--brand);font-weight:700;font-size:10px;padding-left:2px}
  .rec{display:flex;gap:8px;align-items:baseline}
  .rec .aud{font-weight:700;color:var(--ink);min-width:120px}
  .rec .st{color:var(--muted);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.03em}
  ol.endnotes{margin:8px 0 0;padding-left:26px;color:var(--muted);font-size:12.5px}
  ol.endnotes li{border:0;padding:3px 0 3px 4px}
  ol.endnotes li::before{content:none;display:none}
  table.prov{width:100%;border-collapse:collapse;font-size:11.5px;color:var(--muted)}
  table.prov th,table.prov td{border:1px solid var(--line);padding:5px 7px;text-align:left}
  footer{margin-top:22px;padding-top:12px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}
  @media (max-width:640px){.grid{grid-template-columns:1fr}}
  @media print{body{background:#fff}.page{max-width:100%;padding:0}section.card{box-shadow:none}}
`

export function renderHaloPreviewHtml(card: HaloPreviewCard): string {
  const section = (s: CardSection, full = false) => `      <section class="card${full ? ' full' : ''}">
        <h2>${esc(s.heading)}</h2>
        <ul>${s.items.map((it) => `\n          <li>${esc(it.text)}${sup(it.notes)}</li>`).join('')}
        </ul>
      </section>`
  const sectionsHtml = card.sections.map((s, i) => section(s, i === 0)).join('\n')
  const oppHtml = card.opportunities.length ? `      <section class="card full">
        <h2>High-Impact Growth Opportunities</h2>
        <ul>${card.opportunities.map((o) => `\n          <li>${esc(o.text)}${sup(o.notes)}</li>`).join('')}
        </ul>
      </section>` : ''
  const recHeading = card.variant === 'external' ? 'Recommended Next Steps' : 'Suggested Coverage &amp; Notifications'
  const recHtml = `      <section class="card full">
        <h2>${recHeading}</h2>
        <ul>${card.recommendations.map((r) => `\n          <li class="rec"><span class="aud">${esc(r.audience)}</span><span>${esc(r.text)}</span> <span class="st">${esc(r.status)}</span></li>`).join('')}
        </ul>
      </section>`
  const endnotesHtml = card.footnotes.length ? `      <section class="card full">
        <h2>${card.variant === 'external' ? 'Notes' : 'Endnotes'}</h2>
        <ol class="endnotes">${card.footnotes.map((f) => `\n          <li value="${f.n}">${esc(f.text)}</li>`).join('')}
        </ol>
      </section>` : ''
  // Data-provenance table is INTERNAL-only (family slugs / lanes / checksums). Omitted for external.
  const provHtml = card.variant !== 'external' && card.provenance.length ? `      <section class="card full">
        <h2>Data Provenance (aggregate; filenames &amp; checksums only)</h2>
        <table class="prov"><thead><tr><th>family</th><th>lane</th><th>period</th><th>rows</th><th>svc excl.</th><th>reconciles</th><th>checksum</th><th>status</th></tr></thead><tbody>${card.provenance.map((p) => `<tr><td>${esc(p.family)}</td><td>${esc(p.lane)}</td><td>${esc(p.period)}</td><td>${p.rows ?? '—'}</td><td>${p.serviceExcluded ?? '—'}</td><td>${p.reconciles == null ? '—' : p.reconciles ? 'yes' : 'no'}</td><td><code>${esc(p.checksum12)}</code></td><td>${esc(p.status)}</td></tr>`).join('')}</tbody></table>
      </section>` : ''
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(card.title)}</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="page">
    <header class="masthead">
      <div>
        <p class="eyebrow">Weekly Sales Performance &amp; Growth</p>
        <h1>${esc(card.title)}</h1>
        <p class="data-through">${esc(card.dataThrough)}</p>
      </div>
      <span class="preview-chip">${esc(card.label)}</span>
    </header>
    <div class="grid">
${sectionsHtml}
${oppHtml}
${recHtml}
${endnotesHtml}
${provHtml}
    </div>
    <footer>${esc(card.footer)}</footer>
  </div>
</body>
</html>`
}
