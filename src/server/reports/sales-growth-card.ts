/**
 * "[Dealer] Sales Performance and Growth Report" — customer-facing sales document.
 *
 * HARD RULE: the EXTERNAL card is a sales document. It uses positive, action-oriented
 * headings, includes ONLY supported/accepted metrics, and OMITS anything unsupported
 * cleanly (no placeholders, no zeros for missing). It NEVER contains internal words
 * (limitation/issue/caveat/quarantine/validation/gap/missing/unavailable/withheld/hold).
 * All provenance, held-family reasons, freshness state, precedence, and evidence go in a
 * SEPARATE internal artifact returned alongside — never rendered to the customer.
 *
 * Inputs are the accepted native reader results (Dashboard, Appointments, CRM Sales Gross)
 * so the builder is pure and unit-testable.
 */
import {
  readAppointments,
  readCrmSalesGross,
  readDealershipPerformance,
  type AppointmentsMetrics,
  type CrmSalesGross,
  type DealershipPerformance,
  type Unavailable,
} from '../ingest-native-metrics'
import { isFreshEnoughToPublish, resolveReportFreshness, type DataFreshness } from './data-freshness'

export type CardSection = { heading: string; items: string[] }
export type ExternalCard = {
  title: string
  dataThrough: string
  sections: CardSection[]
}
export type InternalEvidence = {
  profile: string
  dealer: string
  dataThrough: string | null
  freshnessState: DataFreshness['state']
  ageDays: number | null
  acceptedFamilies: Array<{ family: string; period: string; rows: number; checksum: string }>
  heldFamilies: Array<{ family: string; reason: string }>
  grossSourcePrecedence: string
  metrics: Record<string, number | null>
  notes: string[]
}

/** Words that must never appear in the external card (case-insensitive). */
export const FORBIDDEN_EXTERNAL = [
  'limitation',
  'issue',
  'caveat',
  'quarantine',
  'validation',
  'gap',
  'missing',
  'unavailable',
  'withheld',
  'hold',
  'blocker',
  'defect',
  'error',
  'not available',
  'no data',
]

const money = (n: number) =>
  `$${Math.round(n).toLocaleString('en-US')}`
const pct = (num: number, den: number) => `${Math.round((num / den) * 100)}%`

type Readers = {
  dp: DealershipPerformance | Unavailable
  appt: AppointmentsMetrics | Unavailable
  gross: CrmSalesGross | Unavailable
}

