/**
 * INTERIM PROVISIONAL (non-promoting) analysis adapter — ROI / CAGE / Sales Communication.
 *
 * WHY THIS EXISTS
 *   The three families Lead Source ROI (`lead_source_roi`), Enterprise/CAGE KPI (`cage_kpi`),
 *   and Sales Communication (`sales_comm_log`) are QUARANTINED under the strict Sales-only
 *   contract because the VinSolutions Filters tab positively carries a hidden
 *   `Lead Intent = [Parts, Sales, Service, Unknown]` that cannot be removed via the UI
 *   (see docs/halo/evidence/m1r/GATE3_HIDDEN_LEAD_INTENT_BLOCKER_2026-08-30.md). This adapter
 *   produces DEFENSIBLE, DIRECTIONAL provisional metrics for an internal prototype ONLY.
 *
 * HARD GUARANTEES (do not weaken):
 *   - NON-PROMOTING. It never opens the governed store, never writes the strict ledgers,
 *     never runs the strict classifier, never touches readiness/contract/schedules. Every
 *     result carries strictStatus='quarantined' and provisional=true, ALWAYS.
 *   - FAIL CLOSED on wrong dealer / wrong period / schema mismatch → available:false with a
 *     limitation code. Missing is NEVER zero (absent metric column → value null, not 0).
 *   - PRIVACY. It reads only structural / aggregate columns. It NEVER reads, stores, or emits
 *     the `Customer` or `Message Content` columns. Outputs are aggregate counts/sums plus the
 *     source filename, checksum, and service-row-exclusion counts — no per-row content.
 *   - SALES COMMUNICATION excludes AND counts every detectable Service/Parts-coded row (via
 *     Lead Type / Comm Type / Lead Source) or named service source BEFORE any calculation.
 *   - AGGREGATE ROI/CAGE cannot separate the hidden Lead Intent after aggregation, so their
 *     metrics carry the HIDDEN_LEAD_INTENT_AGGREGATE footnote: directional, NOT strict proof.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { readXlsx, type XlsxSheet } from './xlsx-reader'

export type ProvisionalFamily = 'lead_source_roi' | 'cage_kpi' | 'sales_comm_log'

/** Machine-stable limitation codes attached to provenance and to each metric footnote. */
export type LimitationCode =
  | 'NOT_STRICT_ACCEPTANCE' // provisional; strict status stays quarantined
  | 'HIDDEN_LEAD_INTENT_AGGREGATE' // ROI/CAGE: hidden Lead Intent incl. Parts/Service, inseparable post-aggregation
  | 'HIDDEN_LEAD_INTENT_ROWLEVEL_RESIDUAL' // comm: row Sales-filters + service-source exclusion applied; residual risk
  | 'SERVICE_ROWS_EXCLUDED' // n rows excluded before calculation (see serviceRowsExcluded)
  | 'ROI_COST_ZERO' // cost/profit fields present but zero → actual ROI withheld
  | 'SINGLE_PERIOD_BASELINE' // one accepted period; no trend
  | 'NO_CAUSALITY' // descriptive counts, not attributed causation
  | 'SCHEMA_MISMATCH' // required sheet/columns absent → fail closed
  | 'WRONG_DEALER' // Filters dealer ≠ target → fail closed
  | 'WRONG_PERIOD' // Filters period ≠ expected → fail closed

export type ProvisionalProvenance = {
  sourceFilename: string
  checksumSha256: string
  profile: string
  dealer: string | null
  family: ProvisionalFamily
  period: { start: string | null; end: string | null }
  /** ALWAYS 'quarantined' — this adapter never promotes or accepts. */
  strictStatus: 'quarantined'
  /** ALWAYS true. */
  provisional: true
  limitationCodes: LimitationCode[]
}

export type ProvisionalMetric = {
  id: string
  label: string
  /** Missing is NEVER zero: an absent column / no data → null. */
  value: number | null
  unit: 'count' | 'usd' | 'ratio'
  basis: string
  footnoteCodes: LimitationCode[]
}

