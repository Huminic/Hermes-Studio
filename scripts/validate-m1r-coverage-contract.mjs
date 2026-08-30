#!/usr/bin/env node
/**
 * validate-m1r-coverage-contract.mjs — M1R Gate 2 coverage-contract validator.
 *
 * READ-ONLY. Writes no files, caches, or generated output.
 *   node scripts/validate-m1r-coverage-contract.mjs            # validate committed contract files
 *   node scripts/validate-m1r-coverage-contract.mjs --self-test # in-memory mutation-rejection proof
 *
 * Hard-codes the ratified per-family policy, the exact 18-cell state map (state +
 * evidence SHA/period), per-profile Service exclusion, and the machine-readable
 * Response Times browser contract. Exits nonzero on any discrepancy.
 *
 * Pure check functions are exported for the self-test and external reuse. Each
 * returns an array of error strings (empty === ok).
 */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CONTRACT = join(ROOT, 'docs/halo/contract')
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')
const clone = (o) => JSON.parse(JSON.stringify(o))
const setEq = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|')

// ── Ratified constants ──────────────────────────────────────────────────────
export const EXPECT_SHA = {
  matrix: '29c7ac06130f9b4fe8d5df0a2d0d6fffed7c6ff4dc02eca96e0f44d109a04fc1',
  summary: 'e41f5a28021f19a7f9146622c7afaeefcfc546941ce4aed196ccf0e406fee3aa',
}
const WEEKLY_FRESH = 'weekly_native: period == most-recently completed Mon-Sun week at evaluation; period-end age <= 8 calendar days; scheduler receipt/capture <= 72h after period end (all three mandatory)'
const DAILY_FRESH = 'daily_comm: period == immediately preceding completed local calendar day; exact one-day window; scheduler receipt/capture <= 36h after period end; evaluation age <= 2 calendar days; No gap may be relabeled current.'
const DAILY_FIRST_CLASS_CLAUSE = 'No gap may be relabeled current.'

