/**
 * Halo Data — polished customer-facing SALES report card (M2R R4, isolated dev).
 *
 * Turns a validated accepted-fact bundle + the R3 consultant synthesis into an executive
 * Sales document model and deterministic print-ready HTML. STRICT customer boundaries:
 *   - Sales-only; zero Service/Parts, PII, raw filenames, hashes, DB paths, internal IDs
 *     (except the dealer number), or engineering/provenance jargon.
 *   - No customer-facing "limitation/issue/quarantine/withheld/missing/blocked/unsupported/
 *     discrepancy/failure" language; no benchmark/industry comparison or invented standard.
 *   - Ford-safe: the two count-dependent per-unit composites are simply not shown (they live
 *     only in the internal synthesis as blocked measures).
 *   - Recommended Alerts/Automations are labeled Not Active - Review Before Activation and
 *     never claim anything was created or enabled.
 *   - One-period snapshot: no trend/causal/benchmark claims. ASCII hyphens only.
 *
 * A fail-closed `assertCustomerSafe` guard throws if any banned term, slug code, SW id, hash,
 * path, or engineering marker leaks into the rendered HTML. Pure & deterministic.
 */
import { buildConsultantSynthesis, PROHIBITED_CLAIM, type ConsultantSynthesis, type ConsultantFinding } from './consultant-synthesis'
import type { AcceptedFactsBundle, PeriodRef } from './accepted-facts'

export type HaloKpi = { label: string; value: string; caption: string }
export type HaloFunnelStage = { label: string; count: string; rate: string | null; width_pct: number }
export type HaloAction = {
  rank: number
  focus: string
  title: string
  message: string
  why: string
  owner: string
  follow_up: string
  alert: string
  automation: string
  status: string
}
export type HaloAppendixRow = { label: string; value: string; group: string }

export type HaloCardModel = {
  profile: string
  dealer_name: string
  dealer_number: string
  period_label: string
  freshness_badge: string
  hero_kpis: HaloKpi[]
  momentum: string[]
  funnel: HaloFunnelStage[]
  appointment_counts: Array<{ label: string; value: string }>
  appointment_rates: Array<{ label: string; value: string }>
  response: { value: string; note: string } | null
  gross: { total: string; front_mix: string | null; back_mix: string | null }
  actions: HaloAction[]
  appendix: HaloAppendixRow[]
  watchdog: { governed: number; directly_evaluated: number; derived_count: number; text: string }
  footnotes: string[]
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function humanDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`
}
function daysBetween(a: string, b: string): number {
  const da = Date.parse(`${a.slice(0, 10)}T00:00:00Z`), db = Date.parse(`${b.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(da) || Number.isNaN(db)) return 0
  return Math.max(0, Math.round((db - da) / 86_400_000))
}
function periodLabel(p: PeriodRef): string {
  if (!p.start || !p.end) return 'Current governed week'
  return `${humanDate(p.start)} - ${humanDate(p.end)}`
}

const FOCUS: Record<string, string> = {
  sales_gross_lift: 'Sales & Gross', expense_reduction: 'Team Efficiency', training: 'Coaching',
  handoff_process: 'Process', prospect_friction: 'Customer Experience',
}
const OWNER_LABEL: Record<string, string> = { GM: 'General Manager', 'Sales Manager': 'Sales Manager', Salesperson: 'Salesperson' }
const METRIC_LABEL: Record<string, string> = {
  'appt.show_rate': 'Appointment show rate', 'appt.no_show_rate': 'Appointment no-show rate',
  'gross.total_sum': 'Total gross', 'dashboard.avg_actual_response_min': 'Average response time (minutes)',
  'funnel.lead_to_sale_yield': 'Lead-to-sale yield',
}
function metricLabel(slug: string): string { return METRIC_LABEL[slug] ?? 'Tracked measure' }

