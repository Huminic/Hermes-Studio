/**
 * Real-data M1R E2E — reusable receipt schema + PURE builders.
 *
 * WHY THIS EXISTS
 *   Duane's corrected work package requires proving the EXACT 18 real VinSolutions
 *   workbooks traverse the closest honest dev pipeline — the governed hold path
 *   (`landDelivery` → held/quarantine → `promoteHeldToAnalytics` → `runVinWatchdog`,
 *   owned by hs-ingest-dev) for the strict Sales-only families, and an explicitly
 *   PROVISIONAL non-promoting preview lane for the three families the governed gate
 *   quarantines (Lead Source ROI, CAGE/Enterprise KPI, Sales Communication) because
 *   the VinSolutions Filters tab positively carries a hidden Lead Intent that includes
 *   Parts/Service and cannot be removed via the UI.
 *
 * WHAT THIS FILE IS
 *   The PURE, side-effect-free half: the 18-cell manifest, the strict/quarantine lane
 *   classification, the machine-readable `E2ECell` receipt schema, and the builders that
 *   fold a strict reader result or a provisional adapter result into a receipt cell.
 *   The side-effectful half (running the real hs-ingest-dev hold/promote functions against
 *   ISOLATED temp roots) lives in scripts/m1r-e2e/run-real-data-e2e.ts and imports these types.
 *
 * HARD INVARIANTS (do not weaken):
 *   - NON-PROMOTING for the three quarantined families: they never write the strict ledger,
 *     never flip readiness, always carry strictState='quarantined'/lane='provisional-preview'.
 *   - Missing is NEVER zero: an absent cell / withheld metric is recorded as null + a reason,
 *     never a fabricated 0.
 *   - The receipt records EXPECTED vs ACTUAL lane/state and whether they agree, so a surprise
 *     at the real governed gate surfaces instead of being papered over.
 */

export type FamilySlug =
  | 'appointments'
  | 'dealership_performance'
  | 'crm_sales_gross'
  | 'lead_source_roi'
  | 'cage_kpi'
  | 'sales_comm_log'

export type Lane = 'strict-governed' | 'provisional-preview'
export type StrictState = 'accepted' | 'quarantined'

/** The three Sales-only families the governed hold path holds + promotes. */
export const STRICT_FAMILIES: ReadonlyArray<FamilySlug> = [
  'appointments',
  'dealership_performance',
  'crm_sales_gross',
]
/** The three families the governed gate quarantines (hidden Lead Intent). */
export const PROVISIONAL_FAMILIES: ReadonlyArray<FamilySlug> = [
  'lead_source_roi',
  'cage_kpi',
  'sales_comm_log',
]

export function laneFor(family: FamilySlug): Lane {
  return STRICT_FAMILIES.includes(family) ? 'strict-governed' : 'provisional-preview'
}
/** The strict CONTRACT expectation for this pass (9 accepted / 9 quarantined). */
export function expectedStateFor(family: FamilySlug): StrictState {
  return STRICT_FAMILIES.includes(family) ? 'accepted' : 'quarantined'
}
export function cadenceFor(family: FamilySlug): 'weekly' | 'daily' {
  return family === 'sales_comm_log' ? 'daily' : 'weekly'
}

export const DEALER_NAMES: Record<string, string> = {
  'serra-honda': 'Serra Honda',
  'serra-nissan': 'Serra Nissan',
  'tony-serra-ford': 'Tony Serra Ford',
}
export const DEALER_IDS: Record<string, string> = {
  'serra-honda': '21043',
  'serra-nissan': '21044',
  'tony-serra-ford': '21047',
}

const normDealer = (s: string) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
/** Tolerant rooftop match: "Serra Honda" ⊆ "Serra Honda 21043". */
export function dealerMatches(expected: string, actual: string): boolean {
  const a = normDealer(actual)
  const b = normDealer(expected)
  return a.length > 0 && b.length > 0 && (a.startsWith(b) || b.startsWith(a))
}

/** Pinned delivery-cycle windows (the current real set is the Aug 24–30 week; the daily
 *  Sales Communication log is the 2026-08-29 day). Kept in lock-step with the committed
 *  provisional adapter (WEEKLY_PERIOD / DAILY_COMM_PERIOD). */