export function buildSalesGrowthCard(
  profile: string,
  dealerName: string,
  readers: Readers,
  freshness: DataFreshness,
): { external: ExternalCard | null; internal: InternalEvidence } {
  const { dp, appt, gross } = readers
  const dpOk = dp.available ? dp : null
  const apOk = appt.available ? appt : null
  const grOk = gross.available ? gross : null

  // ── EXTERNAL sections (supported metrics only; omit absent cleanly) ──
  const sections: CardSection[] = []

  const snapshot: string[] = []
  if (dpOk && dpOk.summary.soldInPeriod != null) snapshot.push(`${dpOk.summary.soldInPeriod} vehicles delivered this week`)
  if (grOk && grOk.totalSum != null) snapshot.push(`${money(grOk.totalSum)} in total gross`)
  if (apOk) snapshot.push(`${apOk.total} sales appointments recorded this week`)
  if (apOk && apOk.total > 0) snapshot.push(`${pct(apOk.show, apOk.total)} appointment show rate`)
  if (snapshot.length) sections.push({ heading: 'Executive Snapshot', items: snapshot })

  const momentum: string[] = []
  if (apOk && apOk.total > 0) {
    momentum.push(`${apOk.total} appointments set — ${apOk.show} shown, ${apOk.confirmed} confirmed`)
    momentum.push(`${pct(apOk.confirmed, apOk.total)} of appointments confirmed ahead of time`)
  }
  if (dpOk && dpOk.summary.soldInPeriod != null) momentum.push(`${dpOk.summary.soldInPeriod} deliveries closed in the period`)
  if (momentum.length) sections.push({ heading: "This Week's Momentum", items: momentum })

  const revenue: string[] = []
  if (grOk && grOk.totalSum != null) {
    revenue.push(`${money(grOk.totalSum)} total gross across ${grOk.rowCount} delivered deals`)
    if (grOk.rowCount > 0) revenue.push(`${money(grOk.totalSum / grOk.rowCount)} average gross per delivered deal`)
    if (grOk.frontSum != null && grOk.backSum != null) revenue.push(`Front ${money(grOk.frontSum)} · Back ${money(grOk.backSum)}`)
  }
  if (revenue.length) sections.push({ heading: 'Revenue Contribution', items: revenue })

  const journey: string[] = []
  if (dpOk && dpOk.summary.apptsSet != null && dpOk.summary.apptsShow != null) {
    journey.push(`${dpOk.summary.apptsSet} appointments set → ${dpOk.summary.apptsShow} shown`)
  }
  if (dpOk && dpOk.summary.totalVisits != null && dpOk.summary.visitsSold != null) {
    journey.push(`${dpOk.summary.totalVisits} showroom visits → ${dpOk.summary.visitsSold} sold`)
  }
  if (journey.length) sections.push({ heading: 'Customer Journey', items: journey })

  // Growth opportunities framed positively (opportunity, not a problem).
  const growth: string[] = []
  if (apOk && apOk.total > 0 && apOk.noShow > 0) {
    growth.push(`${apOk.noShow} of this week's booked appointments didn't convert to a visit — a reminder cadence can lift next week's show rate`)
  }
  if (apOk && apOk.total > 0 && apOk.confirmed < apOk.total) {
    growth.push(`${apOk.total - apOk.confirmed} of this week's appointments went unconfirmed — a confirmation step can raise show rate going forward`)
  }
  if (grOk && grOk.rowCount > 0 && grOk.backSum != null && grOk.backSum >= 0) {
    growth.push('Back-end product attach is contributing gross — room to grow per-deal with F&I menu focus')
  }
  if (growth.length) sections.push({ heading: 'High-Impact Growth Opportunities', items: growth })

  const moves: string[] = []
  if (apOk && apOk.total > 0) moves.push('Add a confirmation step for next week\'s appointments within business hours')
  if (apOk && apOk.noShow > 0) moves.push('Re-engage this week\'s no-shows with a personal call + value offer')
  if (grOk && grOk.rowCount > 0) moves.push('Review front/back gross mix with the desk to protect per-deal profit')
  if (moves.length) sections.push({ heading: 'Recommended Next Moves', items: moves })

  // FAIL-CLOSED: only publish an external card when the data is current/aging. Stale or
  // missing → external is null (internal-only, non-publishable); NO customer-facing message.
  const external: ExternalCard | null = isFreshEnoughToPublish(freshness)
    ? { title: `${dealerName} Sales Performance and Growth Report`, dataThrough: freshness.ageLabel, sections }
    : null

  // ── INTERNAL evidence (never rendered to the customer) ──
  const acceptedFamilies: InternalEvidence['acceptedFamilies'] = []
  const pushProv = (fam: string, r: { available: boolean; provenance?: { period?: { start?: string | null; end?: string | null }; acceptedRows?: number; checksum?: string } }) => {
    if (r.available && r.provenance) {
      acceptedFamilies.push({
        family: fam,
        period: `${r.provenance.period?.start ?? '?'}..${r.provenance.period?.end ?? '?'}`,
        rows: r.provenance.acceptedRows ?? 0,
        checksum: r.provenance.checksum ?? '',
      })
    }
  }
  pushProv('dealership_performance', dp)
  pushProv('appointments', appt)
  pushProv('crm_sales_gross', gross)

  const heldFamilies = ['cage_kpi', 'lead_source_roi', 'sales_comm_log'].map((family) => ({
    family,
    reason:
      'Filters positively select Service/Parts Lead-Intent (Parts, Service); whole-delivery quarantine under the Sales-only contract — zero metrics accepted.',
  }))

  const internal: InternalEvidence = {
    profile,
    dealer: dealerName,
    dataThrough: freshness.dataThrough,
    freshnessState: freshness.state,
    ageDays: freshness.ageDays,
    acceptedFamilies,
    heldFamilies,
    grossSourcePrecedence:
      'gross.total_sum sourced from CRM Sales Gross (per-deal, AUTHORITATIVE); Dashboard TOTAL is a cross-check only and is never summed; gross.reconciliation_mismatches only from CRM.',
    metrics: {
      sold_in_period: dpOk?.summary.soldInPeriod ?? null,
      total_gross: grOk?.totalSum ?? null,
      gross_reconciliation_mismatches: grOk?.reconciliationMismatches ?? null,
      appt_total: apOk?.total ?? null,
      appt_show: apOk?.show ?? null,
      appt_no_show: apOk?.noShow ?? null,
      appt_confirmed: apOk?.confirmed ?? null,
      dashboard_appts_set: dpOk?.summary.apptsSet ?? null,
    },
    notes: [
      'Appointment rates use the appointments family denominator only (never Dashboard apptsSet).',
      'CAGE / Lead Source ROI / Sales Communication remain quarantined; comm-derived metrics are not surfaced.',
    ],
  }

  return { external, internal }
}

