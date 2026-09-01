// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { buildCommAdmission } from '../../scripts/m1r-comms/build-comm-admission'
import { formatJsonFile } from '../../scripts/m1r-evaluator/serialize'
import type { CommManifestEntry } from '@/server/reports/comms/comm-reader'
import {
  COMM_HEADERS,
  DEALER_IDENTITY,
} from '@/server/reports/comms/comm-family-contract'
import {
  readCommWeekly,
  toAdmissionProof,
} from '@/server/reports/comms/comm-reader'

const REPO = path.resolve(__dirname, '..', '..')
const COMM_DIR = process.env.HALO_COMM_DIR ?? '/tmp/halo-295-comm-20260901'
const HAVE = fs.existsSync(path.join(COMM_DIR, 'capture-manifest.json'))

const PERIOD = {
  start: '2026-08-24',
  end: '2026-08-30',
  timezone: 'America/New_York',
}
const SOURCE_URL = 'https://vinsolutions.app.coxautoinc.com/vinconnect/'
const REPORT_URL =
  'https://reporting-vinsolutions.app.coxautoinc.com/VinAnalyticsDashboards/x'

// ── Synthetic (NON-sensitive) fixture builder. Fake names/content are injected ONLY to prove
//    they cannot leak into the derivative; nothing here is real customer/employee data. ─────
const FAKE_REP = 'RepAliceSmithFAKE'
const FAKE_CUSTOMER = 'CustomerBobJonesFAKE'
const FAKE_BODY = 'SECRETBODYFAKE call 555-867-5309 or bob@example.invalid'

type Row = Record<string, string>
function synthRow(over: Record<string, string>): Row {
  const base: Row = {
    Dealer: 'Serra Honda of Sylacauga',
    'User Group': 'Sales Team',
    User: FAKE_REP,
    Customer: FAKE_CUSTOMER,
    'Dealer ID': '21043',
    'Activity Date': '08/24/2026 09:00 AM',
    Direction: 'Outbound',
    'Comm Channel': 'Text',
    'Comm Type': 'Sales',
    'Interaction Result': 'Contacted',
    'Lead Type': 'Internet',
    'Lead Status Type': 'Active',
    'Lead Status': 'Working',
    'Lead Source Group': 'Third Party',
    'Lead Source': 'AutoTrader',
    'Lead Created Date': '08/24/2026 08:00 AM',
    Make: 'Honda',
    'Message Content': FAKE_BODY,
    'Text Attachment': '',
    'Text Image': '',
    'Text Video': '',
    'Global Customer ID': 'GCID-1',
    'Lead ID': 'LEAD-1',
    'Communication ID': 'COMM-1',
  }
  return { ...base, ...over }
}

