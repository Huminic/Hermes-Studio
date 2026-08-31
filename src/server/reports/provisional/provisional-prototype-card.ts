/**
 * INTERNAL PROTOTYPE Halo Data report card — "Not Strict M1R Acceptance".
 *
 * Composes the 9 STRICT-ACCEPTED families (Dashboard, Appointments, CRM Sales Gross — read
 * from the governed store, read-only) with DEFENSIBLE PROVISIONAL metrics (ROI, CAGE, Sales
 * Communication — from the non-promoting adapter). It uses positive, customer-style headings
 * and pushes every caveat into concise NUMBERED footnotes/endnotes rather than primary
 * "limitation" headings. It is watermarked "Internal Prototype — Not Strict M1R Acceptance".
 *
 * Ranked opportunities and suggested manager / sales-manager / salesperson notifications are
 * INERT recommendations only — nothing is activated, scheduled, or sent.
 *
 * PRIVACY: renders aggregate values + filenames/checksums/exclusion-counts only. No customer
 * names, emails, phones, message bodies, or lead IDs ever enter this model or its HTML.
 */
import {
  type AppointmentsMetrics,
  type CrmSalesGross,
  type DealershipPerformance,
  type Unavailable,
  readAppointments,
  readCrmSalesGross,
  readDealershipPerformance,
} from '../../ingest-native-metrics'
import { resolveReportFreshness, type DataFreshness } from '../data-freshness'
import {
  readProvisionalFamilyFile,
  type LimitationCode,
  type ProvisionalProvenance,
  type ProvisionalResult,
} from './provisional-adapter'
import path from 'node:path'

export const PROTOTYPE_WATERMARK = 'Internal Prototype — Not Strict M1R Acceptance'

const LIMITATION_TEXT: Record<LimitationCode, string> = {
  NOT_STRICT_ACCEPTANCE: 'Provisional interim metric; the strict M1R status of this family remains quarantined (not accepted).',
  HIDDEN_LEAD_INTENT_AGGREGATE: 'VinSolutions hidden Lead Intent metadata includes Parts/Service and cannot be separated after aggregation, so this figure is directional and not strict Sales-only proof.',
  HIDDEN_LEAD_INTENT_ROWLEVEL_RESIDUAL: 'Row-level Sales filters and service-source exclusion were applied before counting; residual hidden Lead-Intent metadata may remain, so this figure is directional.',
  SERVICE_ROWS_EXCLUDED: 'Service/Parts-coded rows were detected and excluded before calculation.',
  ROI_COST_ZERO: 'Cost/profit fields are present but zero in the observed export; attributed ROI is withheld (missing is not zero).',
  SINGLE_PERIOD_BASELINE: 'Single accepted period; no multi-week trend is asserted.',
  NO_CAUSALITY: 'Counts are descriptive, not attributed causation.',
  SCHEMA_MISMATCH: 'Source schema did not match the expected shape; the family failed closed.',
  WRONG_DEALER: 'Source dealer did not match the target rooftop; the family failed closed.',
  WRONG_PERIOD: 'Source period did not match the expected window; the family failed closed.',
}

