#!/usr/bin/env node
/**
 * Gate R1 — DETERMINISTIC generator for the Semantic Watchdog 295×3 inventory / coverage ledger
 * and the cluster graph. DEV/ISOLATED, Sales-only, read-only over committed artifacts.
 *
 * Inputs (committed, hashed):
 *   docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json   (immutable 295 conditions)
 *   docs/halo/contract/semantic-watchdog-classification-summary.json   (historical 7-class counts)
 *   docs/halo/contract/service-domain-overlay.json                     (Sales routing overlay)
 *   docs/halo/evidence/m1r/e2e/real-data-e2e-receipt.json              (committed strict receipt)
 *
 * Outputs:
 *   docs/halo/contract/sw295-inventory.json   (885 rows = 295 conditions × 3 Serra Sales dealers)
 *   docs/halo/contract/sw295-clusters.json    (cluster graph + cross-cluster rules + compat controls)
 *
 * HARD RULES: exact catalog conditions preserved verbatim (immutable_source_condition). ONLY SW-032 and
 * SW-041 are runnable from accepted current data (Appointments strict) — every other row carries a
 * non-runnable state WITH a reason (never missing⇒0). ROI/CAGE/Comm stay quarantined/provisional and
 * NEVER power an accepted Sales alert/score. Service-domain IDs and unresolved (SW-082/SW-218) are out
 * of Sales. No Message Content is read; no external/production/Service access.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const ROOT = process.cwd()
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'))
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, p))).digest('hex')

const CATALOG = 'docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json'
const SUMMARY = 'docs/halo/contract/semantic-watchdog-classification-summary.json'
const OVERLAY = 'docs/halo/contract/service-domain-overlay.json'
const RECEIPT = 'docs/halo/evidence/m1r/e2e/real-data-e2e-receipt.json'

const catalog = rd(CATALOG)
const overlay = rd(OVERLAY)
const receipt = rd(RECEIPT)

const DEALERS = [
  { profile: 'serra-honda', dealer_id: '21043' },
  { profile: 'serra-nissan', dealer_id: '21044' },
  { profile: 'tony-serra-ford', dealer_id: '21047' },
]

const SERVICE_IDS = new Set(overlay.service_domain.ids)
const UNRESOLVED_IDS = new Set(overlay.unresolved_withheld_from_sales.ids) // SW-082, SW-218
const FALSE_POS = new Set(overlay.false_positive_exclusions.ids) // SW-176, SW-274 (stay Sales-eligible)

// Quarantined source families (Gate-3 hidden Lead Intent) — can only ever be provisional/directional.
const QUARANTINED_SRC = /lead source roi|enterprise|cage|communication/i
// Strict-accepted source families (promotable) — Dashboard / Appointments / CRM Sales Gross.
const STRICT_SRC = /dashboard|appointment|sales gross|crm gross/i
const NLP = /sentiment|keyword|message content|tone|phrase|transcript|\bnlp\b|wording|script adherence|complaint|apolog|frustrat|profan/i
const HISTORY = /trailing|week-over-week|wow|month-over-month|trend|\b\d+-week\b|consecutive|streak|vs prior|prior week|rolling|over time|declining|increasing|baseline period|historical/i

// Section → consultant cluster (Service is NOT a Sales cluster).
const SECTION_CLUSTER = [
  [/lead intake|source quality|marketing|attribution/i, 'lead_source_health'],
  [/speed-to-lead|first response|rep activity|communication behavior|bdc|call center|sentiment|content|red flags in sales-to-customer/i, 'responsiveness_comms_behavior'],
  [/appointment & showroom|showroom metrics/i, 'appointments_showroom'],
  [/pipeline health|funnel/i, 'funnel_sold'],
  [/deal & desking|desking signals/i, 'gross_economics'],
  [/team \/ managerial|managerial dynamics/i, 'rep_manager_execution'],
  [/data integrity|crm hygiene|compliance & risk/i, 'crm_hygiene_compliance'],
  [/opportunity mining|suggested semantic watchdog add-ons|inventory & vehicle-of-interest|voi/i, 'opportunity_reactivation'],
  [/cross-functional|second-order|anomaly|statistical triggers/i, 'cross_cluster_diagnoses'],
  [/service-to-sales|equity mining/i, 'external_presence_dependencies'],
]
function clusterFor(e) {
  if (SERVICE_IDS.has(e.metric_id)) return 'service_domain_out_of_sales'
  for (const [re, c] of SECTION_CLUSTER) if (re.test(e.section || '')) return c
  return 'external_presence_dependencies'
}

// The 8-way current Sales disposition (Sales overlay), preserving historical acquisition_class.
function dispositionFor(e) {
  if (SERVICE_IDS.has(e.metric_id)) return 'service_domain_out_of_sales'
  // NOTE: SW-082/SW-218 (unresolved) remain in their historical 'Outside governed boundary' class per the
  // overlay 8-class (counted within the 27), and carry a separate unresolved flag + reason on each row.
  const c = e.acquisition_class
  if (c === 'Vin-native scheduled') return 'direct'
  if (c === 'Scheduled source plus downstream calculation/NLP') return 'scheduled_plus_calc_or_nlp'
  if (c === 'Separate external source required') return 'external'
  if (c === 'Native manual export') return 'manual_export'
  if (c === 'Unavailable or retention-limited') return 'unavailable'
  if (c === 'Manual CRM inspection') return 'manual_crm_inspection'
  if (c === 'Outside governed boundary') return 'outside_boundary'
  return 'outside_boundary'
}

// Per-dealer runnable evaluation. ONLY SW-032 / SW-041 are runnable-accepted from the strict receipt.
function apptCell(profile) {
  return receipt.cells.find((x) => x.family === 'appointments' && x.profile === profile)
}
function evaluateRunnable(id, profile) {
  const cell = apptCell(profile)
  const m = cell.metrics_emitted
  const total = m['appt.total']
  if (id === 'SW-032') {
    const num = m['appt.show']
    const value = total > 0 ? num / total : null
    return {
      runnable: true, numerator: num, denominator: total, denominator_field: 'appt.total (all appointment rows)',
      numerator_field: 'appt.show (Is Show = Yes)', value, value_pct: value == null ? null : Math.round(value * 1000) / 10,
      threshold: '< 0.55', fires: value != null && value < 0.55,
      lineage: { source_family: 'appointments (strict-accepted)', source_sha256: cell.source.sha256, period: `${cell.hold.period.start}..${cell.hold.period.end}`, receipt_cell: `${profile}/appointments`, receipt: RECEIPT },
    }
  }
  if (id === 'SW-041') {
    const num = m['appt.no_show']
    const value = total > 0 ? num / total : null
    return {
      runnable: true, numerator: num, denominator: total, denominator_field: 'appt.total (all appointment rows)',
      numerator_field: 'appt.no_show (Is No Show = Yes)', value, value_pct: value == null ? null : Math.round(value * 1000) / 10,
      threshold: '> 0.45', fires: value != null && value > 0.45,
      lineage: { source_family: 'appointments (strict-accepted)', source_sha256: cell.source.sha256, period: `${cell.hold.period.start}..${cell.hold.period.end}`, receipt_cell: `${profile}/appointments`, receipt: RECEIPT },
    }
  }
  return null
}

// Non-runnable state + exact reason for everything that is NOT SW-032/SW-041.
function nonRunnableState(e, disp) {
  const src = e.source || ''
  const t = `${e.condition} ${e.rule_or_method} ${e.period_grain_population}`
  if (disp === 'service_domain_out_of_sales') return ['outside_boundary_service', 'Service-domain condition routed ONLY to the separate Serra Service workspace; unavailable to Sales (permanent Sales-only boundary).']
  if (UNRESOLVED_IDS.has(e.metric_id)) return ['withheld_unresolved', 'Warranty-expiration (VSC/CPO) — ambiguous Sales-vs-Service dependency; withheld from Sales supported/available sets until a source contract proves no Service dependency.']
  if (disp === 'outside_boundary') return ['withheld_outside_boundary', 'Historical Outside-governed-boundary condition; no authorized governed Sales source.']
  if (disp === 'external') return ['blocked_external_source', `Requires a separate external source not governed here (${src}); no accepted feed.`]
  if (disp === 'manual_export') return ['blocked_manual_export', `Requires a native manual export not captured in the governed pipeline (${src}).`]
  if (disp === 'manual_crm_inspection') return ['blocked_manual_crm', 'Requires manual CRM inspection; not a governed automated feed.']
  if (disp === 'unavailable') return ['unavailable_retention_limited', 'Unavailable or retention-limited under HUM-VIN-005; no governed data.']
  // scheduled_plus_calc_or_nlp OR direct (but not SW-032/041)
  if (NLP.test(t)) return ['blocked_nlp_pii', 'Requires Message Content / NLP which is never read (PII boundary); Sales Communication content is out of bounds.']
  if (HISTORY.test(t)) return ['blocked_insufficient_history', 'Needs ≥2–4 governed periods (WoW/trailing/trend); only one governed period (2026-08-24..30) accepted — insufficient history.']
  if (QUARANTINED_SRC.test(src)) return ['provisional_quarantined_not_accepted', 'Source family (ROI/CAGE/Sales-Communication) is QUARANTINED under Gate-3 hidden Lead Intent; may exist as a directional provisional primitive but CANNOT power an accepted Sales alert/score/narrative.']
  if (STRICT_SRC.test(src)) return ['withheld_primitive_not_exact_condition', 'A useful primitive may be derivable from an accepted strict family, but this exact supplied SW condition is NOT among the accepted runnable conditions (only SW-032/SW-041 are). Restating it as accepted is not authorized.']
  return ['withheld_no_accepted_source', 'No accepted governed Sales source maps to this exact condition.']
}

// Owner + inert notification candidate (advisory; NOTHING is activated in R1).
function ownerFor(cluster) {
  if (cluster === 'gross_economics' || cluster === 'funnel_sold' || cluster === 'lead_source_health') return 'Sales Manager'
  if (cluster === 'rep_manager_execution' || cluster === 'crm_hygiene_compliance') return 'GM'
  if (cluster === 'responsiveness_comms_behavior' || cluster === 'appointments_showroom') return 'Salesperson'
  return 'Sales Manager'
}
const PRIORITY_LENS = [
  [/duplicate|source quality|attribution|spend|cost|roi/i, 'expense_reduction'],
  [/gross|desking|deal|margin|price/i, 'gross_lift'],
  [/lead|funnel|sold|close|conversion|appointment|show/i, 'sales_lift'],
  [/rep activity|script|template|coaching|behavior|managerial|training/i, 'training'],
  [/handoff|process|hygiene|integrity|compliance|response|speed/i, 'handoff_process'],
  [/sentiment|complaint|friction|reactivat|opportunity|retention/i, 'prospect_customer_friction'],
]
function prioritiesFor(e) {
  const t = `${e.section} ${e.condition}`.toLowerCase()
  const out = []
  for (const [re, lens] of PRIORITY_LENS) if (re.test(t)) out.push(lens)
  return out.length ? [...new Set(out)] : ['sales_lift']
}

// ── build 885 rows ────────────────────────────────────────────────────────────
const rows = []
for (const e of catalog) {
  const disp = dispositionFor(e)
  const cluster = clusterFor(e)
  const priorities = prioritiesFor(e)
  const owner = ownerFor(cluster)
  const isService = disp === 'service_domain_out_of_sales'
  for (const d of DEALERS) {
    const runnable = evaluateRunnable(e.metric_id, d.profile)
    let state, reason, confidence, evidence, lineage, structured_threshold, unit, expected_period, freshness_policy
    if (runnable) {
      state = 'supported_strict_runnable'
      reason = null
      confidence = 'high'
      evidence = { value: runnable.value, value_pct: runnable.value_pct, numerator: runnable.numerator, denominator: runnable.denominator, numerator_field: runnable.numerator_field, denominator_field: runnable.denominator_field, fires: runnable.fires, real_from_18wb: true }
      lineage = runnable.lineage
      structured_threshold = runnable.threshold // proven structured threshold (SW-032/041 only)
      unit = 'ratio_0_1' // proven unit for the accepted appointment-rate conditions
      expected_period = '2026-08-24/2026-08-30'
      freshness_policy = 'weekly_native: period-end age ≤ 8 calendar days; scheduler capture ≤ 72h; missing/stale never zero'
    } else {
      const [st, rs] = nonRunnableState(e, disp)
      state = st
      reason = rs
      confidence = st.startsWith('provisional') ? 'directional' : 'none'
      evidence = { value: null, value_pct: null, real_from_18wb: false } // missing is NEVER zero
      lineage = { source_family: e.source, source_sha256: null, period: null, receipt_cell: null, receipt: null }
      structured_threshold = null // NOT proved for non-runnable rows (only threshold_provenance prose is verbatim)
      unit = null // NOT inferred — explicit unit only where proved (substring inference removed)
      expected_period = null // NOT proved for non-runnable rows
      freshness_policy = null // NOT proved for non-runnable rows
    }
    rows.push({
      metric_id: e.metric_id,
      dealer: d.profile,
      dealer_id: d.dealer_id,
      section: e.section, // verbatim
      cluster,
      // ── verbatim catalog field copies (field-copy fidelity; validated against the source matrix) ──
      immutable_source_condition: e.condition,
      exact_rule_or_method: e.rule_or_method,
      source_fields_verbatim: e.fields_and_keys,
      source_verbatim: e.source,
      threshold_provenance: e.threshold_provenance,
      cadence: e.cadence,
      grain: e.period_grain_population,
      population: e.period_grain_population,
      historical_acquisition_class: e.acquisition_class,
      // ── derived routing / evaluation ──
      disposition: disp,
      unresolved_withheld_from_sales: UNRESOLVED_IDS.has(e.metric_id),
      false_positive_service_exclusion: FALSE_POS.has(e.metric_id),
      unit,
      structured_threshold,
      expected_period,
      freshness_policy,
      state,
      reason,
      blocker_note: runnable ? null : 'primary (first-match) blocker; additional prerequisites may also apply',
      confidence,
      lineage,
      evidence,
      // ── Service rows carry NO Sales owner/action/priority/notification (route to Serra Service only) ──
      owner: isService ? null : owner,
      action: isService
        ? 'Route ONLY to the combined Serra Service workspace; NO Sales owner/action (permanent Sales-only boundary).'
        : (runnable ? 'Review appointment show/no-show workflow; coaching + reminder cadence' : 'No accepted Sales action — carried as an explicit coverage gap with reason'),
      inert_notification_candidate: (!isService && runnable) ? { audience: owner, trigger: `${e.metric_id} ${runnable.threshold}`, status: 'INERT — candidate only; not activated, scheduled, or sent' } : null,
      prerequisites: runnable ? [] : (isService ? ['Service-domain: out of Sales; route to Serra Service workspace'] : [reason]),
      followup_measure: runnable ? (e.metric_id === 'SW-032' ? 'appointment show rate next period' : 'appointment no-show rate next period') : (isService ? null : 'n/a until source/period/authorization prerequisite is met'),
      priorities: isService ? [] : priorities,
      cross_cluster_participation: [], // filled from the cluster graph rule membership (below)
    })
  }
}

// ── cluster graph + cross-cluster rules + compatibility controls ───────────────
const CLUSTERS = [
  { id: 'lead_source_health', name: 'Lead & Source Health', sales: true },
  { id: 'responsiveness_comms_behavior', name: 'Responsiveness & Communication Behavior', sales: true },
  { id: 'appointments_showroom', name: 'Appointments & Showroom', sales: true },
  { id: 'funnel_sold', name: 'Funnel & Sold', sales: true },
  { id: 'gross_economics', name: 'Gross & Economics', sales: true },
  { id: 'rep_manager_execution', name: 'Rep & Manager Execution', sales: true },
  { id: 'crm_hygiene_compliance', name: 'CRM Hygiene & Compliance', sales: true },
  { id: 'opportunity_reactivation', name: 'Opportunity & Reactivation Semantics', sales: true },
  { id: 'cross_cluster_diagnoses', name: 'Cross-Cluster Diagnoses', sales: true },
  { id: 'external_presence_dependencies', name: 'External / Presence Dependencies', sales: true },
  { id: 'service_domain_out_of_sales', name: 'Service Domain (OUT OF SALES)', sales: false },
]
const COMPAT_CONTROLS = {
  same_dealer: 'Both operands must be the SAME dealer/rooftop.',
  accepted_source_only: 'A composite may combine ONLY accepted (non-quarantined) sources; a quarantined ROI/CAGE/Comm operand makes the composite provisional/blocked, never accepted.',
  compatible_population_period_grain_unit_denominator: 'Operands must share compatible population, period, grain, unit, and denominator; mismatched denominators/periods block the composite.',
  insufficient_history_blocks_trends: 'Any trend/WoW/trailing operand is blocked until ≥2–4 governed periods accrue.',
  unstable_ids_block_ordered_causal_comm: 'Sales-Communication lacks stable thread IDs; ordered/causal comm claims are blocked.',
  source_disagreement_blocks_composites: 'If two sources disagree for the same measure (e.g. Ford CRM gross 7 rows vs Dashboard 6 sold), the composite is blocked and both values are shown unreconciled.',
  never_zero: 'Missing / stale / quarantined / zero-denominator is NEVER treated as zero.',
}
const CROSS_RULES = [
  { id: 'XR-01', name: 'Intake-to-response leak', clusters: ['lead_source_health', 'responsiveness_comms_behavior', 'funnel_sold'], hypothesis: 'High lead volume + slow/absent first response + low appointment-set ⇒ intake→response process leak.', status: 'blocked_pending_accepted_sources', blocking_controls: ['accepted_source_only', 'insufficient_history_blocks_trends'] },
  { id: 'XR-02', name: 'Throughput vs pricing', clusters: ['gross_economics', 'funnel_sold'], hypothesis: 'High gross/deal + low sold-volume ⇒ desking/throughput tradeoff.', status: 'partially_observable', blocking_controls: ['accepted_source_only'] },
  { id: 'XR-03', name: 'Template relevance', clusters: ['responsiveness_comms_behavior', 'appointments_showroom'], hypothesis: 'High outbound + low inbound + low appointment ⇒ messaging relevance problem.', status: 'blocked_quarantined_and_nlp', blocking_controls: ['accepted_source_only', 'unstable_ids_block_ordered_causal_comm'] },
  { id: 'XR-04', name: 'Appointment execution', clusters: ['appointments_showroom', 'funnel_sold'], hypothesis: 'Low show rate + high no-show ⇒ appointment execution gap (SW-032/SW-041 accepted).', status: 'runnable', blocking_controls: [], accepted_metrics: ['SW-032', 'SW-041'] },
  { id: 'XR-05', name: 'Source-hygiene expense waste', clusters: ['lead_source_health', 'gross_economics'], hypothesis: 'High duplicate-lead rate + unknown spend ⇒ source-hygiene + expense-reduction flag.', status: 'blocked_external_and_quarantined', blocking_controls: ['accepted_source_only', 'source_disagreement_blocks_composites'] },
]
// mark participation on rows
const ruleByCluster = {}
for (const r of CROSS_RULES) for (const c of r.clusters) (ruleByCluster[c] ??= []).push(r.id)
for (const row of rows) row.cross_cluster_participation = [...new Set(ruleByCluster[row.cluster] || [])]

// ── disposition tally reconciliation (must match overlay 8-class) ──────────────
const perMetricDisp = {}
for (const e of catalog) { const d = dispositionFor(e); perMetricDisp[d] = (perMetricDisp[d] || 0) + 1 }

// Deterministic artifact: NO wall-clock timestamp (reproducible byte-for-byte from the pinned inputs).
const inventory = {
  artifact: 'sw295-inventory',
  version: '1.0.0',
  generated_by: 'scripts/m2r-sw295/build-sw295-inventory.mjs',
  reproducible: 'deterministic — same pinned inputs (source_hashes) produce byte-identical output; no generated_at',
  scope: 'M2R Gate R1. Machine-readable Semantic Watchdog 295×3 (Serra Sales) coverage ledger. DEV/ISOLATED, Sales-only. Exact catalog conditions preserved verbatim. ONLY SW-032/SW-041 are accepted-runnable (Appointments strict); every other row is a non-runnable state WITH a reason (missing never zero). ROI/CAGE/Comm quarantined/provisional — never accepted Sales alerts/scores/narrative.',
  source_hashes: {
    catalog_295: sha(CATALOG),
    classification_summary: sha(SUMMARY),
    service_domain_overlay: sha(OVERLAY),
    e2e_receipt: sha(RECEIPT),
  },
  expected_source_hashes: {
    catalog_295: overlay.source_matrix_sha256,
    classification_summary: overlay.classification_summary_sha256,
  },
  dealers: DEALERS,
  counts: {
    conditions: catalog.length,
    dealers: DEALERS.length,
    rows: rows.length,
    runnable_rows: rows.filter((r) => r.state === 'supported_strict_runnable').length,
    firings: rows.filter((r) => r.evidence && r.evidence.fires === true).length,
  },
  disposition_tally: perMetricDisp,
  overlay_expected_tally: overlay.current_overlay_eight_class_counts,
  service_domain_ids: overlay.service_domain.ids,
  unresolved_withheld_ids: overlay.unresolved_withheld_from_sales.ids,
  false_positive_exclusions: overlay.false_positive_exclusions.ids,
  rows,
}
const clusters = {
  artifact: 'sw295-clusters',
  version: '1.0.0',
  generated_by: 'scripts/m2r-sw295/build-sw295-inventory.mjs',
  clusters: CLUSTERS,
  design: {
    mile_wide_inch_deep: 'All 295 conditions accounted per dealer at shallow depth (state + reason), so nothing is silently dropped.',
    mile_deep_inch_wide: 'The few accepted-runnable conditions (SW-032/SW-041) are computed to full lineage/numerator/denominator depth.',
    consultant_synthesis: 'Cross-cluster rules join clusters into automotive-sales-consultant diagnoses, gated by compatibility controls; not a per-metric dashboard narration.',
  },
  compatibility_controls: COMPAT_CONTROLS,
  cross_cluster_rules: CROSS_RULES,
  service_note: 'Service is NOT a Sales cluster; service_domain_out_of_sales routes ONLY to the separate Serra Service workspace.',
}

fs.mkdirSync(path.join(ROOT, 'docs/halo/contract'), { recursive: true })
fs.writeFileSync(path.join(ROOT, 'docs/halo/contract/sw295-inventory.json'), JSON.stringify(inventory, null, 2) + '\n')
fs.writeFileSync(path.join(ROOT, 'docs/halo/contract/sw295-clusters.json'), JSON.stringify(clusters, null, 2) + '\n')

console.log('sw295-inventory.json: rows=' + rows.length + ' runnable=' + inventory.counts.runnable_rows + ' firings=' + inventory.counts.firings)
console.log('disposition tally:', JSON.stringify(perMetricDisp))
console.log('overlay expected  :', JSON.stringify(overlay.current_overlay_eight_class_counts))
