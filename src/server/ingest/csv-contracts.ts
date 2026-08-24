/**
 * Brain-free CSV contracts for the HOLD_ONLY layer (HUM-VIN-006).
 *
 * The analytical originals live in src/server/report-ingest.ts, but that module is
 * Brain-coupled (imports brain-store / writes report_* tables). The hold-only layer
 * must keep ZERO Brain imports, so — per controller decision — this is an isolated,
 * intentionally-duplicated mirror of ONLY the two deterministic CSV contracts and
 * the pure parsing/coercion/detection they need. No I/O, no Brain, no Watchdog.
 *
 * DEBT: controlled duplication of the ROI/KPI header contracts. If the analytical
 * contracts in report-ingest.ts change, update these in lockstep. Recorded in
 * issues.md.
 */

export type CsvKind = 'lead_source_roi' | 'kpi_salesperson'
export type Coerce = (raw: string | undefined) => number | null
type ColSpec = { col: string; coerce: Coerce }

// ── CSV (RFC-4180-ish): quoted fields, embedded commas, "" escapes ──────────
export function parseCsv(text: string): Array<Array<string>> {
  const rows: Array<Array<string>> = []
  let row: Array<string> = []
  let field = ''
  let inQuotes = false
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else field += c
      continue
    }
    if (c === '"') inQuotes = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c === '\r') { /* swallow */ }
    else field += c
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