export const WEEKLY_PERIOD = { start: '2026-08-24', end: '2026-08-30' } as const
export const DAILY_COMM_PERIOD = { start: '2026-08-29', end: '2026-08-29' } as const
export function periodHintFor(family: FamilySlug): { start: string; end: string } {
  return family === 'sales_comm_log' ? DAILY_COMM_PERIOD : WEEKLY_PERIOD
}
/**
 * The period_hint STRING for a family. A daily report must be a SINGLE date ("2026-08-29"),
 * never a degenerate range ("2026-08-29/2026-08-29") — the governed daily proof treats the
 * two forms differently. Weekly families are a start/end range.
 */
export function periodHintString(family: FamilySlug): string {
  const p = periodHintFor(family)
  return p.start === p.end ? p.start : `${p.start}/${p.end}`
}

/** Governed report_kind for a family (identical slugs — bound, not assumed). */
export function expectedReportKind(family: FamilySlug): string {
  return family
}

/**
 * REQUIRED, known-complete metric keys per strict family. These files are validated-complete
 * in the authoritative ledger, so a strict technical pass requires EVERY one of these present
 * and non-null (missing is not zero; a null here is a real regression, not an empty period).
 * Keys intentionally excluded are ones a native export does not always carry (e.g. Dashboard
 * front/back split, per-deal reconciliation) and are reported but not required.
 */
export const REQUIRED_STRICT_METRICS: Record<string, string[]> = {
  appointments: ['appt.total', 'appt.show', 'appt.no_show', 'appt.confirmed', 'appt.completed', 'appt.cancelled', 'appt.rescheduled'],
  dealership_performance: ['dp.leads', 'dp.appts_set', 'dp.appts_show', 'dp.total_gross'],
  crm_sales_gross: ['gross.row_count', 'gross.total_sum'],
}

/**
 * EXACT component-reconciliation checks each provisional family must emit — by name. An empty/undefined
 * componentReconciliations set no longer passes for a family that requires checks (the missing name fails);
 * a duplicate or unexpected name also fails. ROI requires none.
 */
export const REQUIRED_COMPONENT_CHECKS: Record<FamilySlug, string[]> = {
  cage_kpi: ['cage.comms_components', 'cage.comms_direction', 'cage.comms_grand_total'],
  sales_comm_log: ['comm.channel_sum'],
  lead_source_roi: [],
  appointments: [],
  dealership_performance: [],
  crm_sales_gross: [],
}

/** One planned cell — the real filename is a stable identifier, not PII. */
export type ManifestCell = {
  profile: string
  family: FamilySlug
  filename: string
}

/**
 * Aggregate-safe expected identity for one source workbook, bound from the committed
 * identity manifest (docs/halo/contract/vin18-source-identity.json). A new hash alone is
 * only lineage; matching filename + SHA-256 + size to the authoritative ledger proves it
 * is the SAME approved workbook.
 */
export type IdentityBinding = {
  expected_sha256: string
  expected_size: number
  sha256_match: boolean
  size_match: boolean
  ledger_status: string
}

/**
 * The 18 real workbooks (6 native families × 3 Serra Sales rooftops). Filenames match the
 * preserved local-only fixture set (.local-fixtures/vin18-20260830); the bytes stay git-ignored.
 */