/** Internal-only evidence rendered as Markdown (never shown to the customer). */
export function renderInternalEvidenceMarkdown(e: InternalEvidence): string {
  const accepted = e.acceptedFamilies
    .map((f) => `| ${f.family} | ${f.period} | ${f.rows} | \`${f.checksum.slice(0, 12)}\` |`)
    .join('\n')
  const held = e.heldFamilies.map((f) => `- **${f.family}** — ${f.reason}`).join('\n')
  const metrics = Object.entries(e.metrics)
    .map(([k, v]) => `- ${k}: ${v === null ? '_withheld (missing ≠ zero)_' : v}`)
    .join('\n')
  return `# INTERNAL EVIDENCE — ${e.dealer} (${e.profile}) — NOT customer-facing

- data_through: ${e.dataThrough ?? '(none)'}
- freshness_state: **${e.freshnessState}** · age_days: ${e.ageDays ?? '(n/a)'}
- gross source precedence: ${e.grossSourcePrecedence}

## Accepted families (provenance)
| family | period | rows | checksum |
|---|---|---|---|
${accepted}

## Held families (quarantined, zero metrics)
${held}

## Metric values
${metrics}

## Notes
${e.notes.map((n) => `- ${n}`).join('\n')}
`
}

/** Guard: assert an external card carries no internal vocabulary. Returns offending words. */
export function externalForbiddenHits(card: ExternalCard): string[] {
  const hay = JSON.stringify(card).toLowerCase()
  return FORBIDDEN_EXTERNAL.filter((w) => hay.includes(w))
}

const DEALER_NAMES: Record<string, string> = {
  'serra-honda': 'Serra Honda',
  'serra-nissan': 'Serra Nissan',
  'tony-serra-ford': 'Tony Serra Ford',
}

/** Build the card for a profile from ACCEPTED readers + freshness (real presentation path). */
export function resolveSalesGrowthCard(
  profile: string,
  now: Date,
): { external: ExternalCard | null; internal: InternalEvidence } {
  const dealerName = DEALER_NAMES[profile] ?? profile
  const readers: Readers = {
    dp: readDealershipPerformance(profile),
    appt: readAppointments(profile),
    gross: readCrmSalesGross(profile),
  }
  return buildSalesGrowthCard(profile, dealerName, readers, resolveReportFreshness(profile, now))
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const CARD_CSS = `
  :root{--ink:#0f172a;--muted:#5b6b7f;--line:#e6ebf1;--brand:#0b5cab;--brand2:#0a7d55;--bg:#f6f8fb;--card:#fff}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{max-width:820px;margin:0 auto;padding:32px 28px}
  header.masthead{border-bottom:3px solid var(--brand);padding-bottom:16px;margin-bottom:22px}
  .eyebrow{letter-spacing:.14em;text-transform:uppercase;font-size:11px;color:var(--brand);font-weight:700;margin:0 0 6px}
  h1{font-size:26px;line-height:1.2;margin:0 0 8px;font-weight:800}
  .data-through{display:inline-block;background:#eef4fb;color:var(--brand);font-weight:600;font-size:13px;padding:5px 12px;border-radius:999px;margin:0}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  section.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 20px;box-shadow:0 1px 2px rgba(16,24,40,.04);break-inside:avoid}
  section.card h2{font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:0 0 12px;font-weight:700}
  section.card.feature{grid-column:1 / -1;background:linear-gradient(180deg,#fff, #fbfdff)}
  ul{margin:0;padding:0;list-style:none}
  li{position:relative;padding:7px 0 7px 22px;border-bottom:1px solid #f1f4f8;font-size:14.5px}
  li:last-child{border-bottom:0}
  li::before{content:"";position:absolute;left:2px;top:14px;width:8px;height:8px;border-radius:50%;background:var(--brand2)}
  section.card.feature li::before{background:var(--brand)}
  footer{margin-top:26px;padding-top:14px;border-top:1px solid var(--line);color:var(--muted);font-size:12px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}
  @media (max-width:640px){.grid{grid-template-columns:1fr}}
  @media print{body{background:#fff}.page{max-width:100%;padding:0}section.card{box-shadow:none}}
`

/** Render the EXTERNAL customer-facing document — polished, print-friendly layout. */
export function renderExternalCardHtml(card: ExternalCard): string {
  const sections = card.sections
    .map((s, i) => {
      const feature = i === 0 ? ' feature' : ''
      return `      <section class="card${feature}">
        <h2>${esc(s.heading)}</h2>
        <ul>${s.items.map((it) => `\n          <li>${esc(it)}</li>`).join('')}
        </ul>
      </section>`
    })
    .join('\n')
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(card.title)}</title>
  <style>${CARD_CSS}</style>
</head>
<body>
  <div class="page">
    <header class="masthead">
      <p class="eyebrow">Weekly Sales Performance &amp; Growth</p>
      <h1>${esc(card.title)}</h1>
      <p class="data-through">${esc(card.dataThrough)}</p>
    </header>
    <div class="grid">
${sections}
    </div>
    <footer>
      <span>${esc(card.dataThrough)}</span>
      <span>Prepared for dealership leadership</span>
    </footer>
  </div>
</body>
</html>`
}
