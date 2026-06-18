/**
 * Report ingestion — uploaded VinSolutions ROI / KPI spreadsheets → Brain.
 *
 * The DataStore Brain (per-profile brain.db) is a generic event/entity store;
 * uploaded spreadsheets land as `uploads` rows + RAG embeddings, which is not
 * queryable as metrics. This module parses an uploaded ROI/KPI CSV into the
 * structured report tables documented in docs/dashboard-brain-schema.md so the
 * Dashboard tabs can render real numbers.
 *
 * Scope:
 *   - CSV only (native parser, no new dependency). XLSX is intentionally NOT
 *     handled here — it needs a parser library; ingestReport reports it as an
 *     unsupported format rather than guessing.
 *   - Rows are filtered to the active profile's dealer (the combined exports
 *     carry several dealers; storing all would break tenant isolation).
 *   - Idempotent by (checksum, report_kind): a re-ingest replaces prior rows.
 *
 * No fabrication: only values present in the file are written. Missing/blank
 * cells become NULL.
 */

import { openBrain, now as brainNow, uuid } from './brain-store'
import type { BrainHandle } from './brain-store'
import type { StudioConfig } from '../lib/studio-config'

export type ReportKind = 'lead_source_roi' | 'kpi_salesperson'

export type IngestResult =
  | {
      ok: true
      report_kind: ReportKind
      import_id: string
      dealer: string
      row_count: number
      /** Distinct dealers seen in the file (for operator visibility). */
      dealers_in_file: Array<string>
      replaced_prior: boolean
    }
  | { ok: false; reason: string; rule: string }

// ── CSV (RFC-4180-ish): quoted fields, embedded commas, "" escapes ──────────

/** Parse CSV text into a matrix of string cells. Handles quoted fields with
 *  embedded commas, doubled-quote escapes, and CRLF/LF line endings. */
export function parseCsv(text: string): Array<Array<string>> {
  const rows: Array<Array<string>> = []
  let row: Array<string> = []
  let field = ''
  let inQuotes = false
  // Strip a leading UTF-8 BOM.
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
      continue
    }
    if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (c === '\r') {
      // swallow; the \n (or EOF) closes the row
    } else {
      field += c
    }
  }
  // Flush trailing field/row (file may not end in newline).
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  // Drop fully-empty trailing rows.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

// ── Value coercion ──────────────────────────────────────────────────────────

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