export const MANIFEST: ReadonlyArray<ManifestCell> = [
  // Tony Serra Ford (21047)
  { profile: 'tony-serra-ford', family: 'appointments', filename: '01_VIN_Tony_Serra_Ford_21047_Appointments_Weekly_Report-1821.xlsx' },
  { profile: 'tony-serra-ford', family: 'crm_sales_gross', filename: '02_VIN_Tony_Serra_Ford_21047_CRM_Sales_Gross_Weekly_Report-8172.xlsx' },
  { profile: 'tony-serra-ford', family: 'sales_comm_log', filename: '03_VIN_Tony_Serra_Ford_21047_Sales_Communication_Log_Daily_Report-3112.xlsx' },
  { profile: 'tony-serra-ford', family: 'cage_kpi', filename: '04_VIN_Tony_Serra_Ford_21047_CAGE_KPI_Weekly_Report-5643.xlsx' },
  { profile: 'tony-serra-ford', family: 'lead_source_roi', filename: '05_VIN_Tony_Serra_Ford_21047_Lead_Source_ROI_Weekly_Report-1999.xlsx' },
  { profile: 'tony-serra-ford', family: 'dealership_performance', filename: '06_VIN_Tony_Serra_Ford_21047_Dealer_Dashboard_Weekly_Report-415.xlsx' },
  // Serra Honda (21043)
  { profile: 'serra-honda', family: 'appointments', filename: '07_VIN_Serra_Honda_21043_Appointments_Weekly_Report-3239.xlsx' },
  { profile: 'serra-honda', family: 'crm_sales_gross', filename: '08_VIN_Serra_Honda_21043_CRM_Sales_Gross_Weekly_Report-729.xlsx' },
  { profile: 'serra-honda', family: 'cage_kpi', filename: '09_VIN_Serra_Honda_21043_CAGE_KPI_Weekly_Report-4371.xlsx' },
  { profile: 'serra-honda', family: 'sales_comm_log', filename: '10_VIN_Serra_Honda_21043_Sales_Communication_Log_Daily_Report-8860.xlsx' },
  { profile: 'serra-honda', family: 'lead_source_roi', filename: '11_VIN_Serra_Honda_21043_Lead_Source_ROI_Weekly_Report-2381.xlsx' },
  { profile: 'serra-honda', family: 'dealership_performance', filename: '12_VIN_Serra_Honda_21043_Dealer_Dashboard_Weekly_Report-6358.xlsx' },
  // Serra Nissan (21044)
  { profile: 'serra-nissan', family: 'appointments', filename: '13_VIN_Serra_Nissan_21044_Appointments_Weekly_Report-808.xlsx' },
  { profile: 'serra-nissan', family: 'crm_sales_gross', filename: '14_VIN_Serra_Nissan_21044_CRM_Sales_Gross_Weekly_Report-533.xlsx' },
  { profile: 'serra-nissan', family: 'sales_comm_log', filename: '15_VIN_Serra_Nissan_21044_Sales_Communication_Log_Daily_Report-5886.xlsx' },
  { profile: 'serra-nissan', family: 'cage_kpi', filename: '16_VIN_Serra_Nissan_21044_CAGE_KPI_Weekly_Report-7529.xlsx' },
  { profile: 'serra-nissan', family: 'lead_source_roi', filename: '17_VIN_Serra_Nissan_21044_Lead_Source_ROI_Weekly_Report-2068.xlsx' },
  { profile: 'serra-nissan', family: 'dealership_performance', filename: '18_VIN_Serra_Nissan_21044_Dealer_Dashboard_Weekly_Report-3629.xlsx' },
]

// ── receipt schema ──────────────────────────────────────────────────────────

export type HoldOutcome = {
  outcome: 'held' | 'quarantined' | 'replay'
  validation_state: 'held' | 'quarantined'
  report_kind: string
  /** manifest dealer (rooftop) as the governed gate recorded it — bound to the expected rooftop. */
  dealer: string
  period: { start: string | null; end: string | null }
  quarantine_reason: string | null
  detail: string | null
  receipt_id: string
  hold_path: string
  /**
   * Dev-test provenance metadata disclosure. The workbook BYTES and their SHA-256 hashes are
   * the EXACT real VinSolutions files (see source.sha256); ONLY the Gmail transport envelope
   * fields (sender/subject/gmail_message_id) are dev-test placeholders supplied so the governed
   * hold gate can run. Nothing here implies the data itself is synthetic.
   */
  provenance_envelope: string
}

export type PromoteOutcome = {
  /** 'attempted' is set for the 9 quarantined families: promote MUST be attempted and MUST abort. */
  outcome: 'promoted' | 'duplicate' | 'aborted'
  delivery_id: string | null
  accepted_rows: number | null
  analytics_db: string | null
  abort_reason: string | null
  /** Preserved runVinWatchdog result from the governed promote (strict promoted cells only). */
  watchdog: Record<string, unknown> | null
}

