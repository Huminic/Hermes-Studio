/**
 * Gate 4A — focused Leads-metrics reader for SW-011 / SW-012 / SW-015.
 *
 * Reads the ALREADY-ACCEPTED VinSolutions Custom Reporting "Leads" export (Sales-only) and
 * computes exactly the controller-ratified primitives:
 *   - governed business-hours population = native `Originated After Hours` == No;
 *   - SW-011 median of NUMERIC `Actual Response Time (Min)` in that population (blanks stay
 *     missing, excluded from the median; coverage numeric/business-hours + missing persisted);
 *   - SW-012 strict untouched = `First Contact Attempt` blank AND `First Customer Contact`
 *     blank AND `Actual Response Time` blank, within the business-hours population;
 *   - SW-015 per-rep mean `Actual Response Time` vs the store median (same population); a rep
 *     triggers at >= 2x. Sales Rep is aggregated in-memory and NEVER retained as a name.
 *
 * Fail-closed Sales-only: XLSX magic bytes, one rooftop (Dealer ID), and a Service/Parts scan
 * of the categorical columns. Blank stays missing (never zero). Pure compute; no PII retained.
 */
import {
  CATEGORICAL_SERVICE_SCAN_COLUMNS,
  SERVICE_PARTS_TOKEN,
  XLSX_MAGIC,
} from '../leads/leads-family-contract'
import { readXlsx } from '../provisional/xlsx-reader'

export class LeadsMetricsError extends Error {}

export type LeadsMetrics = {
  family: 'leads'
  business_hours_population: number
  response_numeric: number
  response_missing: number
  median_response_min: number | null
  store_median_min: number | null
  untouched_strict: number
  reps_with_numeric: number
  triggered_reps: number
  triggered_rep_sample_sizes: Array<number>
  max_rep_mean_min: number | null
  // SW-090 — total accepted Leads rows + rows with a BLANK Sales Rep (no assigned
  // salesperson). Aggregate counts only; a Sales Rep NAME is never retained.
  total_rows: number
  unassigned_sales_rep: number
  dealer_ids: Array<string>
  sales_only_proof: string
}

function hasXlsxMagic(buf: Buffer): boolean {
  if (buf.length < XLSX_MAGIC.length) return false
  for (let i = 0; i < XLSX_MAGIC.length; i++)
    if (buf[i] !== XLSX_MAGIC[i]) return false
  return true
}

function numOrNull(v: string): number | null {
  if (v === '' || v.trim() === '' || v.trim() === '-') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const isBlank = (v: string | undefined): boolean =>
  v === undefined || v.trim() === ''

/** Median of a numeric array (even length -> mean of the two middle values). */
export function median(xs: Array<number>): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

const REQUIRED_HEADERS = [
  'Dealer ID',
  'Actual Response Time (Min)',
  'Originated After Hours',
  'First Contact Attempt',
  'First Customer Contact',
  'Sales Rep',
]

export function readLeadsMetrics(
  buf: Buffer,
  expectedDealerId: string,
): LeadsMetrics {
  if (!hasXlsxMagic(buf))
    throw new LeadsMetricsError('leads: bad XLSX magic bytes')
  const { sheets } = readXlsx(buf, {}, { rawDates: true })
  const rows = sheets[0].rows
  const header = rows[0] ?? []
  const missing = REQUIRED_HEADERS.filter((h) => header.indexOf(h) < 0)
  if (missing.length)
    throw new LeadsMetricsError(`leads missing headers: ${missing.join(', ')}`)
  const h = (name: string) => header.indexOf(name)
  const iDealer = h('Dealer ID')
  const iRt = h('Actual Response Time (Min)')
  const iAh = h('Originated After Hours')
  const iFca = h('First Contact Attempt')
  const iFcc = h('First Customer Contact')
  const iRep = h('Sales Rep')
  // Scan ONLY the Sales-only categorical columns for Service/Parts (never customer/vehicle).
  const scanIdx = CATEGORICAL_SERVICE_SCAN_COLUMNS.map((c) =>
    header.indexOf(c),
  ).filter((i) => i >= 0)

  const data = rows.filter((r, i) => i > 0 && r.some((c) => c.trim() !== ''))
  const dealerIds = new Set<string>()
  for (const r of data) {
    for (const i of scanIdx) {
      const v = r[i] ?? ''
      if (SERVICE_PARTS_TOKEN.test(v)) {
        throw new LeadsMetricsError(
          `leads: Service/Parts token in categorical column: "${v.slice(0, 50)}"`,
        )
      }
    }
    dealerIds.add((r[iDealer] ?? '').trim())
  }
  const ids = [...dealerIds]
  if (ids.length !== 1 || ids[0] !== expectedDealerId) {
    throw new LeadsMetricsError(
      `leads dealer identity: expected only ${expectedDealerId}, saw ${JSON.stringify(ids)}`,
    )
  }

  // Governed business-hours population = Originated After Hours == No.
  const pop = data.filter((r) => (r[iAh] ?? '').trim().toLowerCase() === 'no')
  const numericResponses = pop
    .map((r) => numOrNull(r[iRt] ?? ''))
    .filter((x): x is number => x !== null)
  const responseMissing = pop.length - numericResponses.length
  const med = median(numericResponses)

  // SW-012 strict untouched (all three touch signals blank, within the population).
  const untouched = pop.filter(
    (r) =>
      isBlank(r[iFca]) && isBlank(r[iFcc]) && numOrNull(r[iRt] ?? '') === null,
  ).length

  // SW-015 per-rep means over numeric responses in the population (names never retained).
  const byRep = new Map<string, Array<number>>()
  for (const r of pop) {
    const rt = numOrNull(r[iRt] ?? '')
    const rep = (r[iRep] ?? '').trim()
    if (rt !== null && rep !== '') {
      const arr = byRep.get(rep) ?? []
      arr.push(rt)
      byRep.set(rep, arr)
    }
  }
  const repMeans = [...byRep.values()].map((v) => ({
    n: v.length,
    mean: v.reduce((a, b) => a + b, 0) / v.length,
  }))
  const storeMedian = med
  const triggered =
    storeMedian === null
      ? []
      : repMeans.filter((x) => x.mean >= 2 * storeMedian)
  const maxRepMean = repMeans.length
    ? Math.max(...repMeans.map((x) => x.mean))
    : null

  // SW-090 — leads with no assigned salesperson (blank Sales Rep) over ALL accepted rows.
  const unassignedSalesRep = data.filter((r) => isBlank(r[iRep])).length

  return {
    family: 'leads',
    business_hours_population: pop.length,
    response_numeric: numericResponses.length,
    response_missing: responseMissing,
    median_response_min: med,
    store_median_min: storeMedian,
    untouched_strict: untouched,
    reps_with_numeric: repMeans.length,
    triggered_reps: triggered.length,
    triggered_rep_sample_sizes: triggered.map((x) => x.n).sort((a, b) => a - b),
    max_rep_mean_min: maxRepMean,
    total_rows: data.length,
    unassigned_sales_rep: unassignedSalesRep,
    dealer_ids: ids,
    sales_only_proof:
      `${data.length} rows: one rooftop Dealer ID=${expectedDealerId}; zero Service/Parts tokens in ` +
      `categorical columns; business-hours population (Originated After Hours=No)=${pop.length}; ` +
      `Sales Rep aggregated in-memory, no names retained`,
  }
}