export const EXPECTED_FAMILY_POLICY = {
  appointments: { cadence: 'weekly', expected_period_policy: 'most-recently completed Mon-Sun week', freshness_policy: WEEKLY_FRESH, provenance_envelope: 'gmail_scheduler requires sender+subject+gmail_message_id; period_hint range required', native_format: 'XLSX Sheet1, no Filters', sales_proof: "Appt Reason == 'Sales Appointment' on every row; Appointment Type scanned for Service/Parts", dealer_proof_template: 'every Dealer ID == {DEALER_ID}; unique Appointment ID; Start Date + Start DateTime within period_hint', transformation_boundary: 'classify-only; original bytes preserved immutably (xlsx-classified)', reader_status: 'readAppointments (hs-watchdog, wired) + isolated appointmentMetrics', metric_calculation_coverage: 'appt.show_rate, appt.no_show_rate, appt.confirmed_rate, appt.cancel_rate (isolated adds appt.reschedule_rate)' },
  dealership_performance: { cadence: 'weekly', expected_period_policy: 'most-recently completed Mon-Sun week', freshness_policy: WEEKLY_FRESH, provenance_envelope: 'gmail_scheduler requires sender+subject+gmail_message_id; period from Filters range', native_format: 'XLSX multi-section (Dealership Summary + Lead Type & Inventory Type Summary) + Filters sheet', sales_proof: 'Filters Lead Type == {Internet,Phone,Walk-in}; no positive Service/Parts', dealer_proof_template: 'Filters exactly one Dealers value matching {DEALER_NAME} {DEALER_ID}', transformation_boundary: 'classify-only; every non-blank row preserved generically; bytes immutable', reader_status: 'readDealershipPerformance (hs-watchdog, wired) + isolated dashboardMetrics', metric_calculation_coverage: 'gross.total_sum (from TOTAL summary.totalGross); native dp summary. roi.* NOT derived here (Dashboard vs Lead Source ROI definition divergence)' },
  lead_source_roi: { cadence: 'weekly', expected_period_policy: 'most-recently completed Mon-Sun week', freshness_policy: WEEKLY_FRESH, provenance_envelope: 'gmail_scheduler requires sender+subject+gmail_message_id; period from Filters range', native_format: 'XLSX data sheet + Filters sheet; ROI/CAGE CSV quarantine-only', sales_proof: 'Filters Base Report Name == Lead Source ROI; Lead Type == governed eight; Lead Intent must NOT positively select Service/Parts; Lead Source scanned for service/parts', dealer_proof_template: 'Filters exactly one Dealers value (no Dealer column in rows) matching {DEALER_ID}', transformation_boundary: 'classify-only; native spaced headers; ROI/CAGE CSV quarantine-only (cannot be promoted)', reader_status: 'isolated roiMetrics only; NOT wired in hs-watchdog Halo path (MISSING reader)', metric_calculation_coverage: 'roi.total_leads, roi.sold_from_leads, roi.duplicate_rate (isolated adds roi.actual_roi) — WITHHELD' },
  cage_kpi: { cadence: 'weekly', expected_period_policy: 'most-recently completed Mon-Sun week', freshness_policy: WEEKLY_FRESH, provenance_envelope: 'gmail_scheduler requires sender+subject+gmail_message_id; period from Filters range', native_format: 'XLSX data sheet + Filters sheet; ROI/CAGE CSV quarantine-only', sales_proof: 'Filters Base Report Name == Enterprise Performance; Lead Type == {Internet,Phone,Walk-in}; no positive Service/Parts', dealer_proof_template: 'every non-total row Dealer == {DEALER_NAME} {DEALER_ID}; narrow last-row TOTAL exemption', transformation_boundary: 'classify-only; ROI/CAGE CSV quarantine-only (cannot be promoted)', reader_status: 'isolated cageMetrics only; NOT wired in hs-watchdog Halo path (MISSING reader)', metric_calculation_coverage: 'cage.total_comms, cage.deals_from_leads, cage.rep_count — WITHHELD' },
  sales_comm_log: { cadence: 'daily', expected_period_policy: 'immediately preceding completed local calendar day (exact one-day window)', freshness_policy: DAILY_FRESH, provenance_envelope: 'gmail_scheduler requires sender+subject+gmail_message_id; period_hint single day', native_format: 'XLSX single daily data sheet (Filters optional)', sales_proof: 'Lead Type, Lead Status Type, Lead Source scanned for Service/Parts; contaminated saved Filters quarantines', dealer_proof_template: 'Dealer matches {DEALER_NAME} {DEALER_ID}; single-tenant', transformation_boundary: 'classify-only; Message Content hashed never stored; bytes immutable', reader_status: 'isolated commMetrics only; NOT wired in hs-watchdog Halo path (MISSING reader)', metric_calculation_coverage: 'comm.escalation_keyword_screen, comm.template_overuse, comm.inbound_high_intent_keywords, comm.multi_rep_within_24h (isolated adds comm.outbound_link_only) — WITHHELD. Stable-ID gap blocks ordered-thread/causal metrics only, not every safe provisional single-row metric' },
  crm_sales_gross: { cadence: 'weekly', expected_period_policy: 'most-recently completed Mon-Sun week (coverage window via period_hint)', freshness_policy: WEEKLY_FRESH, provenance_envelope: 'gmail_scheduler requires sender+subject+gmail_message_id; coverage period_hint range required', native_format: 'XLSX Sheet1, no Filters', sales_proof: 'per-deal rows; every Dealer matches target (no Service/Parts commingling)', dealer_proof_template: 'every Dealer ID populated == {DEALER_ID}; rows spanning dealers quarantine', transformation_boundary: 'classify-only; bytes immutable', reader_status: 'isolated grossMetrics only (computes gross.total_sum + gross.reconciliation_mismatches from per-deal rows); hs-watchdog derives ONLY gross.total_sum from Dashboard TOTAL (split gross); per-deal reconciliation reader MISSING', metric_calculation_coverage: 'gross.total_sum + gross.reconciliation_mismatches (per-deal) — WITHHELD. Split gross reconciliation requires CRM Sales Gross, not Dashboard alone' },
}
const P = { HONDA: 'serra-honda', NISSAN: 'serra-nissan', FORD: 'tony-serra-ford' }
const WK = '2026-08-17/2026-08-23'
const HONDA_COMM = '2026-08-22..2026-08-24 held dailies; 2026-08-25..2026-08-28 quarantined'
const NF_COMM = '2026-08-23..2026-08-24 held dailies; 2026-08-25..2026-08-28 quarantined'
export const EXPECTED_STATE_MAP = {
  [`${P.HONDA}|appointments`]: { state: 'accepted', sha: 'b189a92034930603c28439eeac159c6f3f41410d143d21cc037f92534407f5e5', period: WK },
  [`${P.HONDA}|dealership_performance`]: { state: 'accepted', sha: '39560ef12549554cb27f8883451ab5326b196ae66bd554b285014f94b18257ee', period: WK },
  [`${P.HONDA}|lead_source_roi`]: { state: 'present-invalid', sha: '2ed4cb6859b12de097d15c12c39b667ca2055db0460c3fc5dbc532e375ee5b92', period: WK },
  [`${P.HONDA}|cage_kpi`]: { state: 'absent', sha: 'absent', period: 'absent' },
  [`${P.HONDA}|sales_comm_log`]: { state: 'present-invalid', sha: '47725f13d5d59a0de73d76765b3b9fe674c0ef397bf5e21aa1635d2757bef9be', period: HONDA_COMM },
  [`${P.HONDA}|crm_sales_gross`]: { state: 'absent', sha: 'absent', period: 'absent' },
  [`${P.NISSAN}|appointments`]: { state: 'absent', sha: 'absent', period: 'absent' },
  [`${P.NISSAN}|dealership_performance`]: { state: 'accepted', sha: '6123ef875ffa84825c930eca2a028f1f4717bd32fb21063d4e4acaf192ef7dff', period: WK },
  [`${P.NISSAN}|lead_source_roi`]: { state: 'present-invalid', sha: '50ad05028e0705696c1f565afd956b9007c75e510f1163ae3da702d881e31779', period: WK },
  [`${P.NISSAN}|cage_kpi`]: { state: 'present-invalid', sha: '59b012f07429d3975b5abe3d45c57e74593d076be33c0f4759cb3d0e45fa7f6d', period: WK },
  [`${P.NISSAN}|sales_comm_log`]: { state: 'present-invalid', sha: '6b4434aeb35cd6f7c32a717ea4ea54bfadec25accab0e7350361359edcfb8e60', period: NF_COMM },
  [`${P.NISSAN}|crm_sales_gross`]: { state: 'absent', sha: 'absent', period: 'absent' },
  [`${P.FORD}|appointments`]: { state: 'absent', sha: 'absent', period: 'absent' },
  [`${P.FORD}|dealership_performance`]: { state: 'absent', sha: 'absent', period: 'absent' },
  [`${P.FORD}|lead_source_roi`]: { state: 'present-invalid', sha: '22694a140af39977aa0002045a6196b3b136c71441ce990385414310dcaf0890', period: WK },
  [`${P.FORD}|cage_kpi`]: { state: 'present-invalid', sha: 'f344bb684019a7fe1e714908b35608ab2c5bf0a85642cede98a0e54a7ac74c05', period: WK },
  [`${P.FORD}|sales_comm_log`]: { state: 'present-invalid', sha: 'c74137363ff9e3e5b78fb633b1dd2f3ea28ca48372074928e08f51136fa6f3b9', period: NF_COMM },
  [`${P.FORD}|crm_sales_gross`]: { state: 'absent', sha: 'absent', period: 'absent' },
}
export const GOLDEN_STATE = {
  accepted: 'current real governed file present; positive real-file golden to be pinned at reader-integration gate',
  'present-invalid': 'current-invalid real file usable as NEGATIVE golden only; positive real-file golden required later',
  absent: 'no real file; explicit missing evidence recorded now; positive real-file golden required later',
}
export const SERVICE_IDS = ['SW-079','SW-081','SW-083','SW-115','SW-118','SW-199','SW-222','SW-223','SW-224','SW-225','SW-226','SW-227','SW-228','SW-229','SW-263','SW-270','SW-279','SW-294']
export const UNRESOLVED_IDS = ['SW-082','SW-218']
const ORIGINS = {
  'Scheduled source plus downstream calculation/NLP': ['SW-083','SW-118','SW-223','SW-224','SW-225','SW-226','SW-263','SW-270'],
  'Separate external source required': ['SW-079','SW-115'],
  'Outside governed boundary': ['SW-081','SW-199','SW-222','SW-227','SW-228','SW-229','SW-279','SW-294'],
}
const HIST7 = { 'Vin-native scheduled': 20, 'Scheduled source plus downstream calculation/NLP': 162, 'Separate external source required': 56, 'Native manual export': 7, 'Unavailable or retention-limited': 8, 'Manual CRM inspection': 7, 'Outside governed boundary': 35 }
const EIGHT = { 'Vin-native scheduled': 20, 'Scheduled source plus downstream calculation/NLP': 154, 'Separate external source required': 54, 'Native manual export': 7, 'Unavailable or retention-limited': 8, 'Manual CRM inspection': 7, 'Outside governed boundary (other)': 27, 'Service-domain separate/out-of-Sales': 18 }
const RT = { cadence: 'weekly', expected_period_policy: 'most-recently completed Mon-Sun week', host: 'vinsolutions.app.coxautoinc.com', required_provenance_fields: ['capture_id','source_url','captured_at','declared_report_kind','profile','dealer','period','raw_sha256'], raw_preservation: 'raw CSV preserved unchanged beside derivative', derivative_lineage: 'declared', conversion: 'excel-day*1440 -> minutes', period_age_max_days: 8, capture_max_hours: 48, separate_from_native_families: true, is_native_family_slug: false }
const PROFILES = { 'serra-honda': '21043', 'serra-nissan': '21044', 'tony-serra-ford': '21047' }
const FAMILIES = ['lead_source_roi','cage_kpi','sales_comm_log','crm_sales_gross','appointments','dealership_performance']
const CELL_FIELDS = ['profile','dealer_id','family','current_presence','evidence_sha256','evidence_period','evidence_rows','analytical_ledger_state','current_contract_state','golden_state','blocker','owner','next_action']
const REQ_TESTS = ['family_validator_positive','reader_calculation_unit','missing_is_not_zero','service_parts_negative','wrong_dealer_negative','wrong_period_negative','schema_negative','provenance_negative','real_file_golden_per_store_family']