/** One row of the machine-readable 18-cell before/after receipt. */
export type E2ECell = {
  profile: string
  dealer: string
  dealer_id: string
  family: FamilySlug
  cadence: 'weekly' | 'daily'
  source: { filename: string; path: string; sha256: string; size_bytes: number }
  /** proof the exact preserved workbook was used (bound to the authoritative ledger). */
  identity: IdentityBinding
  period_hint: string
  // before: the strict CONTRACT expectation for this pass
  expected: { strict_state: StrictState; lane: Lane }
  // after: what the real pipeline actually did
  hold: HoldOutcome
  promote: PromoteOutcome | null
  strict_state: StrictState
  preview_lane: Lane
  /** expected vs actual agreement — a false here is a surfaced surprise, not a silent pass. */
  agrees: boolean
  /**
   * Full technical pass for this cell — STRONGER than `agrees` (which only checks held-vs-
   * quarantined). Strict cell passes iff: hold=held AND expected=accepted AND report_kind/dealer/
   * period bound to the expected family/rooftop/window AND promote=promoted AND reader available
   * with EVERY required metric present/non-null AND the preserved watchdog result reconciles with
   * the reader + accepted rows. Preview cell passes iff: hold=quarantined AND expected=quarantined
   * AND report_kind/dealer bound AND promote was ATTEMPTED and ABORTED (never entered the strict
   * ledger) AND the provisional adapter is available AND its reconciliation is checked AND reconciles
   * AND every component reconciliation it emitted (CAGE comms components/direction/grand-total, Comm
   * channel-sum) is checked AND reconciles (a missing channel/component or arithmetic mismatch fails).
   * A false surfaces a broken hold/promotion/reader/adapter/watchdog even when `agrees` is true.
   * This is a technical-pipeline pass ONLY — it never implies strict M1 readiness.
   */
  technical_pass: boolean
  technical_pass_detail: string
  reader_used: string
  /** strict cells: cross-check of the preserved runVinWatchdog result vs the strict reader. */
  watchdog_reconciliation: WatchdogReconciliation | null
  rows: { observed: number | null; accepted: number | null }
  service_parts_excluded: number | null
  metrics_emitted: Record<string, number | null>
  metrics_withheld: string[]
  reconciliation: { checked: boolean; reconciles: boolean | null; detail: string }
  /** provisional cells: CAGE comms component/direction/grand-total + Comm channel-sum self-checks. */
  component_reconciliations: Array<{ name: string; checked: boolean; reconciles: boolean | null; detail: string }> | null
  output_artifact: string
  notes: string[]
}

export type E2EReceipt = {
  artifact: 'm1r-real-data-e2e-receipt'
  version: string
  /** REAL wall-clock execution time (new Date().toISOString()). */
  executed_at: string
  /** Pinned data-cycle reference day — NOT execution time (governs period_hint + dev-test capture). */
  data_reference_day: string
  data_period: { weekly: { start: string; end: string }; daily_comm: { start: string; end: string } }
  scope: string
  isolated_roots: { base: string; hold_leaf: string; analytics_leaf: string; note: string }
  hs_ingest_dev_root: string
  fixtures_dir: string
  source_identity: {
    bound_to: string
    derived_from: string
    ledger_generated_at: string | null
    all_18_bound: boolean
    shadow_reconciliation: string
  }
  strict_contract: { accepted: number; quarantined: number; readiness: false }
  cells: E2ECell[]
  summary: {
    total: number
    held: number
    quarantined: number
    promoted: number
    provisional_available: number
    disagreements: number
    technical_pass: number
    technical_failures: number
    /** filename + reason for every cell that did not fully technically pass. */
    technical_failure_details: Array<{ profile: string; family: FamilySlug; reason: string }>
  }
}

// ── watchdog reconciliation ───────────────────────────────────────────────────
export type WatchdogReconciliation = {
  checked: boolean
  ok: boolean
  detail: string
  checks: Array<{ name: string; ok: boolean; detail: string }>
}

/**
 * Cross-check the preserved runVinWatchdog result against the strict reader + accepted rows.
 * Requires watchdog present, profile/period bound, the family's watchdog metrics present, and
 * overlapping values reconciled: Gross total_sum + reconciliation_mismatches equal the reader
 * (count == row_count); Appointment rates equal counts-derived rates within tolerance (and each
 * rate's count equals the reader numerator); Dashboard section_markers internally consistent
 * with accepted rows (count == accepted rows, 1 ≤ markers ≤ rows).
 */