// ── value coercion ──────────────────────────────────────────────────────────
export function coerceInt(raw: string | undefined): number | null {
  if (raw == null) return null
  const t = raw.replace(/[",\s]/g, '').trim()
  if (t === '' || t === '-') return null
  const n = parseInt(t, 10)
  return Number.isFinite(n) ? n : null
}
export function coerceReal(raw: string | undefined): number | null {
  if (raw == null) return null
  const t = raw.replace(/[",\s]/g, '').trim()
  if (t === '' || t === '-') return null
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : null
}
export function coercePct(raw: string | undefined): number | null {
  if (raw == null) return null
  const t = raw.replace(/[%",\s]/g, '').trim()
  if (t === '' || t === '-') return null
  const n = parseFloat(t)
  return Number.isFinite(n) ? n / 100 : null
}
export function coerceCurrency(raw: string | undefined): number | null {
  if (raw == null) return null
  let t = raw.replace(/[$,\s"]/g, '').trim()
  if (t === '' || t === '-') return null
  let sign = 1
  if (/^\(.*\)$/.test(t)) { sign = -1; t = t.slice(1, -1) }
  const n = parseFloat(t)
  return Number.isFinite(n) ? sign * n : null
}

// ── the two deterministic contracts (mirror of report-ingest.ts) ────────────
const ROI_COLUMNS: Record<string, ColSpec> = {
  Total_Leads: { col: 'total_leads', coerce: coerceInt },
  Good_Leads: { col: 'good_leads', coerce: coerceInt },
  Bad_Leads: { col: 'bad_leads', coerce: coerceInt },
  Duplicate_Leads: { col: 'duplicate_leads', coerce: coerceInt },
  Bad_Other_Leads: { col: 'bad_other_leads', coerce: coerceInt },
  Customers_Influenced: { col: 'customers_influenced', coerce: coerceInt },
  Sold_in_Timeframe: { col: 'sold_in_timeframe', coerce: coerceInt },
  Sold_in_Timeframe_Pct: { col: 'sold_in_timeframe_pct', coerce: coercePct },
  Sold_from_Leads: { col: 'sold_from_leads', coerce: coerceInt },
  Sold_from_Leads_Pct: { col: 'sold_from_leads_pct', coerce: coercePct },
  Avg_Days_to_Sale: { col: 'avg_days_to_sale', coerce: coerceReal },
  Internet_Attempted_Contact: { col: 'internet_attempted_contact', coerce: coerceInt },
  Internet_Attempted_Contact_Pct: { col: 'internet_attempted_contact_pct', coerce: coercePct },
  Internet_Actual_Contact: { col: 'internet_actual_contact', coerce: coerceInt },
  Internet_Actual_Contact_Pct: { col: 'internet_actual_contact_pct', coerce: coercePct },
  Internet_Avg_Attempts_to_Contact: { col: 'internet_avg_attempts_to_contact', coerce: coerceReal },
  Appts_Set: { col: 'appts_set', coerce: coerceInt },
  Appts_Set_Pct: { col: 'appts_set_pct', coerce: coercePct },
  Appts_Scheduled: { col: 'appts_scheduled', coerce: coerceInt },
  Appts_Scheduled_Pct: { col: 'appts_scheduled_pct', coerce: coercePct },
  Appts_Confirmed: { col: 'appts_confirmed', coerce: coerceInt },
  Appts_Confirmed_Pct: { col: 'appts_confirmed_pct', coerce: coercePct },
  Appts_Shown: { col: 'appts_shown', coerce: coerceInt },
  Appts_Shown_Pct: { col: 'appts_shown_pct', coerce: coercePct },
  Avg_Days_to_Appt_Set: { col: 'avg_days_to_appt_set', coerce: coerceReal },
  Total_Visits: { col: 'total_visits', coerce: coerceInt },
  Initial_Visits: { col: 'initial_visits', coerce: coerceInt },
  Be_Back_Visits: { col: 'be_back_visits', coerce: coerceInt },
  Avg_Days_to_Initial_Visit: { col: 'avg_days_to_initial_visit', coerce: coerceReal },
  Avg_Days_Initial_Visit_to_Be_Back: { col: 'avg_days_initial_visit_to_be_back', coerce: coerceReal },
  Total_Front_Gross: { col: 'total_front_gross', coerce: coerceCurrency },
  Avg_Front_Gross: { col: 'avg_front_gross', coerce: coerceCurrency },
  Total_Back_Gross: { col: 'total_back_gross', coerce: coerceCurrency },
  Avg_Back_Gross: { col: 'avg_back_gross', coerce: coerceCurrency },
  Total_Gross: { col: 'total_gross', coerce: coerceCurrency },
  Avg_Gross: { col: 'avg_gross', coerce: coerceCurrency },
  Total_Cost: { col: 'total_cost', coerce: coerceCurrency },
  Cost_Per_Good_Lead: { col: 'cost_per_good_lead', coerce: coerceCurrency },
  Cost_Per_Sold: { col: 'cost_per_sold', coerce: coerceCurrency },
  Profit: { col: 'profit', coerce: coerceCurrency },
}
const KPI_COLUMNS: Record<string, ColSpec> = {
  Internet_Leads: { col: 'internet_leads', coerce: coerceInt },
  Internet_Leads_Sold_Pct: { col: 'internet_leads_sold_pct', coerce: coercePct },
  Internet_Actual_Contact: { col: 'internet_actual_contact', coerce: coerceInt },
  Internet_Actual_Contact_Pct: { col: 'internet_actual_contact_pct', coerce: coercePct },
  Appts_Set: { col: 'appts_set', coerce: coerceInt },
  Appts_Set_Pct: { col: 'appts_set_pct', coerce: coercePct },
  Appts_Shown: { col: 'appts_shown', coerce: coerceInt },
  Appts_Shown_Pct: { col: 'appts_shown_pct', coerce: coercePct },
  Appts_Shown_Sold: { col: 'appts_shown_sold', coerce: coerceInt },
  Appts_Shown_Sold_Pct: { col: 'appts_shown_sold_pct', coerce: coercePct },
  Calls_Out: { col: 'calls_out', coerce: coerceInt },
  Emails_Out: { col: 'emails_out', coerce: coerceInt },
  Texts_Out: { col: 'texts_out', coerce: coerceInt },
  Total_Comms: { col: 'total_comms', coerce: coerceInt },
}

/** Deterministic detection by unambiguous header signature (mirror of
 *  report-ingest.detectReportKind). Returns null when not a known family. */
export function detectCsvKind(headers: Array<string>): CsvKind | null {
  const set = new Set(headers.map((h) => h.trim()))
  if (set.has('Salesperson') && set.has('Total_Comms')) return 'kpi_salesperson'
  if (set.has('Lead_Source') && set.has('Total_Leads')) return 'lead_source_roi'
  return null
}

export function knownColumnsFor(kind: CsvKind): Record<string, ColSpec> {
  return kind === 'kpi_salesperson' ? KPI_COLUMNS : ROI_COLUMNS
}

/** Identity + value columns recognised for a family (rest are ignored, reported). */
export function classifyCsvHeaders(kind: CsvKind, headers: Array<string>): { recognized: Array<string>; ignored: Array<string> } {
  const cols = knownColumnsFor(kind)
  const identity = kind === 'kpi_salesperson' ? ['Dealer', 'Salesperson'] : ['Dealer', 'Lead_Source']
  const known = new Set<string>([...Object.keys(cols), ...identity])
  const trimmed = headers.map((h) => h.trim()).filter((h) => h.length > 0)
  return { recognized: trimmed.filter((h) => known.has(h)), ignored: trimmed.filter((h) => !known.has(h)) }
}

const SERVICE_PARTS_RE = /\b(service|parts)\b/i
export const isServiceParts = (v: string | undefined): boolean => SERVICE_PARTS_RE.test(v ?? '')

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Pure dealer match (mirror of report-ingest.dealerMatches): every token of the
 *  configured name must appear in the CSV dealer; a single common token must be exact. */
export function dealerMatches(configDealer: string, csvDealer: string): boolean {
  const cfg = norm(configDealer)
  const csv = norm(csvDealer)
  if (!cfg || !csv) return false
  if (cfg === csv) return true
  const csvTokens = new Set(csv.split(' '))
  const cfgTokens = cfg.split(' ').filter(Boolean)
  return cfgTokens.length >= 2 && cfgTokens.every((t) => csvTokens.has(t))
}