// ── Pure check functions (each returns string[] of errors) ──────────────────
export function checkFamilyPolicies(cov) {
  const e = []; const fp = cov?.family_policies || {}
  for (const fam of FAMILIES) {
    const exp = EXPECTED_FAMILY_POLICY[fam], got = fp[fam]
    if (!got) { e.push(`family_policies missing ${fam}`); continue }
    for (const k of Object.keys(exp)) if (got[k] !== exp[k]) e.push(`family_policies.${fam}.${k} mismatch`)
  }
  return e
}
export function checkFreshnessPolicies(cov) {
  const e = []
  if (cov?.weekly_freshness_policy !== WEEKLY_FRESH) e.push('weekly_freshness_policy mismatch')
  if (cov?.daily_freshness_policy !== DAILY_FRESH) e.push('daily_freshness_policy mismatch')
  if (!String(cov?.daily_freshness_policy || '').includes(DAILY_FIRST_CLASS_CLAUSE)) e.push(`daily_freshness_policy missing first-class clause '${DAILY_FIRST_CLASS_CLAUSE}'`)
  if (!String(cov?.family_policies?.sales_comm_log?.freshness_policy || '').includes(DAILY_FIRST_CLASS_CLAUSE)) e.push(`sales_comm_log.freshness_policy missing first-class clause '${DAILY_FIRST_CLASS_CLAUSE}'`)
  return e
}
export function checkStateMap(cov) {
  const e = []; const cells = cov?.cells || []
  if (cells.length !== 18) e.push(`cells ${cells.length} != 18`)
  const seen = new Set(); const counts = { accepted: 0, 'present-invalid': 0, absent: 0 }
  for (const c of cells) {
    const key = `${c.profile}|${c.family}`
    if (!(key in EXPECTED_STATE_MAP)) { e.push(`unexpected cell ${key}`); continue }
    if (seen.has(key)) e.push(`duplicate cell ${key}`); seen.add(key)
    if (PROFILES[c.profile] !== c.dealer_id) e.push(`cell ${key} dealer_id mismatch`)
    for (const f of CELL_FIELDS) if (c[f] === undefined || c[f] === null || String(c[f]).trim() === '') e.push(`cell ${key} empty field ${f}`)
    const exp = EXPECTED_STATE_MAP[key]
    if (c.current_contract_state !== exp.state) e.push(`cell ${key} state '${c.current_contract_state}' != '${exp.state}'`)
    if (c.evidence_sha256 !== exp.sha) e.push(`cell ${key} evidence_sha256 mismatch`)
    if (c.evidence_period !== exp.period) e.push(`cell ${key} evidence_period mismatch`)
    const expLedger = exp.state === 'accepted' ? 'accepted' : 'not-accepted'
    if (c.analytical_ledger_state !== expLedger) e.push(`cell ${key} analytical_ledger_state '${c.analytical_ledger_state}' != '${expLedger}'`)
    if (c.current_contract_state in counts) counts[c.current_contract_state]++
  }
  for (const k of Object.keys(EXPECTED_STATE_MAP)) if (!seen.has(k)) e.push(`missing cell ${k}`)
  const cc = cov?.current_state_counts || {}
  if (counts.accepted !== 3 || cc.accepted !== 3) e.push(`accepted count != 3 (derived ${counts.accepted}, declared ${cc.accepted})`)
  if (counts['present-invalid'] !== 8 || cc['present-invalid'] !== 8) e.push(`present-invalid count != 8 (derived ${counts['present-invalid']}, declared ${cc['present-invalid']})`)
  if (counts.absent !== 7 || cc.absent !== 7) e.push(`absent count != 7 (derived ${counts.absent}, declared ${cc.absent})`)
  return e
}
export function checkGoldenRules(cov) {
  const e = []
  for (const c of cov?.cells || []) {
    const key = `${c.profile}|${c.family}`
    if (c.readiness !== false) e.push(`cell ${key} readiness must be false`)
    const expGolden = GOLDEN_STATE[c.current_contract_state]
    if (!expGolden) e.push(`cell ${key} unknown state for golden`)
    else if (c.golden_state !== expGolden) e.push(`cell ${key} golden_state does not match ${c.current_contract_state} rule`)
    if (/synthetic/i.test(String(c.golden_state))) e.push(`cell ${key} golden_state must not accept synthetic`)
    for (const t of REQ_TESTS) if (c.required_tests?.[t] !== 'required') e.push(`cell ${key} test flag ${t} != required`)
  }
  return e
}
export function checkServiceExclusion(cov) {
  const e = []; const sx = cov?.service_exclusion_by_profile || {}
  for (const p of Object.keys(PROFILES)) {
    const row = sx[p]
    if (!row) { e.push(`service_exclusion_by_profile missing ${p}`); continue }
    if (!setEq(row.unavailable_service_ids, SERVICE_IDS)) e.push(`profile ${p} unavailable_service_ids != 18 ratified`)
    if (!setEq(row.unresolved_withheld_ids, UNRESOLVED_IDS)) e.push(`profile ${p} unresolved_withheld_ids != [SW-082,SW-218]`)
  }
  // no Service or unresolved id may appear as available in any cell
  for (const c of cov?.cells || []) {
    const blob = JSON.stringify({ f: c.family, m: c.metric_calculation_coverage })
    for (const id of [...SERVICE_IDS, ...UNRESOLVED_IDS]) if (blob.includes(id)) e.push(`Service id ${id} present in Sales cell ${c.profile}|${c.family}`)
  }
  return e
}
export function checkResponseTimes(cov) {
  const e = []; const r = cov?.response_times_browser_contract
  if (!r) return ['response_times_browser_contract missing']
  if (r.cadence !== RT.cadence) e.push('RT cadence != weekly')
  if (r.expected_period_policy !== RT.expected_period_policy) e.push(`RT expected_period_policy '${r.expected_period_policy}' != '${RT.expected_period_policy}'`)
  if (r.host !== RT.host) e.push(`RT host '${r.host}' != ${RT.host}`)
  if (!setEq(r.required_provenance_fields, RT.required_provenance_fields)) e.push('RT provenance fields mismatch')
  if (r.raw_preservation !== RT.raw_preservation) e.push('RT raw_preservation mismatch')
  if (r.derivative_lineage !== RT.derivative_lineage) e.push('RT derivative_lineage mismatch')
  if (r.conversion !== RT.conversion) e.push('RT conversion mismatch')
  if (r.period_age_max_days !== RT.period_age_max_days) e.push('RT period_age_max_days != 8')
  if (r.capture_max_hours !== RT.capture_max_hours) e.push('RT capture_max_hours != 48')
  if (r.separate_from_native_families !== true) e.push('RT separate_from_native_families != true')
  if (r.is_native_family_slug !== false) e.push('RT is_native_family_slug != false')
  return e
}
export function checkOverlay(overlay, matrix) {
  const e = []; const byId = new Map((matrix || []).map((r) => [r.metric_id, r]))
  if (!overlay) return ['overlay missing']
  if (overlay.source_matrix_sha256 !== EXPECT_SHA.matrix) e.push('overlay source_matrix_sha256 mismatch')
  const sd = overlay.service_domain || {}
  if (!setEq(sd.ids || [], SERVICE_IDS)) e.push('overlay service ids != ratified 18')
  if (sd.count !== 18) e.push('overlay service count != 18')
  for (const [k, list] of Object.entries(ORIGINS)) {
    if (!setEq(sd.historical_origins?.[k] || [], list)) e.push(`overlay origin ids mismatch ${k}`)
    if (sd.historical_origin_counts?.[k] !== list.length) e.push(`overlay origin count mismatch ${k}`)
    for (const id of list) { const row = byId.get(id); if (!row) e.push(`overlay id ${id} absent from matrix`); else if (row.acquisition_class !== k) e.push(`overlay id ${id} class '${row.acquisition_class}' != '${k}'`) }
  }
  if (!setEq(overlay.false_positive_exclusions?.ids || [], ['SW-176','SW-274'])) e.push('overlay exclusions != [SW-176,SW-274]')
  if (!setEq(overlay.unresolved_withheld_from_sales?.ids || [], UNRESOLVED_IDS)) e.push('overlay unresolved != [SW-082,SW-218]')
  for (const [k, v] of Object.entries(EIGHT)) if (overlay.current_overlay_eight_class_counts?.[k] !== v) e.push(`overlay 8-class ${k} mismatch`)
  if (Object.values(overlay.current_overlay_eight_class_counts || {}).reduce((a, b) => a + b, 0) !== 295) e.push('overlay 8-class total != 295')
  for (const [k, v] of Object.entries(HIST7)) if (overlay.historical_seven_class_counts?.[k] !== v) e.push(`overlay historical ${k} mismatch`)
  return e
}
export function checkSourcesAndMatrix(matrixBuf, summaryBuf, matrix, summary) {
  const e = []
  if (sha256(matrixBuf) !== EXPECT_SHA.matrix) e.push('matrix SHA mismatch')
  if (sha256(summaryBuf) !== EXPECT_SHA.summary) e.push('summary SHA mismatch')
  if (!Array.isArray(matrix) || matrix.length !== 295) e.push('matrix length != 295')
  else {
    const ids = matrix.map((r) => r.metric_id)
    if (new Set(ids).size !== 295) e.push('matrix ids not unique')
    for (const id of ids) if (!/^SW-\d{3}$/.test(id)) e.push(`bad id ${id}`)
    const nums = ids.map((i) => Number(i.slice(3))).sort((a, b) => a - b)
    for (let i = 0; i < 295; i++) if (nums[i] !== i + 1) { e.push(`ids not sequential at ${i + 1}`); break }
    const derived = {}
    for (const r of matrix) derived[r.acquisition_class] = (derived[r.acquisition_class] || 0) + 1
    for (const [k, v] of Object.entries(HIST7)) if (derived[k] !== v) e.push(`matrix-derived class ${k} != ${v}`)
  }
  for (const [k, v] of Object.entries(HIST7)) if (summary?.counts?.[k] !== v) e.push(`summary count ${k} != ${v}`)
  if (summary?.total_conditions !== 295) e.push('summary total != 295')
  return e
}