/** "23.08%" → 0.2308 ; "" → null. Stored as a 0–1 fraction. */
export function coercePct(raw: string | undefined): number | null {
  if (raw == null) return null
  const t = raw.replace(/[%",\s]/g, '').trim()
  if (t === '' || t === '-') return null
  const n = parseFloat(t)
  return Number.isFinite(n) ? n / 100 : null
}

/** "$6,070.91" / "($1,200.67)" → number ; "$0.00" → 0 ; "" → null. */
export function coerceCurrency(raw: string | undefined): number | null {
  if (raw == null) return null
  let t = raw.replace(/[$,\s"]/g, '').trim()
  if (t === '' || t === '-') return null
  let sign = 1
  if (/^\(.*\)$/.test(t)) {
    sign = -1
    t = t.slice(1, -1)
  }
  const n = parseFloat(t)
  return Number.isFinite(n) ? sign * n : null
}

// ── Column maps (CSV header → {col, coerce}) ────────────────────────────────

type Coerce = (raw: string | undefined) => number | null
type ColSpec = { col: string; coerce: Coerce }

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

// ── Table DDL (lazy, mirrors the vin_watcher_trigger pattern) ───────────────

export function ensureReportTables(handle: BrainHandle): void {
  handle.exec(`CREATE TABLE IF NOT EXISTS report_imports (
    id TEXT PRIMARY KEY, ts INTEGER, report_kind TEXT, filename TEXT,
    source_upload_id TEXT, checksum TEXT, dealer TEXT,
    period_start TEXT, period_end TEXT, row_count INTEGER, tenant TEXT
  )`)
  handle.exec(`CREATE TABLE IF NOT EXISTS report_lead_source_roi (
    id TEXT PRIMARY KEY, import_id TEXT, dealer TEXT, lead_source TEXT,
    total_leads INTEGER, good_leads INTEGER, bad_leads INTEGER,
    duplicate_leads INTEGER, bad_other_leads INTEGER, customers_influenced INTEGER,
    sold_in_timeframe INTEGER, sold_in_timeframe_pct REAL,
    sold_from_leads INTEGER, sold_from_leads_pct REAL, avg_days_to_sale REAL,
    internet_attempted_contact INTEGER, internet_attempted_contact_pct REAL,
    internet_actual_contact INTEGER, internet_actual_contact_pct REAL,
    internet_avg_attempts_to_contact REAL,
    appts_set INTEGER, appts_set_pct REAL, appts_scheduled INTEGER,
    appts_scheduled_pct REAL, appts_confirmed INTEGER, appts_confirmed_pct REAL,
    appts_shown INTEGER, appts_shown_pct REAL, avg_days_to_appt_set REAL,
    total_visits INTEGER, initial_visits INTEGER, be_back_visits INTEGER,
    avg_days_to_initial_visit REAL, avg_days_initial_visit_to_be_back REAL,
    total_front_gross REAL, avg_front_gross REAL, total_back_gross REAL,
    avg_back_gross REAL, total_gross REAL, avg_gross REAL,
    total_cost REAL, cost_per_good_lead REAL, cost_per_sold REAL, profit REAL,
    period_start TEXT, period_end TEXT, tenant TEXT
  )`)
  handle.exec(`CREATE TABLE IF NOT EXISTS report_kpi_salesperson (
    id TEXT PRIMARY KEY, import_id TEXT, dealer TEXT, lead_type TEXT, salesperson TEXT,
    internet_leads INTEGER, internet_leads_sold_pct REAL,
    internet_actual_contact INTEGER, internet_actual_contact_pct REAL,
    appts_set INTEGER, appts_set_pct REAL, appts_shown INTEGER, appts_shown_pct REAL,
    appts_shown_sold INTEGER, appts_shown_sold_pct REAL,
    calls_out INTEGER, emails_out INTEGER, texts_out INTEGER, total_comms INTEGER,
    period_start TEXT, period_end TEXT, tenant TEXT
  )`)
}

// ── Detection + dealer matching ─────────────────────────────────────────────

/** Detect the report kind from header columns. Returns null if unrecognized. */
export function detectReportKind(headers: Array<string>): ReportKind | null {
  const set = new Set(headers.map((h) => h.trim()))
  if (set.has('Salesperson') && set.has('Total_Comms')) return 'kpi_salesperson'
  if (set.has('Lead_Source') && set.has('Total_Leads')) return 'lead_source_roi'
  return null
}

/** The dealership name to filter rows to: vin.watcher.dealer_name → persona_name. */
export function resolveDealerName(config: StudioConfig): string {
  return (
    config.vin?.watcher?.dealer_name?.trim() ||
    config.branding?.persona_name?.trim() ||
    ''
  )
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** A CSV dealer matches the profile dealer when every token of the (shorter)
 *  configured name appears in the CSV dealer name — "Serra Honda" matches
 *  "Serra Honda of Sylacauga". */
export function dealerMatches(configDealer: string, csvDealer: string): boolean {
  const cfg = norm(configDealer)
  const csv = norm(csvDealer)
  if (!cfg || !csv) return false
  if (cfg === csv) return true
  const csvTokens = new Set(csv.split(' '))
  const cfgTokens = cfg.split(' ').filter(Boolean)
  // Require a multi-token configured name for subset matching; a single common
  // token (e.g. "Serra") must match exactly (handled above) so it can't pull in
  // sibling dealers like "Serra Honda" + "Serra Nissan".
  return cfgTokens.length >= 2 && cfgTokens.every((t) => csvTokens.has(t))
}

// ── Filename period derivation (best-effort, no fabrication) ────────────────

/** Pull an ISO date out of a filename like ..._2026-05-13.csv. */
export function periodFromFilename(filename: string): string | null {
  const m = filename.match(/(\d{4})[-_](\d{2})[-_](\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

// ── Ingest ──────────────────────────────────────────────────────────────────

export type IngestOptions = {
  profile: string
  /** Raw CSV text (already decoded). */
  text: string
  filename: string
  /** Dealership name to filter rows to (resolveDealerName(config)). */
  dealerName: string
  sourceUploadId?: string | null
  checksum?: string | null
  nowMs?: number
  profileRoot?: string
}

export function ingestReport(opts: IngestOptions): IngestResult {
  if (/\.xlsx?$/i.test(opts.filename)) {
    return {
      ok: false,
      rule: 'unsupported-format',
      reason:
        'XLSX is not supported by report ingestion yet — export the report as CSV and re-upload.',
    }
  }
  const matrix = parseCsv(opts.text)
  if (matrix.length < 2) {
    return { ok: false, rule: 'empty', reason: 'No data rows found in the file.' }
  }
  const headers = matrix[0].map((h) => h.trim())
  const kind = detectReportKind(headers)
  if (!kind) {
    return {
      ok: false,
      rule: 'unrecognized',
      reason:
        'Unrecognized report — expected a Lead Source ROI or salesperson KPI export.',
    }
  }
  if (!opts.dealerName) {
    return {
      ok: false,
      rule: 'no-dealer',
      reason:
        'This store has no dealer name configured (comms.dealer_name / branding.persona_name); cannot scope the report.',
    }
  }

  const idx = (name: string) => headers.indexOf(name)
  const dealerIdx = idx('Dealer')
  const ts = opts.nowMs ?? brainNow()
  const period = periodFromFilename(opts.filename)
  const dataRows = matrix.slice(1)

  const dealersInFile = new Set<string>()
  const matched: Array<Array<string>> = []
  for (const r of dataRows) {
    const d = (dealerIdx >= 0 ? r[dealerIdx] : '')?.trim() ?? ''
    if (d) dealersInFile.add(d)
    if (dealerMatches(opts.dealerName, d)) matched.push(r)
  }

  const handle = openBrain(opts.profile, { profileRoot: opts.profileRoot })
  try {
    ensureReportTables(handle)

    // Idempotency: same checksum+kind → drop the prior import's rows first.
    let replaced = false
    if (opts.checksum) {
      const prior = handle.all<{ id: string }>(
        `SELECT id FROM report_imports WHERE checksum = ? AND report_kind = ?`,
        opts.checksum,
        kind,
      )
      for (const p of prior) {
        handle.run(`DELETE FROM report_lead_source_roi WHERE import_id = ?`, p.id)
        handle.run(`DELETE FROM report_kpi_salesperson WHERE import_id = ?`, p.id)
        handle.run(`DELETE FROM report_imports WHERE id = ?`, p.id)
        replaced = true
      }
    }

    const importId = uuid()
    const dealer = opts.dealerName
    let rowCount = 0

    if (kind === 'lead_source_roi') {
      const srcIdx = idx('Lead_Source')
      for (const r of matched) {
        const leadSource = (srcIdx >= 0 ? r[srcIdx] : '')?.trim() ?? ''
        if (!leadSource) continue
        const cols: Record<string, unknown> = {
          id: uuid(),
          import_id: importId,
          dealer: (dealerIdx >= 0 ? r[dealerIdx] : dealer)?.trim() ?? dealer,
          lead_source: leadSource,
          period_start: period,
          period_end: period,
          tenant: opts.profile,
        }
        for (const [header, spec] of Object.entries(ROI_COLUMNS)) {
          const ci = idx(header)
          cols[spec.col] = ci >= 0 ? spec.coerce(r[ci]) : null
        }
        insertRow(handle, 'report_lead_source_roi', cols)
        rowCount++
      }
    } else {
      const spIdx = idx('Salesperson')
      const ltIdx = idx('Lead_Type')
      for (const r of matched) {
        const salesperson = (spIdx >= 0 ? r[spIdx] : '')?.trim() ?? ''
        if (!salesperson) continue
        const cols: Record<string, unknown> = {
          id: uuid(),
          import_id: importId,
          dealer: (dealerIdx >= 0 ? r[dealerIdx] : dealer)?.trim() ?? dealer,
          lead_type: (ltIdx >= 0 ? r[ltIdx] : '')?.trim() ?? null,
          salesperson,
          period_start: period,
          period_end: period,
          tenant: opts.profile,
        }
        for (const [header, spec] of Object.entries(KPI_COLUMNS)) {
          const ci = idx(header)
          cols[spec.col] = ci >= 0 ? spec.coerce(r[ci]) : null
        }
        insertRow(handle, 'report_kpi_salesperson', cols)
        rowCount++
      }
    }

    handle.run(
      `INSERT INTO report_imports
        (id, ts, report_kind, filename, source_upload_id, checksum, dealer, period_start, period_end, row_count, tenant)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      importId,
      ts,
      kind,
      opts.filename,
      opts.sourceUploadId ?? null,
      opts.checksum ?? null,
      dealer,
      period,
      period,
      rowCount,
      opts.profile,
    )

    return {
      ok: true,
      report_kind: kind,
      import_id: importId,
      dealer,
      row_count: rowCount,
      dealers_in_file: Array.from(dealersInFile),
      replaced_prior: replaced,
    }
  } finally {
    handle.close()
  }
}

function insertRow(handle: BrainHandle, table: string, cols: Record<string, unknown>): void {
  const keys = Object.keys(cols).filter((k) => /^[a-z0-9_]+$/.test(k))
  const placeholders = keys.map(() => '?').join(', ')
  const values = keys.map((k) => cols[k] ?? null)
  handle.run(
    `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`,
    ...values,
  )
}
