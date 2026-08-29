/**
 * M2B report-card HTML renderer (print-ready, self-contained).
 *
 * Deterministic HTML from an M2BReportModel. PDF-QA rules: ASCII hyphens only,
 * readable font sizes (>= 10px), fixed-layout tables that wrap (no clip/overlap),
 * no exotic glyphs, rows never break across pages, and missing/withheld are shown
 * as words - NEVER as a zero. Page numbers + running header/footer are added by the
 * PDF step (chromium displayHeaderFooter); an on-page footer note is included too.
 */
import type { LedgerRow, M2BReportModel } from './report-model'

/**
 * Normalize common non-ASCII typography to ASCII (PDF-QA: ASCII hyphens, no exotic
 * glyphs that could render as boxes). Applied to ALL dynamic text via esc().
 */
function ascii(s: string): string {
  return s
    .replace(/[‐‑‒–—―]/g, '-') // hyphens / en / em dashes
    .replace(/→/g, '->').replace(/←/g, '<-')
    .replace(/≥/g, '>=').replace(/≤/g, '<=')
    .replace(/×/g, 'x')
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/…/g, '...')
    .replace(/•/g, '*')
    .replace(/ /g, ' ')
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, '') // drop any remaining non-ASCII (no box glyphs)
}

function esc(s: unknown): string {
  return ascii(String(s ?? ''))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Value cell: supported -> display; missing -> words; withheld -> words. Never 0. */
function valueCell(r: LedgerRow): string {
  if (r.state === 'supported' && r.display) return `<span class="v">${esc(r.display)}</span>`
  if (r.state === 'withheld') return `<span class="withheld">Withheld - ${esc(r.reason ?? 'no governed source')}</span>`
  if (r.state === 'missing') return `<span class="missing">No current value (${esc(r.reason ?? 'source absent this period')})</span>`
  return `<span class="missing">Not supported</span>`
}

const stateBadge = (s: LedgerRow['state']): string => `<span class="badge b-${s}">${s}</span>`

function money(v: number | null | undefined): string {
  if (v == null) return 'n/a'
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const numf = (v: number | null | undefined): string => (v == null ? 'n/a' : v.toLocaleString('en-US'))
const round3 = (n: number): string => (Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000))

/** Industry comparison cell - directional NON-SCORING with source, or explicit no-benchmark. */
function industryCell(r: LedgerRow): string {
  const ind = r.industry
  if (ind.state === 'directional_non_scoring') {
    return `<span class="withheld">Directional, NON-SCORING</span>: ${esc(ind.range)}.
      Denominator ${esc(ind.definition_compatibility)} (${esc(ind.note)}).
      Source: ${esc(ind.source_type)}, confidence ${esc(ind.confidence)}; published ${esc(ind.source_published_or_updated)}, verified ${esc(ind.verified_on)}.
      <span class="url">${esc(ind.source_url)}</span>`
  }
  return `No definition-compatible benchmark${ind.note ? ` (${esc(ind.note)})` : ''}.`
}

/** Dealer baseline cell - honest history state (never a score). */
function baselineCell(r: LedgerRow): string {
  const b = r.baseline
  if (b.state === 'insufficient_history') {
    return `Insufficient history: ${r.periods_on_file} of ${b.needed} governed periods on file.`
  }
  if (b.state === 'zero_variance') {
    return `Zero variance across ${b.periods_available} periods (non-scoring).`
  }
  return `Historical band: ${b.periods_available} periods, mean ${round3(b.mean)}, sd ${round3(b.stddev)} (non-scoring).`
}

/** Human coverage label (Ford has no accepted weekly source; JSON keeps the nulls). */
function coverageLabel(start: string | null, end: string | null): string {
  if (!end) return 'No accepted weekly source (coverage unavailable)'
  return `${start ?? 'n/a'} to ${end}`
}

const CSS = `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, "DejaVu Sans", sans-serif; color: #1f2937; font-size: 12px; line-height: 1.45; }
  h1 { font-size: 20px; margin: 0 0 2px; }
  h2 { font-size: 14px; margin: 18px 0 6px; padding-bottom: 3px; border-bottom: 2px solid #2f3b4d; color: #2f3b4d; }
  h3 { font-size: 12px; margin: 10px 0 4px; color: #374151; }
  p { margin: 4px 0; }
  .wrap { padding: 0 4px; }
  .head { background: #2f3b4d; color: #fff; padding: 14px 16px; border-radius: 6px; }
  .head .sub { color: #cbd5e1; font-size: 11px; margin-top: 3px; }
  .badge { display: inline-block; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 9px; text-transform: uppercase; }
  .b-supported { background: #dcfce7; color: #166534; }
  .b-missing { background: #f1f5f9; color: #475569; }
  .b-withheld { background: #fef3c7; color: #92400e; }
  .b-unsupported { background: #e5e7eb; color: #374151; }
  .fresh { background:#dcfce7;color:#166534; } .aging { background:#fef3c7;color:#92400e; } .stale { background:#fee2e2;color:#991b1b; } .unknown{background:#e5e7eb;color:#374151;}
  .pill { display:inline-block; font-size:10px; font-weight:700; padding:1px 7px; border-radius:9px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 4px 0 8px; }
  th, td { border: 1px solid #e2e8f0; padding: 5px 7px; text-align: left; vertical-align: top; word-wrap: break-word; overflow-wrap: anywhere; font-size: 11px; }
  th { background: #f8fafc; color: #334155; font-size: 10px; text-transform: uppercase; letter-spacing: .03em; }
  tr { break-inside: avoid; }
  tbody tr:nth-child(even) { background: #fbfcfe; }
  .v { font-weight: 700; font-variant-numeric: tabular-nums; }
  .withheld { color: #92400e; } .missing { color: #64748b; }
  .cards { }
  .stat { display: inline-block; width: 24%; padding: 6px 4px; vertical-align: top; }
  .stat .l { font-size: 9.5px; text-transform: uppercase; color: #64748b; letter-spacing: .04em; }
  .stat .n { font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .grid4 th, .grid4 td { text-align: right; } .grid4 td:first-child, .grid4 th:first-child { text-align: left; }
  .kpis { margin: 6px 0; }
  .kpi { display:inline-block; width: 19%; border:1px solid #e2e8f0; border-radius:6px; padding:8px; margin: 0 .4% 6px 0; vertical-align:top; }
  .kpi .l { font-size: 9.5px; text-transform: uppercase; color:#64748b; }
  .kpi .n { font-size: 16px; font-weight: 700; }
  .opp { border:1px solid #e2e8f0; border-left: 4px solid #2f3b4d; border-radius:6px; padding:8px 10px; margin:6px 0; break-inside: avoid; }
  .opp .t { font-weight: 700; font-size: 12px; }
  .opp .meta { font-size:10px; color:#475569; margin: 2px 0 4px; }
  .opp dl { margin: 2px 0; } .opp dt { font-size:9.5px; text-transform:uppercase; color:#64748b; margin-top:3px; } .opp dd { margin:0 0 2px; font-size:11px; }
  .note { font-size: 10px; color: #64748b; margin-top: 10px; border-top: 1px solid #e2e8f0; padding-top: 6px; }
  code { font-family: "DejaVu Sans Mono", Consolas, monospace; font-size: 10px; }
  .cmp { font-size: 10px; color: #475569; line-height: 1.35; }
  .url { color: #1d4ed8; word-break: break-all; font-size: 9.5px; }
  h2 { break-after: avoid; } h3 { break-after: avoid; }
  ul, ol { margin: 4px 0; padding-left: 18px; } li { margin: 2px 0; }
`

export function renderM2BHtml(m: M2BReportModel): string {
  const f = m.overall_freshness
  const freshPill = `<span class="pill ${f.freshness}">${esc(f.freshness)}${f.age_days != null ? ` - ${f.age_days} day(s) old` : ''}</span>`

  const freshnessRows = m.freshness.length
    ? m.freshness
        .map(
          (r) => `<tr><td>${esc(r.family)}</td><td>${esc(r.period_start ?? 'n/a')} to ${esc(r.period_end ?? 'n/a')}</td>
        <td>${r.age_days ?? 'n/a'}</td><td><span class="pill ${r.freshness}">${esc(r.freshness)}</span></td>
        <td>${numf(r.accepted_rows)}</td><td><code>${esc(r.checksum.slice(0, 12))}</code></td></tr>`,
        )
        .join('')
    : `<tr><td colspan="6" class="missing">No accepted native source for this rooftop this period.</td></tr>`

  const scorecards = m.scorecards
    .map(
      (sc) => `<h3>${esc(sc.category)}</h3>
      <table><colgroup><col style="width:20%"><col style="width:11%"><col style="width:21%"><col style="width:32%"><col style="width:16%"></colgroup>
      <thead><tr><th>Metric</th><th>State</th><th>Current</th><th>Industry (non-scoring)</th><th>Dealer baseline</th></tr></thead><tbody>
      ${sc.rows
        .map(
          (r) => `<tr><td>${esc(r.label)}</td><td>${stateBadge(r.state)}</td><td>${valueCell(r)}</td>
          <td class="cmp">${industryCell(r)}</td><td class="cmp">${baselineCell(r)}</td></tr>`,
        )
        .join('')}
      </tbody></table>`,
    )
    .join('')

  const dp = m.native_performance.dealership_performance
  const dpBlock = dp.available
    ? `<div class="kpis">
        ${[
          ['Leads', numf(dp.summary.leads)],
          ['Appts Set', numf(dp.summary.apptsSet)],
          ['Appts Show', numf(dp.summary.apptsShow)],
          ['Total Visits', numf(dp.summary.totalVisits)],
          ['Sold in Period', numf(dp.summary.soldInPeriod)],
          ['Front Gross', money(dp.summary.frontGross)],
          ['Back Gross', money(dp.summary.backGross)],
          ['Total Gross', money(dp.summary.totalGross)],
          ['Avg Total Gross', money(dp.summary.avgTotalGross)],
        ]
          .map(([l, v]) => `<div class="kpi"><div class="l">${esc(l)}</div><div class="n">${esc(v)}</div></div>`)
          .join('')}
      </div>
      <p class="note">Gross reconciliation: Front ${money(dp.reconciliation.front)} + Back ${money(dp.reconciliation.back)} = ${money(dp.reconciliation.computed_total)} vs reported Total ${money(dp.reconciliation.total)} (delta ${money(dp.reconciliation.delta)}). ${dp.reconciliation.reconciles ? 'Reconciles.' : 'Does NOT reconcile - flagged.'}</p>`
    : `<p class="missing">Dealership Performance: no accepted source this period (${esc(dp.reason)}). Not shown as zero.</p>`

  const ap = m.native_performance.appointments
  const apBlock = ap.available
    ? `<div class="kpis">
        ${[
          ['Total', numf(ap.counts.total)],
          ['Show', numf(ap.counts.show)],
          ['No-Show', numf(ap.counts.noShow)],
          ['Confirmed', numf(ap.counts.confirmed)],
          ['Cancelled', numf(ap.counts.cancelled)],
        ]
          .map(([l, v]) => `<div class="kpi"><div class="l">${esc(l)}</div><div class="n">${esc(v)}</div></div>`)
          .join('')}
      </div>`
    : `<p class="missing">Appointments: no accepted source this period (${esc(ap.reason)}). Not shown as zero.</p>`

  const opps = m.opportunities
    .map(
      (o) => `<div class="opp"><div class="t">#${o.rank}. ${esc(o.title)}</div>
      <div class="meta">Owner: ${esc(o.owner)} | Type: ${esc(o.type)} | Impact ${o.expected_impact}/5 | Confidence ${(o.confidence * 100).toFixed(0)}% | Score ${o.score}</div>
      <dl>
        <dt>Trigger</dt><dd>${esc(o.trigger)}</dd>
        <dt>Action</dt><dd>${esc(o.action)}</dd>
        <dt>Recipient</dt><dd>${esc(o.recipient)}</dd>
        <dt>Prerequisites</dt><dd>${esc(o.prerequisites)}</dd>
        <dt>Safety limits</dt><dd>${esc(o.safety_limits)}</dd>
        <dt>Approval needed</dt><dd>${esc(o.approval_needed)}</dd>
        <dt>Evidence</dt><dd>${o.evidence_refs.length ? o.evidence_refs.map((e) => `<code>${esc(e)}</code>`).join(', ') : 'coverage gap (no metric yet)'}</dd>
      </dl></div>`,
    )
    .join('')

  const ledgerRows = m.ledger
    .map(
      (r) => `<tr><td><code>${esc(r.slug)}</code></td><td>${esc(r.label)}</td><td>${esc(r.category)}</td>
      <td>${stateBadge(r.state)}</td><td>${valueCell(r)}</td></tr>`,
    )
    .join('')

  const sourcesRows = m.evidence_manifest.sources.length
    ? m.evidence_manifest.sources
        .map(
          (s) => `<tr><td>${esc(s.family)}</td><td>${esc(s.period.start ?? 'n/a')} to ${esc(s.period.end ?? 'n/a')}</td>
        <td>${numf(s.accepted_rows)}</td><td>${esc(s.parser_version ?? 'n/a')}</td><td><code>${esc(s.checksum)}</code></td></tr>`,
        )
        .join('')
    : `<tr><td colspan="5" class="missing">No accepted sources.</td></tr>`

  const limitations = m.limitations.map((l) => `<li>${esc(l)}</li>`).join('')

  // AI narrative status + evidence-referenced claims (offline-authored for this test).
  const aiGrounded = m.narrative_mode === 'ai_grounded'
  const offline = m.narrative_provider === 'claude-code-offline'
  const modeLabel = aiGrounded
    ? offline
      ? 'AI-grounded (offline test)'
      : `AI-grounded (${esc(m.narrative_provider)})`
    : 'Deterministic grounded (AI narration unavailable)'
  const claimsList =
    aiGrounded && m.narrative_claims && m.narrative_claims.length
      ? `<div class="note">Evidence-referenced claims (validated against accepted facts):</div>
         <ul>${m.narrative_claims
           .map((c) => `<li>${esc(c.text)} <span class="cmp">[${c.evidence.map((e) => `<code>${esc(e)}</code>`).join(', ')}]</span></li>`)
           .join('')}</ul>`
      : m.narrative_fallback_reason
        ? `<div class="note">AI narration fell back: ${esc(m.narrative_fallback_reason)}.</div>`
        : ''
  const narrativeBlock = `
    <div class="note"><strong>Narrative mode:</strong> ${modeLabel}. <strong>Live automatic narration:</strong> unconfigured in this isolated instance (no live inference provider); this narrative was authored offline and validated by the evidence-constrained checker.</div>
    <p>${esc(m.narrative).replace(/\n/g, '<br>')}</p>
    ${claimsList}`

  // Human-readable references: distinct cited industry sources (auditable in the PDF).
  const seenRef = new Set<string>()
  const refItems: string[] = []
  for (const r of m.ledger) {
    const ind = r.industry
    if (ind.state !== 'directional_non_scoring') continue
    if (seenRef.has(ind.source_url)) continue
    seenRef.add(ind.source_url)
    refItems.push(
      `<li><strong>${esc(r.label)} (and related appointment rates)</strong> - directional, NON-SCORING range ${esc(ind.range)}.
        Denominator ${esc(ind.definition_compatibility)}: ${esc(ind.note)}.
        Source type: ${esc(ind.source_type)}; confidence ${esc(ind.confidence)}; published/updated ${esc(ind.source_published_or_updated)}; verified by Huminic ${esc(ind.verified_on)}.
        URL: <span class="url">${esc(ind.source_url)}</span></li>`,
    )
  }
  const referencesBlock = refItems.length
    ? `<ul>${refItems.join('')}</ul>`
    : `<p class="missing">No definition-compatible external benchmark exists for any supported metric; all industry context is non-scoring.</p>`

  // Title omits the period segment when there is no accepted end (no trailing hyphen).
  const docTitle = m.coverage_period.end
    ? `Halo Data Report Card - ${m.dealer_name} - ${m.coverage_period.end}`
    : `Halo Data Report Card - ${m.dealer_name}`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${esc(docTitle)}</title>
<style>${CSS}</style></head>
<body><div class="wrap">
  <div class="head">
    <h1>Halo Data Report Card</h1>
    <div class="sub">${esc(m.dealer_name)} (Sales only) | Dealer ID ${esc(m.dealer_id)} | Coverage ${esc(coverageLabel(m.coverage_period.start, m.coverage_period.end))} | ${freshPill}</div>
    <div class="sub">Generated ${esc(m.generated_at_iso)} | TEST report (not a customer deliverable) | Narrative: ${modeLabel}</div>
  </div>

  <h2>Executive summary</h2>
  <div class="kpis">
    <div class="kpi"><div class="l">Catalog measures</div><div class="n">${m.coverage_counts.total}</div></div>
    <div class="kpi"><div class="l">Supported (current)</div><div class="n">${m.coverage_counts.supported}</div></div>
    <div class="kpi"><div class="l">No current value</div><div class="n">${m.coverage_counts.missing}</div></div>
    <div class="kpi"><div class="l">Withheld</div><div class="n">${m.coverage_counts.withheld}</div></div>
    <div class="kpi"><div class="l">Unsupported</div><div class="n">${m.coverage_counts.unsupported}</div></div>
  </div>
  ${narrativeBlock}

  <h2>Freshness and accepted sources</h2>
  <table><colgroup><col style="width:26%"><col style="width:26%"><col style="width:10%"><col style="width:14%"><col style="width:12%"><col style="width:12%"></colgroup>
  <thead><tr><th>Family</th><th>Coverage period</th><th>Age (d)</th><th>Freshness</th><th>Rows</th><th>Checksum</th></tr></thead>
  <tbody>${freshnessRows}</tbody></table>

  <h2>Category scorecards</h2>
  ${scorecards}

  <h2>Native performance detail</h2>
  <h3>Dealership Performance (weekly)</h3>
  ${dpBlock}
  <h3>Appointments</h3>
  ${apBlock}

  <h2>Ranked opportunities</h2>
  ${opps}

  <h2>Coverage ledger (all ${m.coverage_counts.total} catalog measures)</h2>
  <table><colgroup><col style="width:20%"><col style="width:24%"><col style="width:14%"><col style="width:12%"><col style="width:30%"></colgroup>
  <thead><tr><th>Slug</th><th>Metric</th><th>Category</th><th>State</th><th>Result / reason</th></tr></thead>
  <tbody>${ledgerRows}</tbody></table>

  <h2>Evidence manifest</h2>
  <p>Withheld families: ${m.evidence_manifest.withheld_families.length ? m.evidence_manifest.withheld_families.map((w) => esc(w)).join(', ') : 'none'}.</p>
  <table><colgroup><col style="width:20%"><col style="width:22%"><col style="width:10%"><col style="width:14%"><col style="width:34%"></colgroup>
  <thead><tr><th>Family</th><th>Period</th><th>Rows</th><th>Parser</th><th>Checksum (SHA-256)</th></tr></thead>
  <tbody>${sourcesRows}</tbody></table>

  <h2>References (industry context - non-scoring)</h2>
  ${referencesBlock}

  <h2>Limitations</h2>
  <ul>${limitations}</ul>

  <p class="note">Huminic Halo - isolated dev TEST report for ${esc(m.dealer_name)}. Missing and withheld measures are shown explicitly and are never counted as zero. Sales-only; no Service or Parts data is included. ROI, CAGE, and Communication metrics are withheld because their VinSolutions scheduled reports positively select Service/Parts Lead-Intents and are quarantined by the Sales-only contract.</p>
</div></body></html>`
}