export type ProvisionalResult =
  | { available: false; provenance: ProvisionalProvenance; reason: string; failClosed: LimitationCode }
  | {
      available: true
      provenance: ProvisionalProvenance
      rowsObserved: number
      serviceRowsExcluded: number
      salesRowsIncluded: number
      /** Internal arithmetic self-check (per-row sum vs the report's own TOTAL row). */
      reconciliation: { checked: boolean; reconciles: boolean | null; detail: string }
      /** Additional component identity self-checks (CAGE comms components/direction/grand-total;
       *  Sales-Comm channel-sum vs included rows). Present only where components are computed. */
      componentReconciliations?: Array<{ name: string; checked: boolean; reconciles: boolean | null; detail: string }>
      metrics: ProvisionalMetric[]
    }

const SERVICE_PARTS_RE = /\b(service|parts)\b/i
export const isServiceParts = (v: string | undefined): boolean => SERVICE_PARTS_RE.test(v ?? '')

const DEALER_NAMES: Record<string, string> = {
  'serra-honda': 'Serra Honda',
  'serra-nissan': 'Serra Nissan',
  'tony-serra-ford': 'Tony Serra Ford',
}
export function expectedDealerFor(profile: string): string {
  return DEALER_NAMES[profile] ?? profile
}

const normDealer = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
/** Tolerant match: "Serra Honda" ⊆ "Serra Honda of Sylacauga". */
function dealerMatches(expected: string, actual: string): boolean {
  const a = normDealer(actual)
  const b = normDealer(expected)
  return a.length > 0 && b.length > 0 && (a.startsWith(b) || b.startsWith(a))
}