/** Customer-safe alert line derived from the finding (no engineering markers). */
function alertFor(f: ConsultantFinding): string {
  const who = OWNER_LABEL[f.owner] ?? f.owner
  switch (f.id) {
    case 'r3-appt-show-leakage': return `Notify the ${who} when the weekly appointment show rate falls below your dealer-relative target.`
    case 'r3-no-show-handoff': return `Notify the ${who} on a same-day appointment no-show so a personal follow-up can go out.`
    case 'r3-no-show-effort-reduction': return `Send the ${who} a weekly summary of no-show volume for confirmation planning.`
    case 'r3-confirmation-show-gap': return `Flag the ${who} when confirmations outpace arrivals for the week.`
    case 'r3-response-time-exposure': return `Notify the ${who} when average response time drifts above your dealer-relative target.`
    case 'r3-funnel-review': return `Include the weekly funnel snapshot in the ${who}'s Monday review.`
    case 'r3-gross-mix': return `Send the ${who} a weekly front/back gross mix summary.`
    case 'r3-count-reconciliation': return `Flag the ${who} when the two sold-count views differ for the week.`
    default: return `Notify the ${who} for a weekly review.`
  }
}
function automationFor(f: ConsultantFinding): string {
  switch (f.id) {
    case 'r3-appt-show-leakage': return 'A guest confirmation-and-reminder cadence.'
    case 'r3-no-show-handoff': return 'A same-day reschedule outreach for guests who did not arrive.'
    case 'r3-no-show-effort-reduction': return 'Prioritized confirmation outreach for the week\'s bookings.'
    case 'r3-confirmation-show-gap': return 'A day-of reminder touch for confirmed guests.'
    case 'r3-response-time-exposure': return 'A lead-response prompt for the team.'
    case 'r3-funnel-review': return 'A structured weekly funnel-review checklist.'
    case 'r3-gross-mix': return 'Deal-desk review prompts.'
    case 'r3-count-reconciliation': return 'A weekly reporting reconciliation checklist.'
    default: return 'A supporting workflow prompt.'
  }
}
/**
 * Evidence-bounded "in context" line - a non-causal restatement of what the measure shows
 * plus a next-period comparison. No promises of deliveries, productivity, buyer readiness,
 * traffic, engagement, ROI, or magnitude (enforced by the shared PROHIBITED_CLAIM scanner).
 */
function whyFor(f: ConsultantFinding): string {
  switch (f.id) {
    case 'r3-appt-show-leakage': return 'This is the share of booked appointments recorded as shown this week; compare it against next period.'
    case 'r3-no-show-handoff': return 'This is the share of booked appointments recorded as no-shows this week; compare it against next period.'
    case 'r3-no-show-effort-reduction': return 'This is the count of appointments recorded as no-shows this week; review it against next period.'
    case 'r3-confirmation-show-gap': return 'This is the gap between the recorded confirmation and show rates this week; review it next period.'
    case 'r3-response-time-exposure': return 'This is your recorded average response time this week; set a dealer-relative target and review next period.'
    case 'r3-funnel-review': return 'These are your recorded funnel snapshots this week; review each against next period.'
    case 'r3-gross-mix': return 'This is your recorded front/back gross composition this week; review it in deal meetings and compare next period.'
    case 'r3-count-reconciliation': return 'Your two sold-count views differ this week; reconcile them so the counts agree.'
    default: return 'This is a recorded measure for the week; review it next period.'
  }
}