export function reconcileWatchdog(
  family: FamilySlug,
  readerMetrics: Record<string, number | null>,
  watchdog: Record<string, unknown> | null,
  profile: string,
  acceptedRows: number | null,
): WatchdogReconciliation {
  const checks: Array<{ name: string; ok: boolean; detail: string }> = []
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail })
  if (!watchdog) return { checked: false, ok: false, detail: 'watchdog result missing (null) — governed promote returned no metrics', checks: [{ name: 'watchdog present', ok: false, detail: 'null' }] }

  const ph = periodHintFor(family)
  add('watchdog.profile matches cell', watchdog.profile === profile, `${String(watchdog.profile)} vs ${profile}`)
  const wp = (watchdog.period ?? {}) as { start?: string; end?: string }
  add('watchdog.period matches window', wp.start === ph.start && wp.end === ph.end, `${wp.start}..${wp.end} vs ${ph.start}..${ph.end}`)

  const arr = Array.isArray(watchdog.metrics) ? (watchdog.metrics as Array<{ metric_id: string; value: number; count: number }>) : []
  const wm = new Map(arr.map((m) => [m.metric_id, m]))
  const TOL = 0.006

  if (family === 'appointments') {
    const total = readerMetrics['appt.total']
    const rateMap: Record<string, string> = {
      'appt.show_rate': 'appt.show', 'appt.no_show_rate': 'appt.no_show', 'appt.confirmed_rate': 'appt.confirmed',
      'appt.cancel_rate': 'appt.cancelled', 'appt.reschedule_rate': 'appt.rescheduled',
    }
    let present = 0
    for (const [rateId, numKey] of Object.entries(rateMap)) {
      const w = wm.get(rateId)
      if (!w) continue
      present++
      const num = readerMetrics[numKey]
      const expected = num != null && total != null && total > 0 ? num / total : null
      const ok = num != null && w.count === num && expected != null && Math.abs(w.value - expected) <= TOL
      add(`${rateId} reconciles`, ok, `wd value=${w.value} count=${w.count} vs reader ${numKey}=${num}/${total}`)
    }
    add('appointment rate metrics present', present >= 5, `${present}/5 rate metrics present`)
  } else if (family === 'crm_sales_gross') {
    const ts = wm.get('gross.total_sum')
    const rm = wm.get('gross.reconciliation_mismatches')
    add('gross.total_sum present', !!ts, ts ? `=${ts.value}` : 'absent')
    if (ts) {
      add('gross.total_sum == reader', Math.abs(ts.value - (readerMetrics['gross.total_sum'] ?? NaN)) <= 0.01, `${ts.value} vs ${readerMetrics['gross.total_sum']}`)
      add('gross count == reader row_count', ts.count === readerMetrics['gross.row_count'], `${ts.count} vs ${readerMetrics['gross.row_count']}`)
    }
    add('gross.reconciliation_mismatches present', !!rm, rm ? `=${rm.value}` : 'absent')
    if (rm) add('gross.reconciliation_mismatches == reader', rm.value === readerMetrics['gross.reconciliation_mismatches'], `${rm.value} vs ${readerMetrics['gross.reconciliation_mismatches']}`)
  } else if (family === 'dealership_performance') {
    const sm = wm.get('dashboard.section_markers')
    add('dashboard.section_markers present', !!sm, sm ? `=${sm.value} count=${sm.count}` : 'absent')
    if (sm) {
      add('section_markers >= 1', sm.value >= 1, `${sm.value}`)
      add('dashboard count == accepted rows', acceptedRows != null && sm.count === acceptedRows, `count=${sm.count} vs accepted=${acceptedRows}`)
      add('section_markers <= rows', sm.value <= sm.count, `${sm.value} <= ${sm.count}`)
    }
  }

  const ok = checks.every((c) => c.ok)
  return { checked: true, ok, detail: ok ? 'watchdog reconciles with strict reader + accepted rows' : `watchdog reconciliation FAILED: ${checks.filter((c) => !c.ok).map((c) => c.name).join('; ')}`, checks }
}

// ── pure folding of pipeline results into a receipt cell ─────────────────────

/** Shape of a strict reader result (ingest-native-metrics), narrowed to what the receipt needs. */
export type StrictReaderView = {
  available: boolean
  reason?: string
  reader: string
  acceptedRows: number | null
  metrics: Record<string, number | null>
  withheld: string[]
}

/** Shape of a provisional adapter result, narrowed to what the receipt needs. */
export type ProvisionalView = {
  available: boolean
  reason?: string
  rowsObserved: number | null
  serviceRowsExcluded: number | null
  reconciliation: { checked: boolean; reconciles: boolean | null; detail: string }
  componentReconciliations?: Array<{ name: string; checked: boolean; reconciles: boolean | null; detail: string }>
  metrics: Array<{ id: string; value: number | null }>
}