// ── File-mode driver ─────────────────────────────────────────────────────────
function runFileValidation() {
  const errors = []
  const matrixBuf = readFileSync(join(CONTRACT, 'semantic-watchdog-feasibility-matrix-295.json'))
  const summaryBuf = readFileSync(join(CONTRACT, 'semantic-watchdog-classification-summary.json'))
  const matrix = JSON.parse(matrixBuf.toString('utf8'))
  const summary = JSON.parse(summaryBuf.toString('utf8'))
  const overlay = JSON.parse(readFileSync(join(CONTRACT, 'service-domain-overlay.json'), 'utf8'))
  const cov = JSON.parse(readFileSync(join(CONTRACT, 'coverage-matrix-18cell.json'), 'utf8'))
  if (!setEq(cov.families || [], FAMILIES)) errors.push('families != 6 native set')
  if ((cov.families || []).includes('response_times')) errors.push('response_times must not be a native family')
  errors.push(...checkSourcesAndMatrix(matrixBuf, summaryBuf, matrix, summary))
  errors.push(...checkOverlay(overlay, matrix))
  errors.push(...checkFamilyPolicies(cov))
  errors.push(...checkFreshnessPolicies(cov))
  errors.push(...checkStateMap(cov))
  errors.push(...checkGoldenRules(cov))
  errors.push(...checkServiceExclusion(cov))
  errors.push(...checkResponseTimes(cov))
  // supplementary (not sole) markdown presence
  try {
    const md = readFileSync(join(ROOT, 'docs/halo/M1R_DATA_COVERAGE_CONTRACT.md'), 'utf8')
    if (!md.includes('separate labeled browser evidence, not a native-family slug')) errors.push('contract md missing RT separation marker')
  } catch (e) { errors.push(`cannot read contract md: ${e.message}`) }
  return errors
}

