#!/usr/bin/env node
/**
 * Gate R1 validator for the Semantic Watchdog 295×3 inventory + cluster graph.
 * Pure checks over committed JSON artifacts (no I/O beyond reads). Exits non-zero on any failure;
 * also exported as validateSw295() for the vitest gate.
 *
 * Enforces: catalog hash + sequential unique SW-001..SW-295; historical 7-class == summary; Sales
 * overlay 8-class == inventory disposition tally; exact 18 Service IDs (out of Sales, zero in a Sales
 * cluster); SW-082/SW-218 unresolved+withheld; 885 dealer rows; a reason on every non-runnable state;
 * ONLY SW-032/SW-041 accepted-runnable with exact traced values; no accepted/strict state from a
 * quarantined family; missing never zero.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const ROOT = process.cwd()
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'))
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, p))).digest('hex')

export function validateSw295() {
  const F = []
  const ok = (cond, msg) => { if (!cond) F.push(msg) }

  const catalog = rd('docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json')
  const summary = rd('docs/halo/contract/semantic-watchdog-classification-summary.json')
  const overlay = rd('docs/halo/contract/service-domain-overlay.json')
  const inv = rd('docs/halo/contract/sw295-inventory.json')
  const clusters = rd('docs/halo/contract/sw295-clusters.json')

  // 1. catalog immutability + sequential unique IDs
  ok(sha('docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json') === overlay.source_matrix_sha256, 'catalog sha256 != overlay expected (catalog mutated)')
  ok(catalog.length === 295, `catalog length ${catalog.length} != 295`)
  const ids = catalog.map((e) => e.metric_id)
  ok(new Set(ids).size === 295, 'catalog IDs not unique')
  for (let i = 1; i <= 295; i++) ok(ids[i - 1] === `SW-${String(i).padStart(3, '0')}`, `catalog ID at ${i} != SW-${String(i).padStart(3, '0')}`)

  // 2. hashes pinned in the inventory match live
  ok(inv.source_hashes.catalog_295 === overlay.source_matrix_sha256, 'inventory pinned catalog hash mismatch')
  ok(inv.source_hashes.classification_summary === overlay.classification_summary_sha256, 'inventory pinned summary hash mismatch')

  // 3. taxonomies
  const hist = summary.counts
  ok(JSON.stringify(hist) === JSON.stringify(overlay.historical_seven_class_counts), 'historical 7-class != overlay historical counts')
  const disp = inv.disposition_tally
  const ov = overlay.current_overlay_eight_class_counts
  ok(disp.direct === ov['Vin-native scheduled'], 'direct != overlay Vin-native')
  ok(disp.scheduled_plus_calc_or_nlp === ov['Scheduled source plus downstream calculation/NLP'], 'scheduled != overlay')
  ok(disp.external === ov['Separate external source required'], 'external != overlay')
  ok(disp.manual_export === ov['Native manual export'], 'manual_export != overlay')
  ok(disp.unavailable === ov['Unavailable or retention-limited'], 'unavailable != overlay')
  ok(disp.manual_crm_inspection === ov['Manual CRM inspection'], 'manual_crm != overlay')
  ok(disp.outside_boundary === ov['Outside governed boundary (other)'], 'outside_boundary != overlay')
  ok(disp.service_domain_out_of_sales === ov['Service-domain separate/out-of-Sales'], 'service != overlay')
  const dispTotal = Object.values(disp).reduce((a, b) => a + b, 0)
  ok(dispTotal === 295, `disposition tally total ${dispTotal} != 295`)

  // 4. service IDs — exactly the 18; out of Sales; zero in a Sales cluster
  const svc = new Set(overlay.service_domain.ids)
  ok(svc.size === 18, 'service overlay != 18 ids')
  const salesClusters = new Set(clusters.clusters.filter((c) => c.sales).map((c) => c.id))
  for (const r of inv.rows) {
    if (svc.has(r.metric_id)) {
      ok(r.disposition === 'service_domain_out_of_sales', `${r.metric_id} service but disposition ${r.disposition}`)
      ok(!salesClusters.has(r.cluster), `${r.metric_id} service leaked into Sales cluster ${r.cluster}`)
    } else {
      ok(r.cluster !== 'service_domain_out_of_sales', `${r.metric_id} non-service in service cluster`)
    }
  }

  // 5. unresolved SW-082 / SW-218
  for (const id of overlay.unresolved_withheld_from_sales.ids) {
    const rr = inv.rows.filter((r) => r.metric_id === id)
    ok(rr.length === 3, `${id} not present for 3 dealers`)
    for (const r of rr) { ok(r.unresolved_withheld_from_sales === true, `${id} missing unresolved flag`); ok(r.state === 'withheld_unresolved', `${id} state ${r.state} != withheld_unresolved`) }
  }

  // 6. 885 rows; every condition × 3 dealers
  ok(inv.rows.length === 885, `rows ${inv.rows.length} != 885`)
  for (const e of catalog) ok(inv.rows.filter((r) => r.metric_id === e.metric_id).length === 3, `${e.metric_id} not exactly 3 dealer rows`)

  // 7. reason on every non-runnable; missing never zero
  for (const r of inv.rows) {
    if (r.state !== 'supported_strict_runnable') {
      ok(!!r.reason, `${r.metric_id}/${r.dealer} non-runnable with no reason`)
      ok(r.evidence.value === null, `${r.metric_id}/${r.dealer} non-runnable but value ${r.evidence.value} (missing must be null, never 0)`)
    }
  }

  // 8. ONLY SW-032/SW-041 accepted-runnable, with exact traced values
  const runnable = inv.rows.filter((r) => r.state === 'supported_strict_runnable')
  ok(runnable.length === 6, `runnable rows ${runnable.length} != 6`)
  ok(new Set(runnable.map((r) => r.metric_id)).size === 2 && runnable.every((r) => r.metric_id === 'SW-032' || r.metric_id === 'SW-041'), 'runnable set != {SW-032, SW-041}')
  const EXPECT = {
    'SW-032': { 'serra-honda': [8, 14, false], 'serra-nissan': [2, 6, true], 'tony-serra-ford': [3, 7, true] },
    'SW-041': { 'serra-honda': [5, 14, false], 'serra-nissan': [3, 6, true], 'tony-serra-ford': [4, 7, true] },
  }
  for (const r of runnable) {
    const [num, den, fires] = EXPECT[r.metric_id][r.dealer]
    ok(r.evidence.numerator === num && r.evidence.denominator === den, `${r.metric_id}/${r.dealer} num/den ${r.evidence.numerator}/${r.evidence.denominator} != ${num}/${den}`)
    ok(r.evidence.fires === fires, `${r.metric_id}/${r.dealer} fires ${r.evidence.fires} != ${fires}`)
    ok(r.evidence.real_from_18wb === true && !!r.lineage.source_sha256 && !!r.lineage.period, `${r.metric_id}/${r.dealer} missing lineage`)
    ok(r.confidence === 'high', `${r.metric_id}/${r.dealer} confidence != high`)
  }
  ok(runnable.filter((r) => r.evidence.fires).length === 4, 'firings != 4')

  // 9. no accepted/strict state from a quarantined family
  const QUAR = /lead source roi|enterprise|cage|communication/i
  for (const r of inv.rows) {
    if (r.state === 'supported_strict_runnable') ok(!QUAR.test(r.lineage.source_family || ''), `${r.metric_id} strict-runnable from quarantined family`)
    if (r.disposition === 'scheduled_plus_calc_or_nlp' && QUAR.test((catalog.find((e) => e.metric_id === r.metric_id).source) || '')) {
      ok(r.state !== 'supported_strict_runnable', `${r.metric_id} quarantined-source but marked accepted`)
    }
  }

  // 11. (C1) Service rows carry NO Sales owner/action/priority/notification; route to Serra Service only
  for (const r of inv.rows) {
    if (r.disposition === 'service_domain_out_of_sales') {
      ok(r.owner === null, `${r.metric_id} service row has a Sales owner`)
      ok(Array.isArray(r.priorities) && r.priorities.length === 0, `${r.metric_id} service row has Sales priorities`)
      ok(r.inert_notification_candidate === null, `${r.metric_id} service row has a Sales notification candidate`)
      ok(/Serra Service/.test(r.action || ''), `${r.metric_id} service row action does not route to Serra Service`)
    }
  }

  // 12. (C3) unit is explicit ONLY where proved: runnable → ratio_0_1; non-runnable → null (no substring inference)
  for (const r of inv.rows) {
    if (r.state === 'supported_strict_runnable') ok(r.unit === 'ratio_0_1', `${r.metric_id}/${r.dealer} runnable unit ${r.unit} != ratio_0_1`)
    else ok(r.unit === null, `${r.metric_id}/${r.dealer} non-runnable unit ${r.unit} != null (unsafe inference)`)
  }
  // specific false-positive unit IDs from the shadow must be null (not ratio_0_1)
  for (const id of ['SW-082', 'SW-218', 'SW-274', 'SW-085', 'SW-231', 'SW-278', 'SW-295']) {
    for (const r of inv.rows.filter((x) => x.metric_id === id)) ok(r.unit === null, `${id} still mis-inferred unit ${r.unit}`)
  }

  // 13. (C4) verbatim catalog field-copy fidelity + non-runnable exactness + determinism
  const byId = Object.fromEntries(catalog.map((e) => [e.metric_id, e]))
  for (const r of inv.rows) {
    const e = byId[r.metric_id]
    ok(r.immutable_source_condition === e.condition, `${r.metric_id} condition not verbatim`)
    ok(r.exact_rule_or_method === e.rule_or_method, `${r.metric_id} rule not verbatim`)
    ok(r.source_fields_verbatim === e.fields_and_keys, `${r.metric_id} fields_and_keys not verbatim`)
    ok(r.source_verbatim === e.source, `${r.metric_id} source not verbatim`)
    ok(r.cadence === e.cadence, `${r.metric_id} cadence not verbatim`)
    ok(r.historical_acquisition_class === e.acquisition_class, `${r.metric_id} acquisition_class not verbatim`)
    if (r.state !== 'supported_strict_runnable') {
      ok(r.structured_threshold === null, `${r.metric_id}/${r.dealer} non-runnable structured_threshold not null`)
      ok(r.expected_period === null && r.freshness_policy === null, `${r.metric_id}/${r.dealer} non-runnable period/freshness not null`)
      ok(r.blocker_note && /primary/.test(r.blocker_note), `${r.metric_id}/${r.dealer} missing primary-blocker note`)
    }
  }
  ok(!('generated_at' in inv) && !('generated_at' in clusters), 'artifact carries a non-deterministic generated_at')

  // 14. receipt + overlay hashes pinned and match live
  ok(inv.source_hashes.e2e_receipt === sha('docs/halo/evidence/m1r/e2e/real-data-e2e-receipt.json'), 'pinned e2e_receipt hash mismatch')
  ok(inv.source_hashes.service_domain_overlay === sha('docs/halo/contract/service-domain-overlay.json'), 'pinned overlay hash mismatch')

  // 10. cluster graph: compatibility controls + cross rules present; XR-04 runnable, others gated
  ok(!!clusters.compatibility_controls && Object.keys(clusters.compatibility_controls).length >= 7, 'compatibility controls incomplete')
  const xr04 = clusters.cross_cluster_rules.find((r) => r.id === 'XR-04')
  ok(xr04 && xr04.status === 'runnable' && xr04.accepted_metrics.join(',') === 'SW-032,SW-041', 'XR-04 not the runnable SW-032/041 rule')
  ok(clusters.cross_cluster_rules.filter((r) => r.status !== 'runnable').length >= 1, 'no gated cross-cluster rules recorded')

  return { ok: F.length === 0, failures: F, summary: { rows: inv.rows.length, runnable: runnable.length, firings: 4, disposition_total: dispTotal } }
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const r = validateSw295()
  if (r.ok) { console.log('SW295 inventory VALID —', JSON.stringify(r.summary)); process.exit(0) }
  console.error('SW295 inventory INVALID:'); for (const f of r.failures) console.error('  ✗ ' + f); process.exit(1)
}