/** Per-profile cross-family reconciliation. Preserves exact source values; never picks a winner. */
export type CrossFamilyReconciliation = {
  profile: string
  checks: Array<{
    name: string
    a: { source: string; value: number | null }
    b: { source: string; value: number | null }
    reconciles: boolean | null
    tolerance: number
    directional: boolean
    caveat: string | null
  }>
  /** true only if every STRICT (non-directional) check reconciles; directional checks never fail the profile. */
  strict_ok: boolean
}

/**
 * Cross-check independent families for one rooftop WITHOUT choosing a winner:
 *  - strict gross total vs Dashboard gross (tolerance);
 *  - strict gross row_count (delivered-sale rows) vs Dashboard sold_in_period;
 *  - provisional CAGE gross vs strict gross (DIRECTIONAL — never fails the profile).
 * Exact source values are preserved; a mismatch is a visible data-quality caveat, not a zero or a pick.
 */
export function buildCrossFamilyReconciliation(profile: string, cells: E2ECell[]): CrossFamilyReconciliation {
  const met = (family: FamilySlug, id: string): number | null => {
    const c = cells.find((x) => x.family === family)
    const v = c?.metrics_emitted[id]
    return v === undefined ? null : v
  }
  const grossTotal = met('crm_sales_gross', 'gross.total_sum')
  const dashGross = met('dealership_performance', 'dp.total_gross')
  const grossRows = met('crm_sales_gross', 'gross.row_count')
  const dashSold = met('dealership_performance', 'dp.sold_in_period')
  const cageGross = met('cage_kpi', 'cage.total_gross')

  const near = (a: number | null, b: number | null, tol: number) => (a != null && b != null ? Math.abs(a - b) <= tol : null)
  const eq = (a: number | null, b: number | null) => (a != null && b != null ? a === b : null)

  const checks: CrossFamilyReconciliation['checks'] = [
    {
      name: 'gross_total_vs_dashboard_gross',
      a: { source: 'crm_sales_gross.gross.total_sum', value: grossTotal },
      b: { source: 'dealership_performance.dp.total_gross', value: dashGross },
      reconciles: near(grossTotal, dashGross, 0.01), tolerance: 0.01, directional: false,
      caveat: near(grossTotal, dashGross, 0.01) === false ? `gross total ${grossTotal} ≠ dashboard gross ${dashGross}` : null,
    },
    {
      name: 'delivered_rows_vs_dashboard_sold',
      a: { source: 'crm_sales_gross.gross.row_count', value: grossRows },
      b: { source: 'dealership_performance.dp.sold_in_period', value: dashSold },
      reconciles: eq(grossRows, dashSold), tolerance: 0, directional: false,
      caveat: eq(grossRows, dashSold) === false ? `${grossRows} CRM Sales Gross delivered-sale rows vs ${dashSold} Dashboard sold for the same week — shown unreconciled; neither treated as authoritative` : null,
    },
    {
      name: 'cage_provisional_gross_vs_strict_gross',
      a: { source: 'cage_kpi.cage.total_gross (provisional/directional)', value: cageGross },
      b: { source: 'crm_sales_gross.gross.total_sum', value: grossTotal },
      reconciles: near(cageGross, grossTotal, 0.01), tolerance: 0.01, directional: true,
      caveat: near(cageGross, grossTotal, 0.01) === false ? `CAGE provisional gross ${cageGross} ≠ strict gross ${grossTotal} (directional; CAGE remains quarantined)` : null,
    },
  ]
  const strict_ok = checks.filter((c) => !c.directional).every((c) => c.reconciles === true)
  return { profile, checks, strict_ok }
}

/**
 * Fold a strict-lane governed result (hold + promote + reader) into a receipt cell.
 * Missing is not zero: an unavailable reader records null metrics + a withheld reason.
 */
