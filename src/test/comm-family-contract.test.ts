// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { formatJsonFile } from '../../scripts/m1r-evaluator/serialize'
import { commContractObject } from '../../scripts/m1r-comms/build-comm-contract'
import {
  CAPTURE_ID_RE,
  COMM_COLUMN_COUNT,
  COMM_HEADERS,
  COMM_WEEKLY_FAMILY,
  LEGACY_STRICT_COMM_FAMILY,
  RESTRICTED_COLUMNS,
  admitReportUrl,
  admitSourceUrl,
  evaluateProvenanceCompleteness,
  parseHost,
} from '@/server/reports/comms/comm-family-contract'

const REPO = path.resolve(__dirname, '..', '..')
const CONTRACT = path.join(
  REPO,
  'docs/halo/contract/enhanced-sales-communication-log-weekly-contract.json',
)

describe('Enhanced weekly Communication Log — family contract (Gate 4C1)', () => {
  it('committed contract JSON is byte-identical to the code mirror (no drift)', async () => {
    const expected = await formatJsonFile(commContractObject(), CONTRACT)
    expect(expected).toBe(fs.readFileSync(CONTRACT, 'utf8'))
  })

  it('is a SEPARATE family from the strict single-day scheduled family', () => {
    expect(COMM_WEEKLY_FAMILY).toBe('enhanced_sales_communication_log_weekly')
    expect(LEGACY_STRICT_COMM_FAMILY).toBe('sales_comm_log')
    expect(COMM_WEEKLY_FAMILY).not.toBe(LEGACY_STRICT_COMM_FAMILY)
  })

  it('declares the exact 24-column schema', () => {
    expect(COMM_COLUMN_COUNT).toBe(24)
    expect(COMM_HEADERS.length).toBe(24)
    expect(COMM_HEADERS[0]).toBe('Dealer')
    expect(COMM_HEADERS[23]).toBe('Communication ID')
    // The PII columns are declared restricted.
    for (const c of ['Customer', 'User', 'Message Content'])
      expect(RESTRICTED_COLUMNS).toContain(c)
  })

  it('admits ONLY the two exact official Cox hosts (evil subdomains / suffixes / ports fail)', () => {
    // Source URL = VinConnect host + /vinconnect/ path.
    expect(
      admitSourceUrl('https://vinsolutions.app.coxautoinc.com/vinconnect/'),
    ).toBe(true)
    // Report URL = reporting host + /VinAnalyticsDashboards/ path.
    expect(
      admitReportUrl(
        'https://reporting-vinsolutions.app.coxautoinc.com/VinAnalyticsDashboards/rdPage.aspx?rdReport=Communication.StandAlone.CommunicationsLog',
      ),
    ).toBe(true)
    // Wrong host for each role fails.
    expect(
      admitSourceUrl(
        'https://reporting-vinsolutions.app.coxautoinc.com/vinconnect/',
      ),
    ).toBe(false)
    expect(
      admitReportUrl('https://vinsolutions.app.coxautoinc.com/vinconnect/'),
    ).toBe(false)
    // Attacks.
    for (const bad of [
      'https://evil.vinsolutions.app.coxautoinc.com/vinconnect/',
      'https://vinsolutions.app.coxautoinc.com.evil.com/vinconnect/',
      'http://vinsolutions.app.coxautoinc.com/vinconnect/',
      'https://vinsolutions.app.coxautoinc.com/other/',
      'https://vinsolutions.app.coxautoinc.com:8443/vinconnect/',
    ])
      expect(admitSourceUrl(bad), bad).toBe(false)
    expect(parseHost('host:8765')).toBeNull()
  })

  it('capture-id pattern binds the rooftop', () => {
    const m = CAPTURE_ID_RE.exec('VIN-COMM-WEEKLY-20260901-21043')
    expect(m?.[1]).toBe('21043')
    expect(CAPTURE_ID_RE.test('VIN-LEADS-20260901-21043')).toBe(false)
    expect(CAPTURE_ID_RE.test('VIN-COMM-WEEKLY-20260901-2104')).toBe(false)
  })

  it('provenance completeness flags every required field + captured_at timezone', () => {
    expect(evaluateProvenanceCompleteness({}).gaps.length).toBeGreaterThan(0)
    const full = {
      capture_id: 'VIN-COMM-WEEKLY-20260901-21043',
      profile: 'serra-honda',
      dealer_id: '21043',
      dealer_name: 'Serra Honda of Sylacauga',
      source_url: 'https://vinsolutions.app.coxautoinc.com/vinconnect/',
      report_url:
        'https://reporting-vinsolutions.app.coxautoinc.com/VinAnalyticsDashboards/x',
      captured_at: '2026-09-01T04:36:18-04:00',
      declared_report_kind: 'enhanced_sales_communication_log_weekly',
      reporting_period: {
        start: '2026-08-24',
        end: '2026-08-30',
        timezone: 'x',
      },
      declared_rows: 1530,
      declared_columns: 24,
      declared_unique_lead_ids: 386,
      declared_sha256: 'x',
      filename: 'x.csv',
      filter_evidence_sha256: 'x',
      applied_result_evidence_sha256: 'x',
    }
    expect(evaluateProvenanceCompleteness(full).gaps).toEqual([])
    // captured_at without a tz offset leaves captured_at_timezone unproven.
    expect(
      evaluateProvenanceCompleteness({
        ...full,
        captured_at: '2026-09-01T04:36:18',
      }).gaps,
    ).toContain('captured_at_timezone')
  })
})