export type PrototypeFootnote = { n: number; text: string }
export type PrototypeItem = { text: string; notes: number[] }
export type PrototypeSection = { heading: string; items: PrototypeItem[] }
export type PrototypeRecommendation = { audience: 'Manager' | 'Sales Manager' | 'Salesperson'; text: string; status: string }
export type PrototypeProvenanceRow = {
  family: string
  tier: 'strict-accepted' | 'provisional-quarantined'
  period: string
  rowsObserved: number | null
  serviceExcluded: number | null
  reconciles: boolean | null
  checksum12: string
  sourceFilename: string | null
  strictStatus: string
  provisional: boolean
}
export type PrototypeCard = {
  watermark: string
  title: string
  dataThrough: string | null
  sections: PrototypeSection[]
  opportunities: PrototypeItem[]
  recommendations: PrototypeRecommendation[]
  footnotes: PrototypeFootnote[]
  provenance: PrototypeProvenanceRow[]
}

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`
const pct = (num: number, den: number) => `${Math.round((num / den) * 100)}%`

/** Accumulates de-duplicated, stably-numbered footnotes. */
class Notes {
  private byText = new Map<string, number>()
  list: PrototypeFootnote[] = []
  ref(codes: LimitationCode[], extra?: string): number[] {
    const out: number[] = []
    for (const c of codes) {
      const text = extra && c === 'SERVICE_ROWS_EXCLUDED' ? `${LIMITATION_TEXT[c]} ${extra}` : LIMITATION_TEXT[c]
      out.push(this.num(text))
    }
    return out
  }
  note(text: string): number { return this.num(text) }
  private num(text: string): number {
    const seen = this.byText.get(text)
    if (seen) return seen
    const n = this.list.length + 1
    this.byText.set(text, n)
    this.list.push({ n, text })
    return n
  }
}

export type StrictReaders = {
  dp: DealershipPerformance | Unavailable
  appt: AppointmentsMetrics | Unavailable
  gross: CrmSalesGross | Unavailable
}
export type ProvisionalReaders = { roi: ProvisionalResult; cage: ProvisionalResult; comm: ProvisionalResult }

const DEALER_NAMES: Record<string, string> = {
  'serra-honda': 'Serra Honda',
  'serra-nissan': 'Serra Nissan',
  'tony-serra-ford': 'Tony Serra Ford',
}

/** PURE builder — unit-testable with hand-built reader/provisional results. */
export function buildPrototypeCard(
  profile: string,
  dealerName: string,
  strict: StrictReaders,
  freshness: DataFreshness,
  prov: ProvisionalReaders,
): PrototypeCard {
  const notes = new Notes()
  const sections: PrototypeSection[] = []
  const dpOk = strict.dp.available ? strict.dp : null
  const apOk = strict.appt.available ? strict.appt : null
  const grOk = strict.gross.available ? strict.gross : null

  // ── STRICT-ACCEPTED (no footnotes needed — these are accepted) ──
  const snapshot: PrototypeItem[] = []
  if (grOk) snapshot.push({ text: `${grOk.rowCount} vehicles delivered this week`, notes: [] })
  if (grOk && grOk.totalSum != null) snapshot.push({ text: `${money(grOk.totalSum)} in total gross`, notes: [] })
  if (apOk) snapshot.push({ text: `${apOk.total} sales appointments recorded this week`, notes: [] })
  if (apOk && apOk.total > 0) snapshot.push({ text: `${pct(apOk.show, apOk.total)} appointment show rate`, notes: [] })
  if (snapshot.length) sections.push({ heading: 'Executive Snapshot', items: snapshot })

  const revenue: PrototypeItem[] = []
  if (grOk && grOk.totalSum != null) {
    revenue.push({ text: `${money(grOk.totalSum)} total gross across ${grOk.rowCount} delivered deals`, notes: [] })
    if (grOk.rowCount > 0) revenue.push({ text: `${money(grOk.totalSum / grOk.rowCount)} average gross per delivered deal`, notes: [] })
  }
  if (dpOk && dpOk.summary.leads != null && dpOk.summary.apptsSet != null && dpOk.summary.apptsShow != null) {
    revenue.push({ text: `Dashboard lead funnel: ${dpOk.summary.leads} leads → ${dpOk.summary.apptsSet} appointments set → ${dpOk.summary.apptsShow} shown`, notes: [] })
  }
  if (revenue.length) sections.push({ heading: 'Revenue & Customer Journey', items: revenue })

  // ── PROVISIONAL: Lead Source Performance (ROI) ──
  if (prov.roi.available) {
    const items: PrototypeItem[] = []
    const byId = new Map(prov.roi.metrics.map((m) => [m.id, m]))
    const tl = byId.get('roi.total_leads'), sold = byId.get('roi.sold_from_leads'), gr = byId.get('roi.total_gross'), dup = byId.get('roi.duplicate_rate')
    const svcNote = `(${prov.roi.serviceRowsExcluded} excluded in this delivery)`
    if (tl?.value != null) items.push({ text: `${tl.value} leads worked across sources`, notes: notes.ref(tl.footnoteCodes) })
    if (sold?.value != null) items.push({ text: `${sold.value} sold from those leads`, notes: notes.ref(sold.footnoteCodes) })
    if (gr?.value != null) items.push({ text: `${money(gr.value)} total gross attributed across sources`, notes: notes.ref(gr.footnoteCodes) })
    if (dup?.value != null) items.push({ text: `${Math.round(dup.value * 100)}% duplicate-lead rate — a source-hygiene signal`, notes: notes.ref(dup.footnoteCodes) })
    if (prov.roi.serviceRowsExcluded >= 0) items.push({ text: `Sales-only sources isolated ${svcNote}`, notes: notes.ref(['SERVICE_ROWS_EXCLUDED'], svcNote) })
    if (items.length) sections.push({ heading: 'Lead Source Performance', items })
  }

  // ── PROVISIONAL: Team Activity (CAGE) ──
  if (prov.cage.available) {
    const items: PrototypeItem[] = []
    const byId = new Map(prov.cage.metrics.map((m) => [m.id, m]))
    const reps = byId.get('cage.rep_count'), leads = byId.get('cage.total_leads'), set = byId.get('cage.appts_set'), shown = byId.get('cage.appts_shown')
    if (reps?.value != null) items.push({ text: `${reps.value} sales reps active this week`, notes: notes.ref(reps.footnoteCodes) })
    if (leads?.value != null) items.push({ text: `${leads.value} leads worked by the team`, notes: notes.ref(leads.footnoteCodes) })
    if (set?.value != null && shown?.value != null) items.push({ text: `${set.value} appointments set, ${shown.value} shown`, notes: notes.ref(set.footnoteCodes) })
    const cageSvcNote = `(${prov.cage.serviceRowsExcluded} excluded in this delivery)`
    if (items.length) items.push({ text: `Sales-only rep activity isolated ${cageSvcNote}`, notes: notes.ref(['SERVICE_ROWS_EXCLUDED'], cageSvcNote) })
    if (items.length) sections.push({ heading: 'Team Activity & Engagement', items })
  }

  // ── PROVISIONAL: Customer Communication (comm) ──
  if (prov.comm.available) {
    const items: PrototypeItem[] = []
    const byId = new Map(prov.comm.metrics.map((m) => [m.id, m]))
    const sales = byId.get('comm.sales_communications'), inb = byId.get('comm.inbound'), outb = byId.get('comm.outbound')
    const svcNote = `(${prov.comm.serviceRowsExcluded} excluded)`
    if (sales?.value != null) items.push({ text: `${sales.value} Sales communications logged ${svcNote}`, notes: notes.ref(sales.footnoteCodes, svcNote) })
    if (inb?.value != null && outb?.value != null) items.push({ text: `${outb.value} outbound rep messages, ${inb.value} inbound customer replies`, notes: notes.ref(inb.footnoteCodes) })
    if (items.length) sections.push({ heading: 'Customer Communication', items })
  }

  // ── Ranked opportunities (strict signals first; provisional flagged with footnotes) ──
  const opportunities: PrototypeItem[] = []
  if (apOk && apOk.total > 0 && apOk.noShow > 0) opportunities.push({ text: `Recover ${apOk.noShow} no-show appointments with a same-week reminder cadence`, notes: [] })
  if (apOk && apOk.total > 0 && apOk.confirmed < apOk.total) opportunities.push({ text: `Confirm the ${apOk.total - apOk.confirmed} unconfirmed appointments to lift show rate`, notes: [] })
  if (prov.roi.available) {
    const dup = prov.roi.metrics.find((m) => m.id === 'roi.duplicate_rate')
    if (dup?.value != null && dup.value > 0) opportunities.push({ text: `Reduce duplicate leads (${Math.round(dup.value * 100)}%) by tightening source routing`, notes: notes.ref(dup.footnoteCodes) })
  }
  if (prov.comm.available) {
    const inb = prov.comm.metrics.find((m) => m.id === 'comm.inbound')?.value
    const outb = prov.comm.metrics.find((m) => m.id === 'comm.outbound')?.value
    if (inb != null && outb != null && inb > 0 && outb / inb >= 4) opportunities.push({ text: `Balance a high outbound-to-inbound ratio (${outb}:${inb}) with faster first-reply handling`, notes: notes.ref(['HIDDEN_LEAD_INTENT_ROWLEVEL_RESIDUAL', 'NO_CAUSALITY']) })
  }
  const rankedOpps = opportunities.map((o, i) => ({ text: `Priority ${i + 1} — ${o.text}`, notes: o.notes }))

  // ── Inert notification / automation recommendations (nothing activated) ──
  const INERT = 'INERT — recommendation only; not activated, scheduled, or sent'
  const recommendations: PrototypeRecommendation[] = [
    { audience: 'Manager', text: 'Weekly digest: delivered vehicles, total gross, and appointment show rate', status: INERT },
    { audience: 'Sales Manager', text: 'Alert when unconfirmed appointments exceed a set threshold before the weekend', status: INERT },
    { audience: 'Salesperson', text: 'Nudge to re-engage this week’s no-shows within 24 hours', status: INERT },
  ]

  // ── Provenance rows (strict + provisional; aggregate + filename/checksum only) ──
  const provenance: PrototypeProvenanceRow[] = []
  const pushStrict = (family: string, r: { available: boolean; provenance?: { period?: { start?: string | null; end?: string | null }; acceptedRows?: number; checksum?: string } }) => {
    if (r.available && r.provenance) provenance.push({
      family, tier: 'strict-accepted',
      period: `${r.provenance.period?.start ?? '?'}..${r.provenance.period?.end ?? '?'}`,
      rowsObserved: r.provenance.acceptedRows ?? null, serviceExcluded: null, reconciles: null,
      checksum12: (r.provenance.checksum ?? '').slice(0, 12), sourceFilename: null,
      strictStatus: 'accepted', provisional: false,
    })
  }
  pushStrict('dealership_performance', strict.dp)
  pushStrict('appointments', strict.appt)
  pushStrict('crm_sales_gross', strict.gross)
  const pushProv = (p: ProvisionalResult) => {
    const pr: ProvisionalProvenance = p.provenance
    provenance.push({
      family: pr.family, tier: 'provisional-quarantined',
      period: `${pr.period.start ?? '?'}..${pr.period.end ?? '?'}`,
      rowsObserved: p.available ? p.rowsObserved : null,
      serviceExcluded: p.available ? p.serviceRowsExcluded : null,
      reconciles: p.available ? p.reconciliation.reconciles : null,
      checksum12: pr.checksumSha256.slice(0, 12), sourceFilename: pr.sourceFilename,
      strictStatus: pr.strictStatus, provisional: pr.provisional,
    })
  }
  pushProv(prov.roi); pushProv(prov.cage); pushProv(prov.comm)

  return {
    watermark: PROTOTYPE_WATERMARK,
    title: `${dealerName} Sales Performance and Growth Report`,
    dataThrough: freshness.ageLabel,
    sections,
    opportunities: rankedOpps,
    recommendations,
    footnotes: notes.list,
    provenance,
  }
}

/** Wire strict readers (governed store, read-only) + provisional adapter (local fixtures). */
export function resolvePrototypeCard(profile: string, now: Date, fixturesDir: string, fixtureNames: { roi: string; cage: string; comm: string }): PrototypeCard {
  const dealerName = DEALER_NAMES[profile] ?? profile
  const strict: StrictReaders = {
    dp: readDealershipPerformance(profile),
    appt: readAppointments(profile),
    gross: readCrmSalesGross(profile),
  }
  const prov: ProvisionalReaders = {
    roi: readProvisionalFamilyFile(path.join(fixturesDir, fixtureNames.roi), 'lead_source_roi', profile),
    cage: readProvisionalFamilyFile(path.join(fixturesDir, fixtureNames.cage), 'cage_kpi', profile),
    comm: readProvisionalFamilyFile(path.join(fixturesDir, fixtureNames.comm), 'sales_comm_log', profile),
  }
  return buildPrototypeCard(profile, dealerName, strict, resolveReportFreshness(profile, now), prov)
}

// ── HTML renderer (watermarked; numbered footnotes; endnotes; print-friendly) ──
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const sup = (nums: number[]) => (nums.length ? `<sup class="fn">${nums.join(',')}</sup>` : '')

const CSS = `
  :root{--ink:#0f172a;--muted:#5b6b7f;--line:#e6ebf1;--brand:#0b5cab;--brand2:#0a7d55;--warn:#b45309;--bg:#f6f8fb;--card:#fff}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{max-width:860px;margin:0 auto;padding:28px 26px;position:relative}
  .wm-banner{background:repeating-linear-gradient(45deg,#fff7ed,#fff7ed 14px,#ffedd5 14px,#ffedd5 28px);border:1px solid #fdba74;color:var(--warn);font-weight:800;letter-spacing:.04em;text-transform:uppercase;font-size:12.5px;text-align:center;padding:9px 12px;border-radius:8px;margin-bottom:18px}
  .wm-ghost{position:fixed;inset:0;pointer-events:none;z-index:0;display:flex;align-items:center;justify-content:center;opacity:.06;transform:rotate(-24deg);font-size:64px;font-weight:900;color:#b45309;white-space:nowrap}
  header.masthead{border-bottom:3px solid var(--brand);padding-bottom:14px;margin-bottom:18px;position:relative;z-index:1}
  .eyebrow{letter-spacing:.14em;text-transform:uppercase;font-size:11px;color:var(--brand);font-weight:700;margin:0 0 6px}
  h1{font-size:25px;line-height:1.2;margin:0 0 8px;font-weight:800}
  .data-through{display:inline-block;background:#eef4fb;color:var(--brand);font-weight:600;font-size:13px;padding:5px 12px;border-radius:999px;margin:0}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;position:relative;z-index:1}
  section.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;box-shadow:0 1px 2px rgba(16,24,40,.04);break-inside:avoid}
  section.card h2{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:0 0 10px;font-weight:700}
  section.full{grid-column:1 / -1}
  ul{margin:0;padding:0;list-style:none}
  li{position:relative;padding:6px 0 6px 20px;border-bottom:1px solid #f1f4f8;font-size:14.5px}
  li:last-child{border-bottom:0}
  li::before{content:"";position:absolute;left:2px;top:13px;width:8px;height:8px;border-radius:50%;background:var(--brand2)}
  sup.fn{color:var(--brand);font-weight:700;font-size:10px;padding-left:2px}
  .rec{display:flex;gap:8px;align-items:baseline}
  .rec .aud{font-weight:700;color:var(--ink);min-width:110px}
  .rec .st{color:var(--warn);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.03em}
  ol.endnotes{margin:8px 0 0;padding-left:26px;color:var(--muted);font-size:12.5px}
  ol.endnotes li{border:0;padding:3px 0 3px 4px}
  ol.endnotes li::before{content:none;display:none}
  table.prov{width:100%;border-collapse:collapse;font-size:11.5px;color:var(--muted)}
  table.prov th,table.prov td{border:1px solid var(--line);padding:5px 7px;text-align:left}
  footer{margin-top:22px;padding-top:12px;border-top:1px solid var(--line);color:var(--muted);font-size:12px;position:relative;z-index:1;background:var(--bg)}
  @media (max-width:640px){.grid{grid-template-columns:1fr}}
  @media print{body{background:#fff}.page{max-width:100%;padding:0}section.card{box-shadow:none}}
`

export function renderPrototypeCardHtml(card: PrototypeCard): string {
  const section = (s: PrototypeSection, full = false) => `      <section class="card${full ? ' full' : ''}">
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
  const recHtml = `      <section class="card full">
        <h2>Suggested Notifications &amp; Automations</h2>
        <ul>${card.recommendations.map((r) => `\n          <li class="rec"><span class="aud">${esc(r.audience)}</span><span>${esc(r.text)}</span> <span class="st">${esc(r.status)}</span></li>`).join('')}
        </ul>
      </section>`
  const endnotesHtml = card.footnotes.length ? `      <section class="card full">
        <h2>Endnotes</h2>
        <ol class="endnotes">${card.footnotes.map((f) => `\n          <li value="${f.n}">${esc(f.text)}</li>`).join('')}
        </ol>
      </section>` : ''
  const provRows = card.provenance.map((p) => `<tr><td>${esc(p.family)}</td><td>${esc(p.tier)}</td><td>${esc(p.period)}</td><td>${p.rowsObserved ?? '—'}</td><td>${p.serviceExcluded ?? '—'}</td><td>${p.reconciles == null ? '—' : p.reconciles ? 'yes' : 'no'}</td><td><code>${esc(p.checksum12)}</code></td><td>${esc(p.strictStatus)}${p.provisional ? ' · provisional' : ''}</td></tr>`).join('')
  const provHtml = `      <section class="card full">
        <h2>Provenance (aggregate; filenames &amp; checksums only)</h2>
        <table class="prov"><thead><tr><th>family</th><th>tier</th><th>period</th><th>rows</th><th>svc excl.</th><th>reconciles</th><th>checksum</th><th>status</th></tr></thead><tbody>${provRows}</tbody></table>
      </section>`
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(card.title)} — ${esc(card.watermark)}</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="wm-ghost">${esc(card.watermark)}</div>
  <div class="page">
    <div class="wm-banner">${esc(card.watermark)}</div>
    <header class="masthead">
      <p class="eyebrow">Weekly Sales Performance &amp; Growth · Interim Prototype</p>
      <h1>${esc(card.title)}</h1>
      <p class="data-through">${esc(card.dataThrough ?? 'Data not yet available')}</p>
    </header>
    <div class="grid">
${sectionsHtml}
${oppHtml}
${recHtml}
${endnotesHtml}
${provHtml}
    </div>
    <footer>${esc(card.watermark)} · Provisional families remain strict-quarantined (zero accepted metrics); figures are directional and separate from strict M1R acceptance.</footer>
  </div>
</body>
</html>`
}