export function buildStrictCell(
  m: ManifestCell,
  source: E2ECell['source'],
  identity: IdentityBinding,
  hold: HoldOutcome,
  promote: PromoteOutcome,
  reader: StrictReaderView,
): E2ECell {
  const strict_state: StrictState = hold.validation_state === 'held' ? 'accepted' : 'quarantined'
  const expected = { strict_state: expectedStateFor(m.family), lane: laneFor(m.family) }
  const metrics_emitted = reader.available ? reader.metrics : {}
  const metrics_withheld = reader.available ? reader.withheld : [reader.reason ?? 'reader unavailable']
  const expectedDealer = DEALER_NAMES[m.profile] ?? m.profile
  const required = REQUIRED_STRICT_METRICS[m.family] ?? []
  const missingRequired = required.filter((k) => reader.metrics[k] === undefined || reader.metrics[k] === null)
  const ph = periodHintFor(m.family)
  const periodBound = hold.period.start === ph.start && hold.period.end === ph.end
  const wdRecon = reconcileWatchdog(m.family, reader.metrics, promote.watchdog, m.profile, promote.accepted_rows ?? reader.acceptedRows)
  const checks: Array<[boolean, string]> = [
    [hold.validation_state === 'held', 'hold=held'],
    [expected.strict_state === 'accepted', 'expected=accepted'],
    [hold.report_kind === expectedReportKind(m.family), `report_kind=${expectedReportKind(m.family)} (got ${hold.report_kind})`],
    [dealerMatches(expectedDealer, hold.dealer), `dealer=${expectedDealer} (got ${hold.dealer})`],
    [periodBound, `period=${ph.start}..${ph.end} (got ${hold.period.start}..${hold.period.end})`],
    [promote.outcome === 'promoted', `promote=promoted (got ${promote.outcome}${promote.abort_reason ? ': ' + promote.abort_reason : ''})`],
    [reader.available, 'reader available'],
    [missingRequired.length === 0, `all required metrics present (missing/null: ${missingRequired.join(', ') || 'none'})`],
    [wdRecon.ok, `watchdog reconciles (${wdRecon.detail})`],
  ]
  const failed = checks.filter(([ok]) => !ok).map(([, name]) => name)
  const technical_pass = failed.length === 0
  return {
    profile: m.profile,
    dealer: DEALER_NAMES[m.profile] ?? m.profile,
    dealer_id: DEALER_IDS[m.profile] ?? '?',
    family: m.family,
    cadence: cadenceFor(m.family),
    source,
    identity,
    period_hint: periodHintString(m.family),
    expected,
    hold,
    promote,
    strict_state,
    preview_lane: 'strict-governed',
    agrees: strict_state === expected.strict_state,
    technical_pass,
    technical_pass_detail: technical_pass ? 'strict lane: held + accepted + report_kind/dealer/period bound + promoted + all required metrics present + watchdog reconciled' : `strict lane FAILED: ${failed.join('; ')}`,
    reader_used: reader.reader,
    watchdog_reconciliation: wdRecon,
    rows: { observed: reader.acceptedRows, accepted: promote.accepted_rows },
    service_parts_excluded: null, // strict families quarantine (not exclude) on Service/Parts
    metrics_emitted,
    metrics_withheld,
    reconciliation: { checked: false, reconciles: null, detail: 'strict lane: governed acceptance is the reconciliation authority' },
    component_reconciliations: null,
    output_artifact: `${m.profile}-halo-preview.html`,
    notes: [],
  }
}

/**
 * Fold a provisional-lane result (hold quarantines + non-promoting adapter) into a receipt cell.
 * The hold outcome is the REAL governed disposition (quarantine); the adapter supplies the
 * DIRECTIONAL preview metrics that are explicitly NOT strict acceptance.
 */