export function buildHaloCardModel(bundle: AcceptedFactsBundle): HaloCardModel {
  const s: ConsultantSynthesis = buildConsultantSynthesis(bundle) // validates fail-closed
  const cv = new Map(bundle.accepted_context_facts.map((f) => [f.key, f.value]))
  const num = (k: string): number | null => (cv.has(k) ? (cv.get(k) as number) : null)
  const mv = (k: string) => s.derived_measures.find((m) => m.key === k)
  const disp = (k: string): string | null => mv(k)?.display ?? null

  // Hero KPIs (only those present).
  const hero_kpis: HaloKpi[] = []
  const pushKpi = (key: string, label: string, caption: string) => { const d = disp(key); if (d != null) hero_kpis.push({ label, value: d, caption }) }
  pushKpi('gross.total', 'Total Gross', 'Delivered this week')
  pushKpi('appt.show_rate', 'Show Rate', 'Booked appointments shown')
  pushKpi('funnel.lead_to_sale_yield', 'Lead-to-Sale Yield', 'End-to-end, this week')
  pushKpi('funnel.visit_to_sale_rate', 'Visit-to-Sale', 'Of showroom visits')
  pushKpi('responsiveness.avg_actual_response_min', 'Avg Response', 'Minutes')
  pushKpi('appt.no_show_rate', 'No-Show Rate', 'Booked appointments')

  // Funnel (counts + rates), scaled to leads.
  const leads = num('dashboard.leads'), set = num('dashboard.appts_set'), shown = num('dashboard.appts_shown'), visits = num('dashboard.total_visits'), vsold = num('dashboard.visits_sold')
  const base = leads && leads > 0 ? leads : Math.max(set ?? 0, shown ?? 0, visits ?? 0, 1)
  const stage = (label: string, c: number | null, rateKey: string | null): HaloFunnelStage | null =>
    c == null ? null : { label, count: String(c), rate: rateKey ? disp(rateKey) : null, width_pct: Math.max(3, Math.round((c / base) * 100)) }
  const funnel = [
    stage('Leads', leads, null),
    stage('Appointments set', set, 'funnel.appointment_set_rate'),
    stage('Appointments shown', shown, 'funnel.shown_through_rate'),
    stage('Showroom visits', visits, 'funnel.visit_rate'),
    stage('Visits sold', vsold, 'funnel.visit_to_sale_rate'),
  ].filter(Boolean) as HaloFunnelStage[]

  // Appointment execution.
  const apc = (label: string, k: string): { label: string; value: string } | null => { const v = num(k); return v == null ? null : { label, value: String(v) } }
  const appointment_counts = [
    apc('Booked', 'appointments.total'), apc('Shown', 'appointments.show'), apc('No-show', 'appointments.no_show'),
    apc('Confirmed', 'appointments.confirmed'), apc('Cancelled', 'appointments.cancelled'),
    apc('Rescheduled', 'appointments.rescheduled'), apc('Completed', 'appointments.completed'),
  ].filter(Boolean) as Array<{ label: string; value: string }>
  const apr = (label: string, k: string): { label: string; value: string } | null => { const d = disp(k); return d == null ? null : { label, value: d } }
  const appointment_rates = [
    apr('Show rate', 'appt.show_rate'), apr('No-show rate', 'appt.no_show_rate'), apr('Confirmation rate', 'appt.confirmation_rate'),
    apr('Cancel rate', 'appt.cancel_rate'), apr('Reschedule rate', 'appt.reschedule_rate'), apr('Completion rate', 'appt.completion_rate'),
  ].filter(Boolean) as Array<{ label: string; value: string }>

  const respD = disp('responsiveness.avg_actual_response_min')
  const response = respD == null ? null : { value: `${respD} min`, note: 'Average actual response time this week (dealer-relative).' }

  const gross = { total: disp('gross.total') ?? 'n/a', front_mix: disp('gross.front_mix'), back_mix: disp('gross.back_mix') }

  // Actions (ranked findings; Ford-safe language already in external copy).
  const actions: HaloAction[] = s.findings.map((f) => ({
    rank: f.impact_rank,
    focus: FOCUS[f.lens] ?? 'Opportunity',
    title: titleFor(f),
    message: f.external_copy,
    why: whyFor(f),
    owner: OWNER_LABEL[f.owner] ?? f.owner,
    follow_up: metricLabel(f.follow_up_metric),
    alert: alertFor(f),
    automation: automationFor(f),
    status: 'Not Active - Review Before Activation',
  }))

  // Momentum narrative (2-3 lines from the top actions; no trend/causal claims).
  const momentum = [
    `This snapshot covers ${periodLabel(bundle.period)} for ${bundle.dealer_name}.`,
    actions[0] ? `Your leading opportunity this week: ${actions[0].message}` : 'Your Sales measures are within range this week.',
    actions[1] ? `Also worth attention: ${actions[1].message}` : '',
  ].filter(Boolean)

  // Metric appendix (every honest current measure, friendly labels only).
  const groupOf: Record<string, string> = {
    lead_funnel: 'Sales Funnel', appointments: 'Appointments', showroom_conversion: 'Showroom',
    gross_economics: 'Gross', responsiveness: 'Response', cross_cluster: 'Cross-metric', data_integrity: 'Reporting',
  }
  const appendix: HaloAppendixRow[] = s.derived_measures.map((m) => ({ label: m.label, value: m.display, group: groupOf[m.cluster] ?? 'Other' }))

  const watchdog = {
    governed: s.catalog_accountability.total,
    directly_evaluated: s.catalog_accountability.directly_evaluated_count,
    derived_count: s.derived_measures.length,
    text: `Your dealership is governed by a ${s.catalog_accountability.total}-condition Semantic Watchdog framework. This edition directly evaluates the two ratified appointment rules - show rate and no-show rate - from your current accepted Sales data, and draws on ${s.derived_measures.length} derived measures for broader context.`,
  }

  const freshness = `Data current through ${humanDate(bundle.period.end ?? '')}; generated ${humanDate(bundle.as_of_iso)}; ${daysBetween(bundle.period.end ?? bundle.as_of_iso, bundle.as_of_iso) === 1 ? 'one day old' : `${daysBetween(bundle.period.end ?? bundle.as_of_iso, bundle.as_of_iso)} days old`}.`

  return {
    profile: bundle.profile, dealer_name: bundle.dealer_name, dealer_number: bundle.dealer_id,
    period_label: periodLabel(bundle.period), freshness_badge: freshness,
    hero_kpis, momentum, funnel, appointment_counts, appointment_rates, response, gross, actions, appendix, watchdog,
    footnotes: [
      'This is a one-week snapshot; figures reflect the displayed period only.',
      'Every rate uses the numerator and denominator shown beside it.',
      'Recommendations are practical steps to test and review next period.',
      'Sales data only.',
    ],
  }
}

