// @vitest-environment node
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  ALLOWED_LEAD_TYPES,
  BUSINESS_TIMEZONE,
  CAPTURE_ID_RE,
  DASHBOARD_HOST,
  DEALER_IDENTITY,
  EXCLUDED_LEAD_SOURCES,
  EXPECTED_REPORT_KIND,
  LEADS_CLASSIFIER_CHECKS,
  LEADS_COLUMN_COUNT,
  LEADS_FAMILY,
  LEADS_HEADERS,
  REPORTING_HOST,
  REQUIRED_PROVENANCE_FIELDS,
  admitLeadsSourceUrl,
  admitReportingHost,
  evaluateProvenanceCompleteness,
  isManifestAllowlisted,
  parseHost,
} from '@/server/reports/leads/leads-family-contract'

const CONTRACT = JSON.parse(
  fs.readFileSync(
    new URL(
      '../../docs/halo/contract/vinsolutions-custom-reporting-leads-contract.json',
      import.meta.url,
    ),
    'utf8',
  ),
)

describe('Leads family contract', () => {
  it('exact 57-column schema, single source of truth matches the JSON mirror', () => {
    expect(LEADS_COLUMN_COUNT).toBe(57)
    expect(LEADS_HEADERS.length).toBe(57)
    expect(CONTRACT.headers).toEqual([...LEADS_HEADERS])
    expect(CONTRACT.container.column_count).toBe(57)
    expect(CONTRACT.container.sheet_name).toBe('Export')
    expect(CONTRACT.family).toBe(LEADS_FAMILY)
  })

  it('ONE canonical provenance definition: JSON required fields + checks == code (shadow #2)', () => {
    // The JSON contract must list exactly the code REQUIRED_PROVENANCE_FIELDS,
    // including captured_at, declared_report_kind, and filter_evidence.
    expect(CONTRACT.required_provenance_fields).toEqual([
      ...REQUIRED_PROVENANCE_FIELDS,
    ])
    for (const f of [
      'captured_at',
      'declared_report_kind',
      'filter_evidence',
    ]) {
      expect(REQUIRED_PROVENANCE_FIELDS, f).toContain(f)
      expect(CONTRACT.required_provenance_fields, f).toContain(f)
    }
    // The JSON classifier_checks must equal the code single-source-of-truth list.
    expect(CONTRACT.classifier_checks).toEqual([...LEADS_CLASSIFIER_CHECKS])
    expect(CONTRACT.expected_report_kind).toBe(EXPECTED_REPORT_KIND)
    expect(CONTRACT.captured_at_requires_timezone_offset).toBe(true)
  })

  it('filter lists + capture pattern + hosts match the JSON mirror', () => {
    expect(CONTRACT.sales_only_filters.lead_type_in_list).toEqual([
      ...ALLOWED_LEAD_TYPES,
    ])
    expect(CONTRACT.sales_only_filters.lead_source_not_in_list).toEqual([
      ...EXCLUDED_LEAD_SOURCES,
    ])
    expect(CONTRACT.capture_id_pattern).toBe(CAPTURE_ID_RE.source)
    expect(CONTRACT.source.reporting_host).toBe(REPORTING_HOST)
    expect(CONTRACT.rooftop_identity).toEqual(DEALER_IDENTITY)
    expect(EXPECTED_REPORT_KIND).toBe(LEADS_FAMILY)
    expect(BUSINESS_TIMEZONE).toBe('America/New_York')
  })

  it('admitReportingHost accepts BOTH exact official hosts, rejects everything else', () => {
    expect(admitReportingHost(REPORTING_HOST)).toBe(true)
    expect(admitReportingHost(DASHBOARD_HOST)).toBe(true)
    expect(admitReportingHost(`https://${REPORTING_HOST}/InfoGo/x`)).toBe(true)
    // Arbitrary subdomains / suffix / prefix / port / lookalike all fail closed.
    for (const bad of [
      `evil.${REPORTING_HOST}`,
      `${REPORTING_HOST}.evil.com`,
      `reporting-vinsolutions.app.coxautoinc.com.attacker.net`,
      'reporting-vinsolutions-app.coxautoinc.com',
      `${REPORTING_HOST}:8765`,
      'coxautoinc.com',
      'app.coxautoinc.com',
      '',
      'not a host',
      'https://evil.com/reporting-vinsolutions.app.coxautoinc.com',
    ]) {
      expect(admitReportingHost(bad), bad).toBe(false)
    }
  })

  it('admitLeadsSourceUrl requires https + EXACT reporting host + InfoGo path (dashboard host rejected)', () => {
    expect(
      admitLeadsSourceUrl(
        `https://${REPORTING_HOST}/InfoGo/rdPage.aspx?rdReport=X`,
      ),
    ).toBe(true)
    for (const bad of [
      `http://${REPORTING_HOST}/InfoGo/x`, // not https
      `https://${DASHBOARD_HOST}/InfoGo/x`, // dashboard host is not the leads source
      `https://${REPORTING_HOST}/Other/x`, // wrong path
      `https://evil.${REPORTING_HOST}/InfoGo/x`, // subdomain
      REPORTING_HOST, // bare host, no scheme/path
      '',
    ]) {
      expect(admitLeadsSourceUrl(bad), bad).toBe(false)
    }
  })

  it('parseHost normalizes and rejects malformed bare input', () => {
    expect(
      parseHost('HTTPS://Reporting-VinSolutions.App.CoxAutoInc.Com/x'),
    ).toBe(REPORTING_HOST)
    expect(parseHost('host:8765')).toBeNull()
    expect(parseHost('a/b')).toBeNull()
    expect(parseHost('  ')).toBeNull()
  })

  it('capture-id pattern binds the rooftop', () => {
    expect(CAPTURE_ID_RE.exec('VIN-LEADS-20260831-21043')?.[1]).toBe('21043')
    expect(CAPTURE_ID_RE.test('VIN-LEADS-2026-21043')).toBe(false)
    expect(CAPTURE_ID_RE.test('vin-leads-20260831-21043')).toBe(false)
  })

  it('provenance completeness: full manifest fields → no gaps; missing/naive tz → gap', () => {
    const full = {
      capture_id: 'VIN-LEADS-20260831-21043',
      profile: 'serra-honda',
      dealer_id: '21043',
      dealer_name: 'Serra Honda of Sylacauga',
      source_url: `https://${REPORTING_HOST}/InfoGo/x`,
      captured_at: '2026-08-31T23:37:47-04:00',
      declared_report_kind: LEADS_FAMILY,
      filter_evidence: { filename: 'x.jpeg', sha256: 'abc' },
      reporting_period: { start: '2026-08-24', end: '2026-08-30' },
      declared_rows: 119,
      declared_sha256: 'deadbeef',
      filename: 'serra-honda-21043_leads_2026-08-24_2026-08-30.xlsx',
    }
    expect(evaluateProvenanceCompleteness(full).gaps).toEqual([])
    // captured_at without an offset → timezone unproven.
    const naive = evaluateProvenanceCompleteness({
      ...full,
      captured_at: '2026-08-31T23:37:47',
    })
    expect(naive.gaps).toContain('captured_at_timezone')
    // Missing filter evidence → exposed as a gap with guidance.
    const noFe = evaluateProvenanceCompleteness({
      ...full,
      filter_evidence: undefined,
    })
    expect(noFe.gaps).toContain('filter_evidence')
    expect(noFe.needed.filter_evidence).toBeTruthy()
  })

  it('manifest allowlist matches on filename+sha+bytes only', () => {
    const allow = [{ filename: 'a.xlsx', sha256: 'aa', bytes: 10 }]
    expect(
      isManifestAllowlisted(
        { filename: 'a.xlsx', sha256: 'aa', bytes: 10 },
        allow,
      ),
    ).toBe(true)
    expect(
      isManifestAllowlisted(
        { filename: 'a.xlsx', sha256: 'bb', bytes: 10 },
        allow,
      ),
    ).toBe(false)
    expect(
      isManifestAllowlisted(
        { filename: 'other.xlsx', sha256: 'aa', bytes: 10 },
        allow,
      ),
    ).toBe(false)
    expect(
      isManifestAllowlisted(
        { filename: 'a.xlsx', sha256: 'aa', bytes: 11 },
        allow,
      ),
    ).toBe(false)
  })
})