export function buildProvisionalCell(
  m: ManifestCell,
  source: E2ECell['source'],
  identity: IdentityBinding,
  hold: HoldOutcome,
  promote: PromoteOutcome,
  prov: ProvisionalView,
): E2ECell {
  const strict_state: StrictState = hold.validation_state === 'held' ? 'accepted' : 'quarantined'
  const expected = { strict_state: expectedStateFor(m.family), lane: laneFor(m.family) }
  const metrics_emitted: Record<string, number | null> = {}
  const metrics_withheld: string[] = []
  for (const met of prov.metrics) {
    metrics_emitted[met.id] = met.value
    if (met.value === null) metrics_withheld.push(met.id)
  }
  const notes = [
    'PROVISIONAL / directional — NOT strict M1R acceptance; the governed gate quarantined this family (hidden Lead Intent).',
  ]
  if (!prov.available) notes.push(`provisional adapter unavailable: ${prov.reason ?? 'unknown'} (missing is not zero)`)
  const expectedDealer = DEALER_NAMES[m.profile] ?? m.profile
  // The EXACT required component reconciliations for this family must be present, unique, and each
  // checked AND reconciling. An empty/undefined set fails a family that requires checks (missing name);
  // a duplicate or an unexpected extra name also fails. ROI requires none.
  const components = prov.componentReconciliations ?? []
  const requiredComponents = REQUIRED_COMPONENT_CHECKS[m.family] ?? []
  const presentNames = components.map((c) => c.name)
  const missingComponents = requiredComponents.filter((n) => !presentNames.includes(n))
  const duplicateComponents = presentNames.filter((n, i) => presentNames.indexOf(n) !== i)
  const unexpectedComponents = presentNames.filter((n) => !requiredComponents.includes(n))
  const notReconciledComponents = components
    .filter((c) => requiredComponents.includes(c.name) && !(c.checked === true && c.reconciles === true))
    .map((c) => c.name)
  const componentProblems = [
    ...missingComponents.map((n) => `missing:${n}`),
    ...duplicateComponents.map((n) => `duplicate:${n}`),
    ...unexpectedComponents.map((n) => `unexpected:${n}`),
    ...notReconciledComponents.map((n) => `not-reconciled:${n}`),
  ]
  const checks: Array<[boolean, string]> = [
    [hold.validation_state === 'quarantined', 'hold=quarantined'],
    [expected.strict_state === 'quarantined', 'expected=quarantined'],
    [hold.report_kind === expectedReportKind(m.family), `report_kind=${expectedReportKind(m.family)} (got ${hold.report_kind})`],
    [dealerMatches(expectedDealer, hold.dealer), `dealer=${expectedDealer} (got ${hold.dealer})`],
    // promote MUST have been attempted and MUST have aborted (never enters the strict ledger).
    [promote.outcome === 'aborted', `promote attempted & aborted (got ${promote.outcome})`],
    [prov.available, 'provisional adapter available'],
    [prov.reconciliation.checked === true && prov.reconciliation.reconciles === true, `provisional reconciliation checked & reconciles (checked=${prov.reconciliation.checked}, reconciles=${prov.reconciliation.reconciles})`],
    [componentProblems.length === 0, `exact required component reconciliations present & reconcile (problems: ${componentProblems.join(', ') || 'none'})`],
  ]
  const failed = checks.filter(([ok]) => !ok).map(([, name]) => name)
  const technical_pass = failed.length === 0
  return {
    profile: m.profile,
    dealer: DEALER_NAMES[m.profile] ?? m.profile,
    dealer_id: DEALER_IDS[m.profile] ?? '?',
    family: m.family,
    cadence: cadenceFor(m.family),
    source,
    identity,
    period_hint: periodHintString(m.family),
    expected,
    hold,
    promote,
    strict_state,
    preview_lane: 'provisional-preview',
    agrees: strict_state === expected.strict_state,
    technical_pass,
    technical_pass_detail: technical_pass ? 'preview lane: quarantined + report_kind/dealer bound + promote attempted & aborted + adapter available + reconciliation & all component reconciliations checked & reconcile' : `preview lane FAILED: ${failed.join('; ')}`,
    reader_used: prov.available ? 'provisional-adapter (non-promoting)' : 'provisional-adapter (unavailable)',
    watchdog_reconciliation: null,
    rows: { observed: prov.rowsObserved, accepted: null },
    service_parts_excluded: prov.serviceRowsExcluded,
    metrics_emitted,
    metrics_withheld,
    reconciliation: prov.reconciliation,
    component_reconciliations: prov.componentReconciliations ?? null,
    output_artifact: `${m.profile}-halo-preview.html`,
    notes,
  }
}

export function summarize(cells: E2ECell[]): E2EReceipt['summary'] {
  const failures = cells.filter((c) => !c.technical_pass)
  return {
    total: cells.length,
    held: cells.filter((c) => c.hold.validation_state === 'held').length,
    quarantined: cells.filter((c) => c.hold.validation_state === 'quarantined').length,
    promoted: cells.filter((c) => c.promote?.outcome === 'promoted').length,
    provisional_available: cells.filter((c) => c.preview_lane === 'provisional-preview' && c.reader_used.startsWith('provisional-adapter (non-promoting)')).length,
    disagreements: cells.filter((c) => !c.agrees).length,
    technical_pass: cells.filter((c) => c.technical_pass).length,
    technical_failures: failures.length,
    technical_failure_details: failures.map((c) => ({ profile: c.profile, family: c.family, reason: c.technical_pass_detail })),
  }
}