function titleFor(f: ConsultantFinding): string {
  switch (f.lens) {
    case 'sales_gross_lift': return 'Grow sales and gross'
    case 'expense_reduction': return 'Focus your team\'s effort'
    case 'training': return 'Coach for consistency'
    case 'handoff_process': return 'Tighten your process'
    case 'prospect_friction': return 'Smooth the buyer path'
    default: return 'Opportunity'
  }
}

// ── ASCII + escape ─────────────────────────────────────────────────────────────────────
function ascii(s: string): string {
  return s.replace(/[‐-―]/g, '-').replace(/→/g, '->').replace(/[‘’‚′]/g, "'").replace(/[“”„″]/g, '"').replace(/…/g, '...').replace(/–|—/g, '-').replace(/×/g, 'x').replace(/[^\x09\x0a\x0d\x20-\x7e]/g, '')
}
function esc(v: unknown): string {
  return ascii(String(v ?? '')).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Customer-safety guard: no banned words, Service/Parts, slug codes, SW ids, hashes, paths, markers.
const BANNED_CUSTOMER = /\b(limitation|limitations|issue|issues|quarantine|quarantined|withheld|missing|blocked|unsupported|discrepancy|failure|failed)\b/i
const SLUG_CODE = /\b(appt|gross|dashboard|funnel|cross|responsiveness|crm|appointments|roi|cage|comm|engagement)\.[a-z_]+/i
export function assertCustomerSafe(html: string): void {
  const text = html.replace(/<[^>]+>/g, ' ')
  const checks: Array<[RegExp, string]> = [
    [BANNED_CUSTOMER, 'banned customer term'],
    [PROHIBITED_CLAIM, 'unsupported causal/outcome claim'],
    [/service|parts/i, 'Service/Parts'],
    [SLUG_CODE, 'internal slug code'],
    [/\bSW-\d{3}\b/, 'internal SW id'],
    [/\bNATIVE7\b|INERT|RECOMMENDATION ONLY/, 'engineering marker'],
    [/\b[0-9a-f]{32,}\b/i, 'hash/checksum'],
    [/\.(json|xlsx|db|ts|mjs)\b/i, 'raw filename/path'],
    [/�/, 'missing-glyph replacement char'],
    [/NaN|Infinity/, 'non-finite value'],
  ]
  for (const [re, what] of checks) if (re.test(text)) throw new Error(`R4 customer-safety violation (${what})`)
}

const CSS = `
  * { box-sizing: border-box; }
  html,body { margin:0; padding:0; }
  body { font-family: Arial, Helvetica, "DejaVu Sans", sans-serif; color:#1b2330; font-size:12px; line-height:1.5; }
  .page { padding: 4mm 2mm; }
  .hero { background: linear-gradient(135deg,#0f2740,#1e4e79); color:#fff; border-radius:12px; padding:26px 28px; margin-bottom:16px; }
  .hero .eyebrow { font-size:11px; letter-spacing:.14em; text-transform:uppercase; color:#a9c6e6; }
  .hero h1 { font-size:26px; margin:6px 0 2px; font-weight:800; }
  .hero .sub { color:#d6e4f3; font-size:12px; }
  .badge { display:inline-block; margin-top:12px; background:rgba(255,255,255,.14); border:1px solid rgba(255,255,255,.28); color:#eaf2fb; font-size:10.5px; padding:5px 10px; border-radius:20px; }
  h2 { font-size:15px; color:#0f2740; margin:20px 0 8px; padding-bottom:5px; border-bottom:2px solid #e3a008; letter-spacing:.01em; break-after:avoid; }
  h3 { font-size:12px; color:#334155; margin:10px 0 5px; break-after:avoid; }
  p { margin:5px 0; }
  .kpis { display:flex; flex-wrap:wrap; gap:10px; }
  .kpi { flex:1 1 30%; min-width:150px; border:1px solid #e6ebf2; border-radius:10px; padding:12px 14px; background:#fbfcfe; }
  .kpi .l { font-size:10px; text-transform:uppercase; letter-spacing:.05em; color:#64748b; }
  .kpi .v { font-size:23px; font-weight:800; color:#0f2740; font-variant-numeric:tabular-nums; margin:2px 0; }
  .kpi .c { font-size:10px; color:#94a3b8; }
  .funnel .row { display:flex; align-items:center; gap:10px; margin:6px 0; }
  .funnel .name { width:34%; font-size:11.5px; color:#334155; }
  .funnel .bar { flex:1; background:#eef2f7; border-radius:6px; height:20px; position:relative; overflow:hidden; }
  .funnel .fill { height:100%; background:linear-gradient(90deg,#1e4e79,#3b82c4); border-radius:6px; }
  .funnel .val { width:22%; text-align:right; font-size:11.5px; font-variant-numeric:tabular-nums; color:#0f2740; font-weight:700; }
  .grid { display:flex; flex-wrap:wrap; gap:8px; }
  .cell { flex:1 1 22%; min-width:110px; border:1px solid #e6ebf2; border-radius:8px; padding:8px 10px; background:#fff; }
  .cell .l { font-size:10px; color:#64748b; } .cell .v { font-size:16px; font-weight:700; color:#0f2740; }
  table { width:100%; border-collapse:collapse; margin:6px 0; }
  th,td { border:1px solid #e6ebf2; padding:6px 8px; text-align:left; font-size:11px; vertical-align:top; }
  th { background:#f4f7fb; color:#334155; font-size:10px; text-transform:uppercase; letter-spacing:.03em; }
  tr { break-inside:avoid; }
  .action { border:1px solid #e6ebf2; border-left:5px solid #1e4e79; border-radius:10px; padding:12px 14px; margin:9px 0; break-inside:avoid; background:#fff; }
  .action .top { display:flex; justify-content:space-between; align-items:baseline; }
  .action .rank { font-size:11px; font-weight:800; color:#e3a008; text-transform:uppercase; letter-spacing:.05em; }
  .action .focus { font-size:10px; color:#64748b; }
  .action .t { font-size:13.5px; font-weight:800; color:#0f2740; margin:3px 0; }
  .action .msg { font-size:11.5px; color:#1b2330; }
  .action .why { font-size:11px; color:#475569; font-style:italic; margin:4px 0; }
  .action dl { display:flex; flex-wrap:wrap; gap:4px 18px; margin:6px 0 0; }
  .action dt { font-size:9.5px; text-transform:uppercase; color:#94a3b8; }
  .action dd { margin:0; font-size:11px; color:#0f2740; }
  .automation { margin-top:6px; padding:7px 9px; background:#fbf7ec; border:1px solid #f0e2bf; border-radius:7px; font-size:10.5px; color:#7a5b12; }
  .automation .pill { display:inline-block; background:#e3a008; color:#3a2c05; font-weight:800; font-size:9px; padding:1px 7px; border-radius:10px; text-transform:uppercase; letter-spacing:.04em; margin-right:6px; }
  .watchdog { border:1px solid #dfe6ef; border-radius:10px; padding:12px 14px; background:#f6f9fc; }
  .watchdog .stats { display:flex; gap:16px; margin-top:8px; }
  .watchdog .s { text-align:center; } .watchdog .s .n { font-size:20px; font-weight:800; color:#1e4e79; } .watchdog .s .l { font-size:9.5px; color:#64748b; text-transform:uppercase; }
  .footnotes { margin-top:14px; border-top:1px solid #e6ebf2; padding-top:8px; color:#94a3b8; font-size:9.5px; }
  .footnotes li { margin:2px 0; }
  h2, h3 { page-break-after: avoid; }
`

export function renderHaloCardHtml(model: HaloCardModel): string {
  const kpis = model.hero_kpis.map((k) => `<div class="kpi"><div class="l">${esc(k.label)}</div><div class="v">${esc(k.value)}</div><div class="c">${esc(k.caption)}</div></div>`).join('')
  const funnel = model.funnel.map((f) => `<div class="row"><div class="name">${esc(f.label)}</div><div class="bar"><div class="fill" style="width:${f.width_pct}%"></div></div><div class="val">${esc(f.count)}${f.rate ? ` &middot; ${esc(f.rate)}` : ''}</div></div>`).join('')
  const apptCounts = model.appointment_counts.map((c) => `<div class="cell"><div class="l">${esc(c.label)}</div><div class="v">${esc(c.value)}</div></div>`).join('')
  const apptRates = model.appointment_rates.map((c) => `<div class="cell"><div class="l">${esc(c.label)}</div><div class="v">${esc(c.value)}</div></div>`).join('')
  const grossCells = [
    `<div class="cell"><div class="l">Total gross</div><div class="v">${esc(model.gross.total)}</div></div>`,
    model.gross.front_mix ? `<div class="cell"><div class="l">Front-gross mix</div><div class="v">${esc(model.gross.front_mix)}</div></div>` : '',
    model.gross.back_mix ? `<div class="cell"><div class="l">Back-gross mix</div><div class="v">${esc(model.gross.back_mix)}</div></div>` : '',
  ].join('')
  const actions = model.actions.map((a) => `
    <div class="action">
      <div class="top"><span class="rank">Priority ${a.rank}</span><span class="focus">${esc(a.focus)}</span></div>
      <div class="t">${esc(a.title)}</div>
      <div class="msg">${esc(a.message)}</div>
      <div class="why">In context: ${esc(a.why)}</div>
      <dl><dt>Owner</dt><dd>${esc(a.owner)}</dd><dt>Follow-up metric</dt><dd>${esc(a.follow_up)}</dd></dl>
      <div class="automation"><span class="pill">${esc(a.status)}</span>
        <strong>Recommended alert:</strong> ${esc(a.alert)}<br>
        <strong>Recommended automation:</strong> ${esc(a.automation)}</div>
    </div>`).join('')
  const appendixByGroup = new Map<string, HaloAppendixRow[]>()
  for (const r of model.appendix) { const g = appendixByGroup.get(r.group) ?? []; g.push(r); appendixByGroup.set(r.group, g) }
  const appendix = [...appendixByGroup.entries()].map(([group, rows]) =>
    `<tr><th colspan="2" style="background:#eef3f9">${esc(group)}</th></tr>` + rows.map((r) => `<tr><td>${esc(r.label)}</td><td style="text-align:right;font-variant-numeric:tabular-nums">${esc(r.value)}</td></tr>`).join('')).join('')

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(model.dealer_name)} - Halo Sales Performance</title><style>${CSS}</style></head>
<body><div class="page">
  <div class="hero">
    <div class="eyebrow">Halo Sales Performance Report</div>
    <h1>${esc(model.dealer_name)}</h1>
    <div class="sub">Dealer ${esc(model.dealer_number)} &nbsp;|&nbsp; ${esc(model.period_label)}</div>
    <div class="badge">${esc(model.freshness_badge)}</div>
  </div>

  <h2>Executive Snapshot</h2>
  <div class="kpis">${kpis}</div>

  <h2>Momentum and Opportunity</h2>
  ${model.momentum.map((m) => `<p>${esc(m)}</p>`).join('')}

  <h2>Sales Funnel</h2>
  <div class="funnel">${funnel}</div>

  <h2>Appointment Execution</h2>
  <h3>Counts</h3><div class="grid">${apptCounts}</div>
  <h3>Rates</h3><div class="grid">${apptRates}</div>

  ${model.response ? `<h2>Response and Follow-up</h2><div class="grid"><div class="cell"><div class="l">Average response</div><div class="v">${esc(model.response.value)}</div></div></div><p>${esc(model.response.note)}</p>` : ''}

  <h2>Gross Performance</h2>
  <div class="grid">${grossCells}</div>

  <h2>Priority Action Plan</h2>
  ${actions}

  <h2>Recommended Alerts and Automations</h2>
  <p>Each item below is a suggestion for your team to consider. Nothing here is turned on.</p>
  <table><colgroup><col style="width:26%"><col style="width:37%"><col style="width:37%"></colgroup>
  <thead><tr><th>Opportunity</th><th>Recommended alert</th><th>Recommended automation</th></tr></thead>
  <tbody>${model.actions.map((a) => `<tr><td>${esc(a.title)}<br><span style="font-size:9.5px;color:#94a3b8">${esc(a.status)}</span></td><td>${esc(a.alert)}</td><td>${esc(a.automation)}</td></tr>`).join('')}</tbody></table>

  <h2>Metric Appendix</h2>
  <table><colgroup><col style="width:70%"><col style="width:30%"></colgroup>
  <thead><tr><th>Measure</th><th style="text-align:right">This week</th></tr></thead>
  <tbody>${appendix}</tbody></table>

  <h2>Semantic Watchdog</h2>
  <div class="watchdog">
    <p>${esc(model.watchdog.text)}</p>
    <div class="stats">
      <div class="s"><div class="n">${model.watchdog.governed}</div><div class="l">Governed conditions</div></div>
      <div class="s"><div class="n">${model.watchdog.directly_evaluated}</div><div class="l">Ratified rules evaluated</div></div>
      <div class="s"><div class="n">${model.watchdog.derived_count}</div><div class="l">Derived measures</div></div>
    </div>
  </div>

  <ul class="footnotes">${model.footnotes.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
</div></body></html>`
  assertCustomerSafe(html)
  return html
}