const FILTER_MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}
/** "Aug 24 2026 12:00AM" | ISO → YYYY-MM-DD (timezone-safe; no Date()). */
export function parseFilterDate(v: string): string | null {
  const s = (v ?? '').trim()
  if (!s) return null
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?!\d)/)
  if (iso) {
    const mo = +iso[2], d = +iso[3]
    return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? `${iso[1]}-${iso[2]}-${iso[3]}` : null
  }
  const m = s.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/)
  if (m) {
    const mo = FILTER_MONTHS[m[1].slice(0, 3).toLowerCase()]
    const d = +m[2], y = +m[3]
    return mo && d >= 1 && d <= 31 ? `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null
  }
  return null
}

type Filters = { dealers: string[]; leadIntents: string[]; period: { start: string | null; end: string | null } }
function parseFilters(rows: string[][]): Filters {
  // Real VinSolutions 3-col layout: "Filter Name | Number Selected | Selected Values".
  let valueCol = 1
  for (const r of rows) {
    if ((r[0] ?? '').trim().toLowerCase() === 'filter name') {
      const sv = r.findIndex((c) => (c ?? '').trim().toLowerCase() === 'selected values')
      if (sv >= 0) { valueCol = sv; break }
    }
  }
  const raw: Record<string, string> = {}
  for (const r of rows) {
    const key = (r[0] ?? '').trim()
    if (key) raw[key] = (r[valueCol] ?? '').trim()
  }
  const get = (re: RegExp) => { const k = Object.keys(raw).find((x) => re.test(x)); return k ? raw[k] : '' }
  const split = (v: string) => v.split(/[;,]/).map((s) => s.trim()).filter(Boolean)
  const begin = parseFilterDate(get(/date range begin/i))
  const end = parseFilterDate(get(/date range end/i))
  return {
    dealers: split(get(/^dealers?$/i)),
    leadIntents: split(get(/lead intent/i)),
    period: { start: begin, end },
  }
}

const findSheet = (sheets: XlsxSheet[], re: RegExp) => sheets.find((s) => re.test(s.name))
function headerMap(rows: string[][]): { index: number; map: Map<string, number> } | null {
  const index = rows.findIndex((r) => r.some((c) => (c ?? '').trim() !== ''))
  if (index < 0) return null
  const map = new Map<string, number>()
  rows[index].forEach((c, i) => map.set((c ?? '').trim(), i))
  return { index, map }
}
const nonBlank = (rows: string[][]) => rows.filter((r) => r.some((c) => (c ?? '').trim() !== ''))
const cellNum = (r: string[], col: number | undefined): number | null => {
  if (col == null) return null
  const v = (r[col] ?? '').replace(/[$,%\s]/g, '')
  return v !== '' && Number.isFinite(Number(v)) ? Number(v) : null
}
/**
 * Sum a column across rows. Missing is NOT zero: returns null when the column is absent OR
 * when NO cell holds a genuine numeric observation (all blank/non-numeric). Sums to 0 only
 * when at least one real numeric value (including a genuine 0) is present.
 */
function sumCol(rows: string[][], col: number | undefined): number | null {
  if (col == null) return null
  let sum = 0
  let observations = 0
  for (const r of rows) {
    const n = cellNum(r, col)
    if (n != null) { sum += n; observations++ }
  }
  return observations === 0 ? null : Math.round(sum * 100) / 100
}

export function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

export type ProvisionalOpts = {
  profile: string
  sourceFilename: string
  checksumSha256: string
  /** Weekly families pin this (Aug 24–30). Daily comm passes undefined (records its own day). */
  expectedPeriod?: { start: string; end: string }
}

/**
 * PURE compute over already-parsed sheets — unit-testable with hand-built sheets, so the
 * test suite never needs the real (PII-bearing, local-only) workbooks.
 */
export function computeProvisional(
  family: ProvisionalFamily,
  sheets: XlsxSheet[],
  opts: ProvisionalOpts,
): ProvisionalResult {
  const baseProv = {
    sourceFilename: opts.sourceFilename,
    checksumSha256: opts.checksumSha256,
    profile: opts.profile,
    family,
    strictStatus: 'quarantined' as const,
    provisional: true as const,
  }
  const fail = (code: LimitationCode, reason: string, dealer: string | null, period: Filters['period']): ProvisionalResult => ({
    available: false,
    provenance: { ...baseProv, dealer, period, limitationCodes: ['NOT_STRICT_ACCEPTANCE', code] },
    reason,
    failClosed: code,
  })

  const report = findSheet(sheets, /^report/i) ?? findSheet(sheets, /^(sheet1|report)/i)
  const filtersSheet = findSheet(sheets, /^filters$/i)
  if (!report || !filtersSheet) return fail('SCHEMA_MISMATCH', 'missing Report or Filters sheet', null, { start: null, end: null })
  const filters = parseFilters(filtersSheet.rows)
  const dealer = filters.dealers[0] ?? null

  // Dealer gate (fail closed).
  if (filters.dealers.length !== 1 || !dealerMatches(expectedDealerFor(opts.profile), filters.dealers[0]))
    return fail('WRONG_DEALER', `Filters dealer [${filters.dealers.join(', ') || 'none'}] ≠ ${expectedDealerFor(opts.profile)}`, dealer, filters.period)

  // Period gate (fail closed): weekly families must match the pinned window; all families
  // require a parseable period.
  if (!filters.period.start || !filters.period.end)
    return fail('WRONG_PERIOD', 'unparseable Filters period', dealer, filters.period)
  if (opts.expectedPeriod && (filters.period.start !== opts.expectedPeriod.start || filters.period.end !== opts.expectedPeriod.end))
    return fail('WRONG_PERIOD', `period ${filters.period.start}..${filters.period.end} ≠ ${opts.expectedPeriod.start}..${opts.expectedPeriod.end}`, dealer, filters.period)

  const hm = headerMap(report.rows)
  if (!hm) return fail('SCHEMA_MISMATCH', 'Report sheet has no header row', dealer, filters.period)
  const dataRows = nonBlank(report.rows.slice(hm.index + 1))

  const provFor = (codes: LimitationCode[]): ProvisionalProvenance => ({
    ...baseProv, dealer, period: filters.period, limitationCodes: ['NOT_STRICT_ACCEPTANCE', ...codes],
  })

  const expectedDealer = expectedDealerFor(opts.profile)
  if (family === 'sales_comm_log') return commResult(dataRows, hm.map, provFor, fail, dealer, filters.period, expectedDealer)
  if (family === 'lead_source_roi') return roiResult(dataRows, hm.map, provFor, fail, dealer, filters.period, expectedDealer)
  return cageResult(dataRows, hm.map, provFor, fail, dealer, filters.period, expectedDealer)
}

/**
 * Row-level tenant gate for native families that carry a `Dealer` column: EVERY non-total
 * data/leaf row's dealer must match the target rooftop. Wrong / blank / ambiguous (>1 distinct)
 * → fail closed WRONG_DEALER. Families that natively lack a Dealer column pass `dealerCol=undefined`
 * and rely on the Filters gate (we do NOT invent a column that the source lacks).
 */
function rowDealerViolation(rows: string[][], dealerCol: number | undefined, expectedDealer: string): string | null {
  if (dealerCol == null) return null
  const seen = new Set<string>()
  for (const r of rows) {
    const d = (r[dealerCol] ?? '').trim()
    if (!d) return 'a leaf row has a blank Dealer'
    if (!dealerMatches(expectedDealer, d)) return `leaf row Dealer "${d}" ≠ ${expectedDealer}`
    seen.add(normDealer(d))
  }
  if (seen.size > 1) return `leaf rows span ${seen.size} distinct dealers`
  return null
}

// ── Sales Communication (row-level; service rows excluded + counted) ─────────
function commResult(
  dataRows: string[][],
  m: Map<string, number>,
  provFor: (c: LimitationCode[]) => ProvisionalProvenance,
  fail: (c: LimitationCode, r: string, d: string | null, p: Filters['period']) => ProvisionalResult,
  dealer: string | null,
  period: Filters['period'],
  expectedDealer: string,
): ProvisionalResult {
  const required = ['Dealer', 'Direction', 'Lead Type', 'Comm Type', 'Lead Source']
  const missing = required.filter((c) => !m.has(c))
  if (missing.length) {
    return { available: false, provenance: provFor(['SCHEMA_MISMATCH']), reason: `missing columns: ${missing.join(', ')}`, failClosed: 'SCHEMA_MISMATCH' }
  }
  // Missing is not zero: zero observed rows → unavailable (no fabricated "0 communications").
  if (dataRows.length === 0) {
    return { available: false, provenance: provFor(['SCHEMA_MISMATCH']), reason: 'no communication rows (missing is not zero)', failClosed: 'SCHEMA_MISMATCH' }
  }
  // Row-level tenant gate: the Sales Communication log has a per-row Dealer column, so every
  // row must be the target rooftop (Filters dealer alone is insufficient).
  const dealerViolation = rowDealerViolation(dataRows, m.get('Dealer'), expectedDealer)
  if (dealerViolation) return fail('WRONG_DEALER', dealerViolation, dealer, period)
  const ltC = m.get('Lead Type'), ctC = m.get('Comm Type'), lsC = m.get('Lead Source'), dirC = m.get('Direction'), chC = m.get('Comm Channel')
  // Detect a service/parts row via any of Lead Type / Comm Type / Lead Source (named service source).
  const isServiceRow = (r: string[]) => [ltC, ctC, lsC].some((c) => c != null && isServiceParts(r[c]))
  const service = dataRows.filter(isServiceRow)
  const sales = dataRows.filter((r) => !isServiceRow(r)) // EXCLUDE service BEFORE calculations
  const isInbound = (v: string) => /^(in|inbound|received|incoming)$/i.test((v ?? '').trim())
  const isOutbound = (v: string) => /^(out|outbound|sent|outgoing)$/i.test((v ?? '').trim())
  const basis = `${sales.length} Sales communication rows (${service.length} service/parts rows excluded)`
  const codes: LimitationCode[] = ['HIDDEN_LEAD_INTENT_ROWLEVEL_RESIDUAL', 'SERVICE_ROWS_EXCLUDED', 'NO_CAUSALITY']
  // Exact Comm Channel breakdown over the INCLUDED sales rows. Missing column → null (never 0).
  const channelCount = (label: string) => (chC == null ? null : sales.filter((r) => (r[chC] ?? '').trim() === label).length)
  const email = channelCount('Email'), loggedCall = channelCount('Logged Call'), text = channelCount('Text'), facebook = channelCount('Facebook')
  const metrics: ProvisionalMetric[] = [
    { id: 'comm.sales_communications', label: 'Sales communications logged', value: sales.length, unit: 'count', basis, footnoteCodes: codes },
    { id: 'comm.inbound', label: 'Inbound customer messages', value: dirC == null ? null : sales.filter((r) => isInbound(r[dirC])).length, unit: 'count', basis, footnoteCodes: codes },
    { id: 'comm.outbound', label: 'Outbound rep messages', value: dirC == null ? null : sales.filter((r) => isOutbound(r[dirC])).length, unit: 'count', basis, footnoteCodes: codes },
    { id: 'comm.email', label: 'Email communications', value: email, unit: 'count', basis, footnoteCodes: codes },
    { id: 'comm.logged_call', label: 'Logged Call communications', value: loggedCall, unit: 'count', basis, footnoteCodes: codes },
    { id: 'comm.text', label: 'Text communications', value: text, unit: 'count', basis, footnoteCodes: codes },
    { id: 'comm.facebook', label: 'Facebook communications', value: facebook, unit: 'count', basis, footnoteCodes: codes },
    { id: 'comm.service_rows_excluded', label: 'Service/Parts rows excluded before calculation', value: service.length, unit: 'count', basis, footnoteCodes: ['SERVICE_ROWS_EXCLUDED'] },
  ]
  // Channel component identity: the four known channels sum to the included sales rows (a nonzero
  // residual means an unlisted channel exists — surfaced, never hidden).
  const knownChannelSum = [email, loggedCall, text, facebook].every((v) => v != null) ? (email! + loggedCall! + text! + facebook!) : null
  const componentReconciliations = [
    { name: 'comm.channel_sum', checked: knownChannelSum != null, reconciles: knownChannelSum != null ? knownChannelSum === sales.length : null, detail: `email+call+text+facebook=${knownChannelSum} vs included sales rows=${sales.length}` },
  ]
  return {
    available: true,
    provenance: provFor(codes),
    rowsObserved: dataRows.length,
    serviceRowsExcluded: service.length,
    salesRowsIncluded: sales.length,
    reconciliation: { checked: true, reconciles: service.length + sales.length === dataRows.length, detail: `${service.length} excluded + ${sales.length} included = ${dataRows.length} observed` },
    componentReconciliations,
    metrics,
  }
}

// ── Lead Source ROI (per-source rows; reconcile against the TOTAL row) ───────
function roiResult(
  dataRows: string[][],
  m: Map<string, number>,
  provFor: (c: LimitationCode[]) => ProvisionalProvenance,
  fail: (c: LimitationCode, r: string, d: string | null, p: Filters['period']) => ProvisionalResult,
  dealer: string | null,
  period: Filters['period'],
  expectedDealer: string,
): ProvisionalResult {
  const lsC = m.get('Lead Source')
  const tlC = m.get('Total Leads')
  if (lsC == null || tlC == null) return { available: false, provenance: provFor(['SCHEMA_MISMATCH']), reason: 'missing Lead Source / Total Leads column', failClosed: 'SCHEMA_MISMATCH' }
  // Split the grand-TOTAL row out of the per-source leaf rows.
  const isTotal = (r: string[]) => /^total(s)?$/i.test((r[lsC] ?? '').trim())
  const totalRow = dataRows.find(isTotal) ?? null
  const leaves = dataRows.filter((r) => !isTotal(r))
  // ROI natively carries NO per-row Dealer column (tenant lives in Filters, already gated).
  // Defensive only: if a delivery ever includes one, enforce it — never invent one.
  const roiDealerViolation = rowDealerViolation(leaves, m.get('Dealer'), expectedDealer)
  if (roiDealerViolation) return fail('WRONG_DEALER', roiDealerViolation, dealer, period)
  // Service source rows excluded + counted before calculation.
  const service = leaves.filter((r) => isServiceParts(r[lsC]))
  const sources = leaves.filter((r) => !isServiceParts(r[lsC]))
  if (sources.length === 0) return fail('SCHEMA_MISMATCH', 'no lead-source rows', dealer, period)

  const totalLeads = sumCol(sources, tlC)
  const soldC = m.get('Sold from Leads'), dupC = m.get('Duplicate Leads'), tgC = m.get('Total Gross')
  const sold = sumCol(sources, soldC)
  const dup = sumCol(sources, dupC)
  const gross = sumCol(sources, tgC)
  const dupRate = dup != null && totalLeads != null && totalLeads > 0 ? Math.round((dup / totalLeads) * 1000) / 1000 : null
  // actual ROI: cost/profit present but zero in observed deliveries → withheld (missing ≠ zero).
  const cost = sumCol(sources, m.get('Total Cost'))
  const roiBasis = cost == null ? 'cost/profit fields absent from this delivery' : cost === 0 ? 'cost/profit fields present but zero in this delivery' : 'attributed-revenue keys absent despite non-zero cost'

  const codes: LimitationCode[] = ['HIDDEN_LEAD_INTENT_AGGREGATE', 'SINGLE_PERIOD_BASELINE', 'NO_CAUSALITY']
  const basis = `${sources.length} lead-source rows${service.length ? ` (${service.length} service excluded)` : ''}`
  const metrics: ProvisionalMetric[] = [
    { id: 'roi.total_leads', label: 'Total leads across sources', value: totalLeads, unit: 'count', basis, footnoteCodes: codes },
    { id: 'roi.sold_from_leads', label: 'Sold from leads', value: sold, unit: 'count', basis, footnoteCodes: codes },
    { id: 'roi.duplicate_rate', label: 'Duplicate-lead rate', value: dupRate, unit: 'ratio', basis, footnoteCodes: codes },
    { id: 'roi.total_gross', label: 'Total gross across sources', value: gross, unit: 'usd', basis, footnoteCodes: codes },
    // Attributed ROI is always withheld on the observed exports (cost/profit zero) — missing ≠ zero.
    { id: 'roi.actual_roi', label: 'Actual ROI', value: null, unit: 'ratio', basis: roiBasis, footnoteCodes: ['ROI_COST_ZERO', ...codes] },
  ]
  // Reconciliation is a SOURCE arithmetic self-check over the FULL leaf population (service
  // included), independent of the Sales-only exclusion applied to the published metrics — so
  // excluding service rows never spuriously fails reconciliation.
  const leafTotalLeads = sumCol(leaves, tlC)
  const totalRowLeads = totalRow ? cellNum(totalRow, tlC) : null
  return {
    available: true,
    provenance: provFor(codes),
    rowsObserved: dataRows.length,
    serviceRowsExcluded: service.length,
    salesRowsIncluded: sources.length,
    reconciliation: {
      checked: totalRow != null && totalRowLeads != null,
      reconciles: totalRow != null && totalRowLeads != null ? leafTotalLeads === totalRowLeads : null,
      detail: totalRow != null ? `Σ all-leaf Total Leads=${leafTotalLeads} vs report TOTAL row=${totalRowLeads} (published metrics exclude ${service.length} service rows)` : 'no TOTAL row present to reconcile against',
    },
    metrics,
  }
}

// ── CAGE / Enterprise Performance (3-level subtotals → LEAF rows only) ────────
function cageResult(
  dataRows: string[][],
  m: Map<string, number>,
  provFor: (c: LimitationCode[]) => ProvisionalProvenance,
  fail: (c: LimitationCode, r: string, d: string | null, p: Filters['period']) => ProvisionalResult,
  dealer: string | null,
  period: Filters['period'],
  expectedDealer: string,
): ProvisionalResult {
  const dealerC = m.get('Dealer'), ltC = m.get('Lead Type'), userC = m.get('User'), tlC = m.get('Total Leads')
  if (dealerC == null || userC == null || tlC == null) return { available: false, provenance: provFor(['SCHEMA_MISMATCH']), reason: 'missing Dealer / User / Total Leads column', failClosed: 'SCHEMA_MISMATCH' }
  // Grand TOTAL row: Dealer == "TOTAL". Subtotal rows have blank User; LEAF rows have a User.
  const grandTotal = dataRows.find((r) => (r[dealerC] ?? '').trim().toUpperCase() === 'TOTAL') ?? null
  const leaves = dataRows.filter((r) => (r[userC] ?? '').trim() !== '' && (r[dealerC] ?? '').trim().toUpperCase() !== 'TOTAL')
  if (leaves.length === 0) return fail('SCHEMA_MISMATCH', 'no per-rep leaf rows', dealer, period)
  // Row-level tenant gate: CAGE carries a per-row Dealer column, so every non-total leaf must
  // be the target rooftop. Filters dealer alone is insufficient (a leaf could carry a stray dealer).
  const cageDealerViolation = rowDealerViolation(leaves, dealerC, expectedDealer)
  if (cageDealerViolation) return fail('WRONG_DEALER', cageDealerViolation, dealer, period)
  // Any service/parts-coded Lead Type on a leaf row is excluded + counted.
  const service = ltC != null ? leaves.filter((r) => isServiceParts(r[ltC])) : []
  const sales = ltC != null ? leaves.filter((r) => !isServiceParts(r[ltC])) : leaves

  const reps = new Set(sales.map((r) => (r[userC] ?? '').trim()).filter(Boolean))
  const totalLeads = sumCol(sales, tlC)
  const sold = sumCol(sales, m.get('Sold from Leads'))
  const apptsSet = sumCol(sales, m.get('Appts Set'))
  const apptsShown = sumCol(sales, m.get('Appts Shown'))
  const gross = sumCol(sales, m.get('Total Gross'))

  const codes: LimitationCode[] = ['HIDDEN_LEAD_INTENT_AGGREGATE', 'SINGLE_PERIOD_BASELINE', 'NO_CAUSALITY']
  const basis = `${reps.size} reps over ${sales.length} leaf rows${service.length ? ` (${service.length} service excluded)` : ''}`
  // Published leaf sums for the exact native CAGE headers come from SALES leaves ONLY (any visible
  // Service/Parts leaf is excluded first) so a future Service leaf can never leak into a published
  // figure. The separate FULL-leaf → grand-TOTAL reconciliation below stays explicit. These remain
  // directional (hidden Lead Intent inseparable). Missing/non-numeric columns → null (never 0).
  const salesBasis = `${sales.length} sales leaf rows${service.length ? ` (${service.length} service excluded)` : ''} (directional aggregate; hidden Lead Intent inseparable)`
  const CAGE_LEAF_HEADERS: Array<[string, string, ProvisionalMetric['unit']]> = [
    ['cage.good_leads', 'Good Leads', 'count'], ['cage.bad_leads', 'Bad Leads', 'count'],
    ['cage.sold_in_time_frame', 'Sold in Time Frame', 'count'],
    ['cage.internet_leads', 'Internet Leads', 'count'], ['cage.internet_attempted_contact', 'Internet Attempted Contact', 'count'],
    ['cage.internet_actual_contact', 'Internet Actual Contact', 'count'],
    ['cage.appts_scheduled', 'Appts Scheduled', 'count'], ['cage.appts_scheduled_sold', 'Appts Scheduled Sold', 'count'],
    ['cage.appts_confirmed', 'Appts Confirmed', 'count'],
    ['cage.visits', 'Visits', 'count'], ['cage.visits_sold', 'Visits Sold', 'count'],
    ['cage.initial_visits', 'Initial Visits', 'count'], ['cage.be_back_visits', 'Be Back Visits', 'count'],
    ['cage.total_calls', 'Total Calls', 'count'], ['cage.total_emails', 'Total Emails', 'count'],
    ['cage.total_texts', 'Total Texts', 'count'], ['cage.total_facebook', 'Total Facebook', 'count'],
    ['cage.total_comms_in', 'Total Comms In', 'count'], ['cage.total_comms_out', 'Total Comms Out', 'count'],
    ['cage.total_comms', 'Total Comms', 'count'],
    ['cage.active_tasks', 'Active Tasks', 'count'], ['cage.completed_tasks', 'Completed Tasks', 'count'],
    ['cage.dismissed_tasks', 'Dismissed Tasks', 'count'], ['cage.inactive_tasks', 'Inactive Tasks', 'count'],
    ['cage.missed_tasks', 'Missed Tasks', 'count'],
  ]
  const salesSum = (header: string) => sumCol(sales, m.get(header)) // PUBLISHED basis: sales leaves only
  const fullSum = (header: string) => sumCol(leaves, m.get(header)) // full-source basis (grand-TOTAL reconciliation)
  const metrics: ProvisionalMetric[] = [
    { id: 'cage.rep_count', label: 'Active sales reps in period', value: reps.size, unit: 'count', basis, footnoteCodes: codes },
    { id: 'cage.total_leads', label: 'Total leads worked', value: totalLeads, unit: 'count', basis, footnoteCodes: codes },
    { id: 'cage.sold_from_leads', label: 'Sold from leads', value: sold, unit: 'count', basis, footnoteCodes: codes },
    { id: 'cage.appts_set', label: 'Appointments set', value: apptsSet, unit: 'count', basis, footnoteCodes: codes },
    { id: 'cage.appts_shown', label: 'Appointments shown', value: apptsShown, unit: 'count', basis, footnoteCodes: codes },
    { id: 'cage.total_gross', label: 'Total gross (rep-reported)', value: gross, unit: 'usd', basis, footnoteCodes: codes },
    ...CAGE_LEAF_HEADERS.map(([id, header, unit]) => ({ id, label: header, value: salesSum(header), unit, basis: salesBasis, footnoteCodes: codes })),
  ]
  // Reconcile the FULL leaf population (service included) vs the grand TOTAL row — a source
  // arithmetic self-check independent of the Sales-only exclusion on the published metrics.
  const leafTotalLeads = fullSum('Total Leads')
  const gtLeads = grandTotal ? cellNum(grandTotal, tlC) : null
  // Comms component identities (comms_components / comms_direction) are over the PUBLISHED sales leaves;
  // comms_grand_total is a SEPARATE full-source check (full-leaf Σ vs grand TOTAL row).
  const sCalls = salesSum('Total Calls'), sEmails = salesSum('Total Emails'), sTexts = salesSum('Total Texts'), sFb = salesSum('Total Facebook')
  const sIn = salesSum('Total Comms In'), sOut = salesSum('Total Comms Out'), sTotal = salesSum('Total Comms')
  const fullComms = fullSum('Total Comms')
  const gtComms = grandTotal ? cellNum(grandTotal, m.get('Total Comms')) : null
  const salesComponentSum = [sCalls, sEmails, sTexts, sFb].every((v) => v != null) ? (sCalls! + sEmails! + sTexts! + sFb!) : null
  const salesDirectionSum = sIn != null && sOut != null ? sIn + sOut : null
  const componentReconciliations = [
    { name: 'cage.comms_components', checked: salesComponentSum != null && sTotal != null, reconciles: salesComponentSum != null && sTotal != null ? salesComponentSum === sTotal : null, detail: `sales-leaf calls+emails+texts+facebook=${salesComponentSum} vs sales-leaf Total Comms=${sTotal}` },
    { name: 'cage.comms_direction', checked: salesDirectionSum != null && sTotal != null, reconciles: salesDirectionSum != null && sTotal != null ? salesDirectionSum === sTotal : null, detail: `sales-leaf in+out=${salesDirectionSum} vs sales-leaf Total Comms=${sTotal}` },
    { name: 'cage.comms_grand_total', checked: gtComms != null && fullComms != null, reconciles: gtComms != null && fullComms != null ? fullComms === gtComms : null, detail: `Σ FULL-leaf Total Comms=${fullComms} vs grand TOTAL row=${gtComms} (full source; published metrics exclude ${service.length} service rows)` },
  ]
  return {
    available: true,
    provenance: provFor(codes),
    rowsObserved: dataRows.length,
    serviceRowsExcluded: service.length,
    salesRowsIncluded: sales.length,
    reconciliation: {
      checked: grandTotal != null && gtLeads != null,
      reconciles: grandTotal != null && gtLeads != null ? leafTotalLeads === gtLeads : null,
      detail: grandTotal != null ? `Σ all-leaf Total Leads=${leafTotalLeads} vs grand TOTAL row=${gtLeads} (published metrics exclude ${service.length} service rows)` : 'no grand-TOTAL row present to reconcile against',
    },
    componentReconciliations,
    metrics,
  }
}

// ── File wrapper (used by the one-time render script + the runIf real-fixture check) ──
/** Pinned expected windows for the current delivery cycle (fixture manifest). */
export const WEEKLY_PERIOD = { start: '2026-08-24', end: '2026-08-30' }
/** The Sales Communication log is a DAILY export; the current cycle's day is 2026-08-29. */
export const DAILY_COMM_PERIOD = { start: '2026-08-29', end: '2026-08-29' }

/**
 * The exact expected period a family must equal for this cycle. Every family is pinned —
 * weekly families to Aug 24–30, the daily comm log to its exact current day — so a
 * wrong-but-parseable period (e.g. Aug 28) fails closed WRONG_PERIOD.
 */
export function expectedPeriodFor(family: ProvisionalFamily): { start: string; end: string } {
  return family === 'sales_comm_log' ? DAILY_COMM_PERIOD : WEEKLY_PERIOD
}

/** Read a local fixture file, hash its bytes, parse, and compute. NON-PROMOTING. */
export function readProvisionalFamilyFile(
  filePath: string,
  family: ProvisionalFamily,
  profile: string,
): ProvisionalResult {
  const buf = fs.readFileSync(filePath)
  const checksumSha256 = sha256(buf)
  const sourceFilename = path.basename(filePath)
  const { sheets } = readXlsx(buf)
  return computeProvisional(family, sheets, { profile, sourceFilename, checksumSha256, expectedPeriod: expectedPeriodFor(family) })
}