// ── Self-test: prove rejection of representative bad mutations ───────────────
function runSelfTest() {
  const cov = JSON.parse(readFileSync(join(CONTRACT, 'coverage-matrix-18cell.json'), 'utf8'))
  const overlay = JSON.parse(readFileSync(join(CONTRACT, 'service-domain-overlay.json'), 'utf8'))
  const matrix = JSON.parse(readFileSync(join(CONTRACT, 'semantic-watchdog-feasibility-matrix-295.json'), 'utf8'))
  const cases = []
  const add = (name, fn, mut) => { const c = clone(cov); mut(c); cases.push({ name, errs: fn(c) }) }
  // 1. wrong family cadence
  add('wrong family cadence', checkFamilyPolicies, (c) => { c.family_policies.appointments.cadence = 'daily' })
  // 2. swapped cell states (accepted <-> absent)
  add('swapped cell states', checkStateMap, (c) => {
    const a = c.cells.find((x) => x.profile === 'serra-honda' && x.family === 'appointments')
    const b = c.cells.find((x) => x.profile === 'serra-honda' && x.family === 'cage_kpi')
    const t = a.current_contract_state; a.current_contract_state = b.current_contract_state; b.current_contract_state = t
  })
  // 3. missing Service exclusion
  add('missing Service exclusion', checkServiceExclusion, (c) => { c.service_exclusion_by_profile['serra-honda'].unavailable_service_ids = c.service_exclusion_by_profile['serra-honda'].unavailable_service_ids.filter((x) => x !== 'SW-083') })
  // 4. wrong RT host
  add('wrong RT host', checkResponseTimes, (c) => { c.response_times_browser_contract.host = 'evil.example.com' })
  // 4b. wrong RT expected-period rule
  add('wrong RT expected-period', checkResponseTimes, (c) => { c.response_times_browser_contract.expected_period_policy = 'yesterday' })
  // 4c. daily first-class clause weakened (family policy)
  add('daily clause weakened (family)', checkFamilyPolicies, (c) => { c.family_policies.sales_comm_log.freshness_policy = c.family_policies.sales_comm_log.freshness_policy.replace('; No gap may be relabeled current.', '') })
  // 4d. daily first-class clause weakened (top-level)
  add('daily clause weakened (top-level)', checkFreshnessPolicies, (c) => { c.daily_freshness_policy = c.daily_freshness_policy.replace('; No gap may be relabeled current.', '') })
  // 5. invalid golden state (accepted cell gets present-invalid golden)
  add('invalid golden state', checkGoldenRules, (c) => { const a = c.cells.find((x) => x.profile === 'serra-honda' && x.family === 'appointments'); a.golden_state = GOLDEN_STATE['present-invalid'] })
  // 6. readiness = true
  add('readiness=true', checkGoldenRules, (c) => { c.cells[0].readiness = true })
  // 7. overlay id class tamper (bonus)
  { const o = clone(overlay); o.service_domain.historical_origins['Separate external source required'] = ['SW-079','SW-999']; cases.push({ name: 'overlay bad origin id', errs: checkOverlay(o, matrix) }) }

  let ok = true
  for (const c of cases) {
    const rejected = c.errs.length > 0
    console.log(`  [${rejected ? 'REJECTED' : 'NOT-REJECTED'}] ${c.name}${rejected ? '' : '  <-- SELF-TEST FAILURE'}`)
    if (!rejected) ok = false
  }
  // control: unmutated must pass all object checks
  const clean = [...checkFamilyPolicies(cov), ...checkFreshnessPolicies(cov), ...checkStateMap(cov), ...checkGoldenRules(cov), ...checkServiceExclusion(cov), ...checkResponseTimes(cov), ...checkOverlay(overlay, matrix)]
  if (clean.length) { ok = false; console.log(`  [CONTROL-FAIL] unmutated contract produced errors: ${clean.join('; ')}`) }
  else console.log('  [CONTROL-OK] unmutated contract passes all object checks')
  return ok
}

// ── Entry ────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  if (process.argv.includes('--self-test')) {
    console.log('M1R COVERAGE CONTRACT — SELF-TEST (mutation rejection)')
    const ok = runSelfTest()
    if (!ok) { console.error('SELF-TEST: FAIL'); process.exit(1) }
    console.log('SELF-TEST: PASS (all bad mutations rejected; control clean)')
    process.exit(0)
  }
  const errors = runFileValidation()
  if (errors.length) {
    console.error(`M1R COVERAGE CONTRACT: FAIL (${errors.length})`)
    for (const e of errors) console.error(`  - ${e}`)
    process.exit(1)
  }
  console.log('M1R COVERAGE CONTRACT: PASS')
  console.log('  sources SHA-verified; 295 unique sequential IDs; 7-class = summary = matrix-derived')
  console.log('  overlay 18 (origins 8/2/8, per-id class verified); 8-class sum 295; exclusions/unresolved verified')
  console.log('  family policies exact (6); 18-cell state map exact; current-state 3/8/7; readiness=false all')
  console.log('  golden-state rules per state; Service exclusion exact for 3 profiles; RT browser contract exact')
  process.exit(0)
}
