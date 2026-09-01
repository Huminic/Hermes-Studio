/**
 * Non-PII synthetic Leads workbook/provenance builders for tests. No customer
 * data: benign placeholder ids/sources only. Used to exercise the fail-closed
 * classifier/reader deterministically without the real (PII-bearing) files.
 */
import { createHash } from 'node:crypto'
import { makeXlsx, makeXlsxSheets } from './make-xlsx'
import type { LeadsProvenance } from '@/server/reports/leads/leads-classifier'
import { LEADS_HEADERS } from '@/server/reports/leads/leads-family-contract'

export type LeadSpec = Partial<{
  id: string
  dealer: string
  dealerId: string
  source: string
  type: string
  sourceGroup: string
  status: string
  statusCustom: string
  statusType: string
  actual: string
  adjusted: string
  inventoryType: string
  orig: string
  firstContact: string
  sold: string
  extra: string // non-blank cell placed beyond the 57-column grid (col 57)
}>

export type LeadsDefaults = { dealer: string; dealerId: string; orig?: string }

export const IDENTITY = {
  'serra-honda': { dealer: 'Serra Honda of Sylacauga', dealerId: '21043' },
  'serra-nissan': { dealer: 'Serra Nissan of Sylacauga', dealerId: '21044' },
  'tony-serra-ford': { dealer: 'Tony Serra Ford', dealerId: '21047' },
} as const

const H = [...LEADS_HEADERS]
const col = (n: string) => H.indexOf(n)

/** Build a header+data matrix for a Leads workbook. */
export function leadsRows(
  leads: Array<LeadSpec>,
  defaults: LeadsDefaults,
): Array<Array<string>> {
  const rows: Array<Array<string>> = [[...H]]
  leads.forEach((l, i) => {
    const r = new Array(H.length).fill('')
    r[col('Lead ID')] = l.id ?? String(1000 + i)
    r[col('Dealer')] = l.dealer ?? defaults.dealer
    r[col('Dealer ID')] = l.dealerId ?? defaults.dealerId
    r[col('Lead Source')] = l.source ?? 'Autotrader.Com - Lead'
    r[col('Lead Type')] = l.type ?? 'Internet'
    r[col('Lead Source Group')] = l.sourceGroup ?? 'Third Party'
    r[col('Lead Status')] = l.status ?? 'Working'
    r[col('Lead Status Custom')] = l.statusCustom ?? ''
    r[col('Lead Status Type')] = l.statusType ?? 'Active'
    if (l.actual !== undefined) r[col('Actual Response Time (Min)')] = l.actual
    if (l.adjusted !== undefined)
      r[col('Adjusted Response Time (Min)')] = l.adjusted
    if (l.inventoryType !== undefined)
      r[col('Inventory Type')] = l.inventoryType
    r[col('Lead Origination Date')] = l.orig ?? defaults.orig ?? '2026-08-25'
    if (l.firstContact !== undefined)
      r[col('First Customer Contact')] = l.firstContact
    if (l.sold !== undefined) r[col('Sold Datetime')] = l.sold
    if (l.extra !== undefined) r[H.length] = l.extra // beyond the 57-col grid
    rows.push(r)
  })
  return rows
}

/** Build a valid single-"Export"-sheet Leads workbook buffer. */
export function leadsWorkbook(
  leads: Array<LeadSpec>,
  defaults: LeadsDefaults,
): Buffer {
  return makeXlsx(leadsRows(leads, defaults))
}

export { makeXlsx, makeXlsxSheets }

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex')

/** Build valid provenance for a workbook buffer (declared_sha256 = actual sha),
 *  with all strengthened per-file fields present and no gaps. */
export function leadsProvenance(
  profile: keyof typeof IDENTITY,
  buf: Buffer,
  rows: number,
  overrides: Partial<LeadsProvenance> = {},
): LeadsProvenance {
  const id = IDENTITY[profile]
  const dealerIdShort = id.dealerId
  return {
    capture_id: `VIN-LEADS-20260831-${dealerIdShort}`,
    profile,
    dealer_id: id.dealerId,
    dealer_name: id.dealer,
    source_url:
      'https://reporting-vinsolutions.app.coxautoinc.com/InfoGo/rdPage.aspx?rdReport=VIN.goAnalysisGridReportCenter',
    captured_at: '2026-08-31T23:37:47-04:00',
    declared_report_kind: 'vinsolutions_custom_reporting_leads',
    filter_evidence: {
      filename: 'VIN-LEADS-20260831-filter-evidence.jpeg',
      sha256: 'abc',
    },
    reporting_period: { start: '2026-08-24', end: '2026-08-30' },
    declared_rows: rows,
    declared_sha256: sha256(buf),
    filename: `${profile}-${dealerIdShort}_leads_2026-08-24_2026-08-30.xlsx`,
    ...overrides,
  }
}