function toCsv(rows: Array<Row>): Buffer {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`
  const line = (vals: Array<string>) => vals.map(q).join(',')
  const header = line([...COMM_HEADERS])
  const body = rows
    .map((r) => line(COMM_HEADERS.map((h) => r[h] ?? '')))
    .join('\r\n')
  return Buffer.from('﻿' + header + '\r\n' + body + '\r\n', 'utf8')
}

function entryFor(
  buf: Buffer,
  over: Partial<CommManifestEntry> = {},
): CommManifestEntry {
  return {
    profile: 'serra-honda',
    capture_id: 'VIN-COMM-WEEKLY-20260901-21043',
    dealer: 'Serra Honda of Sylacauga',
    dealer_id: '21043',
    filename: 'synthetic.csv',
    sha256: createHash('sha256').update(buf).digest('hex'),
    bytes: buf.byteLength,
    captured_at: '2026-09-01T04:36:18-04:00',
    rows: 2,
    columns: 24,
    observed_activity_min: '2026-08-24T09:00:00-04:00',
    observed_activity_max: '2026-08-30T14:30:00-04:00',
    unique_communication_ids: 2,
    unique_lead_ids: 2,
    filter_evidence_sha256: 'a'.repeat(64),
    applied_result_evidence_sha256: 'b'.repeat(64),
    ...over,
  }
}

/** A canonical valid 2-row synthetic capture (min + max activity). */
function validCapture(): { buf: Buffer; entry: CommManifestEntry } {
  const rows = [
    synthRow({
      'Communication ID': 'COMM-1',
      'Lead ID': 'LEAD-1',
      'Activity Date': '08/24/2026 09:00 AM',
    }),
    synthRow({
      'Communication ID': 'COMM-2',
      'Lead ID': 'LEAD-2',
      'Global Customer ID': 'GCID-2',
      Direction: 'Inbound',
      'Comm Channel': 'Logged Call',
      'Activity Date': '08/30/2026 02:30 PM',
    }),
  ]
  const buf = toCsv(rows)
  return { buf, entry: entryFor(buf) }
}

const read = (
  buf: Buffer,
  entry: CommManifestEntry,
  over: Partial<Parameters<typeof readCommWeekly>[0]> = {},
) =>
  readCommWeekly({
    buf,
    entry,
    manifestSha: 'm'.repeat(64),
    period: PERIOD,
    sourceUrl: SOURCE_URL,
    reportUrl: REPORT_URL,
    dealerName: DEALER_IDENTITY['serra-honda'].dealer_name,
    ...over,
  })

describe('Enhanced weekly Communication Log — reader validation (Gate 4C1)', () => {
  it('a valid synthetic capture parses to NON-PII aggregates + lineage', () => {
    const { buf, entry } = validCapture()
    const d = read(buf, entry)
    expect(d.aggregates.rows).toBe(2)
    expect(d.aggregates.unique_communication_ids).toBe(2)
    expect(d.aggregates.unique_lead_ids).toBe(2)
    expect(d.aggregates.direction_counts).toEqual({ Outbound: 1, Inbound: 1 })
    expect(d.aggregates.comm_type_counts).toEqual({ Sales: 2 })
    expect(d.lineage.transform_version).toBe('comm-weekly-derive-v1')
    expect(d.lineage.raw_sha256).toBe(entry.sha256)
  })

  it('fails closed on a non-Sales Comm Type row', () => {
    const rows = [
      synthRow({ 'Comm Type': 'Service' }),
      synthRow({
        'Communication ID': 'COMM-2',
        'Activity Date': '08/30/2026 02:30 PM',
      }),
    ]
    const buf = toCsv(rows)
    expect(() => read(buf, entryFor(buf))).toThrow(/non-Sales Comm Type/)
  })

  it('fails closed on a Service token in a categorical field (incl User Group)', () => {
    const rows = [
      synthRow({ 'User Group': 'Service BDC' }),
      synthRow({
        'Communication ID': 'COMM-2',
        'Activity Date': '08/30/2026 02:30 PM',
      }),
    ]
    const buf = toCsv(rows)
    expect(() => read(buf, entryFor(buf))).toThrow(/Service\/Parts/)
  })

  it('fails closed on a wrong-dealer row', () => {
    const rows = [
      synthRow({ 'Dealer ID': '99999' }),
      synthRow({
        'Communication ID': 'COMM-2',
        'Activity Date': '08/30/2026 02:30 PM',
      }),
    ]
    const buf = toCsv(rows)
    expect(() => read(buf, entryFor(buf))).toThrow(/wrong-dealer/)
  })

  it('fails closed on an Activity Date outside the governed window', () => {
    const rows = [
      synthRow({ 'Activity Date': '08/23/2026 09:00 AM' }),
      synthRow({
        'Communication ID': 'COMM-2',
        'Activity Date': '08/30/2026 02:30 PM',
      }),
    ]
    const buf = toCsv(rows)
    expect(() => read(buf, entryFor(buf))).toThrow(/outside window/)
  })

  it('fails closed on a duplicate or blank Communication ID', () => {
    const dup = toCsv([
      synthRow({ 'Communication ID': 'X' }),
      synthRow({
        'Communication ID': 'X',
        'Activity Date': '08/30/2026 02:30 PM',
      }),
    ])
    expect(() => read(dup, entryFor(dup))).toThrow(/duplicate Communication ID/)
    const blank = toCsv([
      synthRow({ 'Communication ID': '' }),
      synthRow({
        'Communication ID': 'C2',
        'Activity Date': '08/30/2026 02:30 PM',
      }),
    ])
    expect(() => read(blank, entryFor(blank))).toThrow(/blank Communication ID/)
  })

  it('fails closed on a wrong schema (23 columns)', () => {
    const bad = Buffer.from('﻿' + '"Dealer","User"\r\n"a","b"\r\n', 'utf8')
    expect(() => read(bad, entryFor(bad))).toThrow(/column count/)
  })
})

describe('Enhanced weekly Communication Log — PII no-leak + adversarial (Gate 4C1)', () => {
  it('raw names / customer / message content CANNOT appear in the derivative', () => {
    const { buf, entry } = validCapture()
    const d = read(buf, entry)
    const blob = JSON.stringify(d)
    for (const secret of [
      FAKE_REP,
      FAKE_CUSTOMER,
      'SECRETBODYFAKE',
      '555-867-5309',
      'bob@example.invalid',
    ])
      expect(blob.includes(secret), secret).toBe(false)
    // No derived-row field carries a name / customer / message text.
    for (const row of d.derived_rows) {
      for (const k of Object.keys(row))
        expect([
          'user',
          'customer',
          'message',
          'name',
          'phone',
          'email',
        ]).not.toContain(k)
      // Content survives ONLY as a length + presence.
      expect(typeof row.content_length).toBe('number')
      expect(typeof row.content_present).toBe('boolean')
    }
    // The committed admission proof drops per-row data entirely.
    const proof = toAdmissionProof(d)
    expect(proof).not.toHaveProperty('derived_rows')
    expect(JSON.stringify(proof).includes(FAKE_REP)).toBe(false)
  })

  it('pseudonyms are one-way, goal-scoped, and rooftop-separated', () => {
    const { buf, entry } = validCapture()
    const d = read(buf, entry)
    for (const row of d.derived_rows) {
      expect(row.rep_token).toMatch(/^[0-9a-f]{16}$/)
      expect(row.thread_token).toMatch(/^[0-9a-f]{16}$/)
      expect(row.rep_token).not.toBe(FAKE_REP)
    }
    // Same rep name in the SAME rooftop → same token (deterministic join).
    expect(d.derived_rows[0].rep_token).toBe(d.derived_rows[1].rep_token)
    // The SAME rep name in a DIFFERENT rooftop → a DIFFERENT token (non-cross-linkable).
    const nRows = [
      synthRow({
        Dealer: 'Serra Nissan of Sylacauga',
        'Dealer ID': '21044',
        'Communication ID': 'N1',
        'Lead ID': 'NL1',
      }),
      synthRow({
        Dealer: 'Serra Nissan of Sylacauga',
        'Dealer ID': '21044',
        'Communication ID': 'N2',
        'Lead ID': 'NL2',
        'Activity Date': '08/30/2026 02:30 PM',
      }),
    ]
    const nBuf = toCsv(nRows)
    const nEntry = entryFor(nBuf, {
      profile: 'serra-nissan',
      capture_id: 'VIN-COMM-WEEKLY-20260901-21044',
      dealer: 'Serra Nissan of Sylacauga',
      dealer_id: '21044',
    })
    const nissan = readCommWeekly({
      buf: nBuf,
      entry: nEntry,
      manifestSha: 'm'.repeat(64),
      period: PERIOD,
      sourceUrl: SOURCE_URL,
      reportUrl: REPORT_URL,
      dealerName: DEALER_IDENTITY['serra-nissan'].dealer_name,
    })
    expect(nissan.derived_rows[0].rep_token).not.toBe(
      d.derived_rows[0].rep_token,
    )
  })

  it('swapping rooftop / period / hash / capture fails closed', () => {
    const { buf, entry } = validCapture()
    // hash swap: declared sha no longer matches the bytes.
    expect(() => read(buf, entryFor(buf, { sha256: 'f'.repeat(64) }))).toThrow(
      /sha mismatch/,
    )
    // rooftop swap: bytes are 21043 but the manifest entry claims 21044 → wrong-dealer.
    expect(() => read(buf, entryFor(buf, { dealer_id: '21044' }))).toThrow(
      /wrong-dealer/,
    )
    // period swap: same bytes validated against a different week → out of window.
    expect(() =>
      read(buf, entry, {
        period: {
          start: '2026-08-17',
          end: '2026-08-23',
          timezone: 'America/New_York',
        },
      }),
    ).toThrow(/outside window/)
    // count swap: manifest claims a different unique-lead count than the bytes.
    expect(() => read(buf, entryFor(buf, { unique_lead_ids: 999 }))).toThrow(
      /unique Lead IDs/,
    )
  })

  it('lineage binds raw sha + manifest sha + capture + rooftop + period + transform', () => {
    const { buf, entry } = validCapture()
    const d = read(buf, entry)
    expect(d.lineage.raw_sha256).toBe(entry.sha256)
    expect(d.lineage.manifest_sha256).toBe('m'.repeat(64))
    expect(d.lineage.capture_id).toBe('VIN-COMM-WEEKLY-20260901-21043')
    expect(d.lineage.dealer_id).toBe('21043')
    expect(d.lineage.reporting_period).toEqual(PERIOD)
    expect(d.lineage.transform_hash).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe.runIf(HAVE)(
  'Enhanced weekly Communication Log — real handoff admission (Gate 4C1)',
  () => {
    it('admission proof recomputes byte-identically + reconciles to the manifest counts', async () => {
      const a = buildCommAdmission(COMM_DIR, REPO)
      const b = buildCommAdmission(COMM_DIR, REPO)
      expect(JSON.stringify(a)).toBe(JSON.stringify(b)) // deterministic
      const committedPath = path.join(
        REPO,
        'docs/halo/evidence/m1r/comms/comm-admission-aggregates.json',
      )
      const expected = await formatJsonFile(a, committedPath)
      expect(expected).toBe(fs.readFileSync(committedPath, 'utf8'))
      // Real counts (controller-verified).
      const o = a as {
        rooftops: Array<{
          aggregates: { profile: string; rows: number; unique_lead_ids: number }
        }>
      }
      const byProfile = Object.fromEntries(
        o.rooftops.map((r) => [r.aggregates.profile, r.aggregates]),
      )
      expect(byProfile['serra-honda'].rows).toBe(1530)
      expect(byProfile['serra-honda'].unique_lead_ids).toBe(386)
      expect(byProfile['serra-nissan'].rows).toBe(760)
      expect(byProfile['serra-nissan'].unique_lead_ids).toBe(237)
      expect(byProfile['tony-serra-ford'].rows).toBe(526)
      expect(byProfile['tony-serra-ford'].unique_lead_ids).toBe(199)
    })

    it('committed admission proof contains NO per-row data and no obvious PII patterns', () => {
      const raw = fs.readFileSync(
        path.join(
          REPO,
          'docs/halo/evidence/m1r/comms/comm-admission-aggregates.json',
        ),
        'utf8',
      )
      expect(raw.includes('derived_rows')).toBe(false)
      // No email/phone patterns in the committed aggregates.
      expect(/@[a-z0-9.-]+\.[a-z]{2,}/i.test(raw)).toBe(false)
      expect(/\b\d{3}[-.]\d{3}[-.]\d{4}\b/.test(raw)).toBe(false)
    })
  },
)
