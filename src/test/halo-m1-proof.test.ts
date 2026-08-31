import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import {
  readAppointments,
  readCrmSalesGross,
  readDealershipPerformance,
} from '@/server/ingest-native-metrics'
import { resolveNativeMetricValues } from '@/server/watchdog/metric-values'
import { createMetricAlert, listNotifications } from '@/server/watchdog/notifications-store'
import { evaluateProfileAlerts, type MetricValues } from '@/server/watchdog/alert-engine'
import { dispatchFiringAlerts } from '@/server/watchdog/alert-dispatch'

const _require = createRequire(import.meta.url)
const Database = _require('better-sqlite3')

/* ── Block 1 — 3-store provenance-backed goldens, CURRENT accepted state (2026-08-24..30).
 *   Real accepted store; read-only. Supersedes the 2026-08-17..23 M1-closure snapshot. ── */
const REAL_ROOT = '/srv/ingest-dev/analytics'
const HAVE_DATA = fs.existsSync(`${REAL_ROOT}/serra-honda/brain/brain.db`)

// Exact resolved NATIVE key set (accepted profile) — no roi.*/cage.*/comm.* leakage.
const NATIVE7 = [
  'appt.cancel_rate',
  'appt.confirmed_rate',
  'appt.no_show_rate',
  'appt.show_rate',
  'dashboard.response_time_actual_avg_min',
  'gross.reconciliation_mismatches',
  'gross.total_sum',
].sort()

const FORBIDDEN_SLUGS = [
  'roi.total_leads', 'roi.sold_from_leads', 'roi.duplicate_rate',
  'cage.rep_count', 'cage.total_comms', 'cage.deals_from_leads',
  'comm.escalation_keyword_screen', 'comm.inbound_high_intent_keywords',
  'comm.template_overuse', 'comm.multi_rep_within_24h',
]

/** Ledger: accepted, non-superseded forbidden-family deliveries in the real store. */
function forbiddenAcceptedCount(profile: string): number {
  const db = new Database(`${REAL_ROOT}/${profile}/brain/brain.db`, { readonly: true })
  try {
    return (
      db
        .prepare(
          `SELECT count(*) AS c FROM ingest_delivery
             WHERE status='accepted' AND superseded_by IS NULL
               AND report_kind IN ('lead_source_roi','cage_kpi','sales_comm_log')`,
        )
        .get() as { c: number }
    ).c
  } finally {
    db.close()
  }
}

type Prov = { available: boolean; provenance?: { reportKind: string; acceptedRows: number; checksum: string; period: { start: string | null; end: string | null } } }
function pinCell(r: Prov, kind: string, rows: number, checksum: string) {
  expect(r.available).toBe(true)
  if (!r.available || !r.provenance) return
  expect(r.provenance.reportKind).toBe(kind)
  expect(r.provenance.period.start).toBe('2026-08-24')
  expect(r.provenance.period.end).toBe('2026-08-30')
  expect(r.provenance.acceptedRows).toBe(rows)
  expect(r.provenance.checksum).toBe(checksum) // exact full checksum from the ledger
}

describe('Halo M1R native goldens — CURRENT accepted store (2026-08-24..30)', () => {
  const saved = process.env.BRAIN_PROFILES_ROOT
  // NOTE: not runIf — this block must ACTUALLY RUN (fail loud, never silently skip).
  const enter = () => { process.env.BRAIN_PROFILES_ROOT = REAL_ROOT }
  const leave = () => { if (saved === undefined) delete process.env.BRAIN_PROFILES_ROOT; else process.env.BRAIN_PROFILES_ROOT = saved }

  it('serra-honda: 3 accepted cells pinned; exact 7-key native set; values; no forbidden leakage', () => {
    expect(HAVE_DATA).toBe(true) // proves the real accepted store is present (block not skipped)
    enter()
    try {
      const dp = readDealershipPerformance('serra-honda')
      const ap = readAppointments('serra-honda')
      const gr = readCrmSalesGross('serra-honda')
      pinCell(dp as Prov, 'dealership_performance', 40, '9613643d5870e44c7acfd297dcfd885cc34f5653479cd30ed3ee21212f6407c9')
      pinCell(ap as Prov, 'appointments', 14, 'e64a5208a2848f1f8738a1ba84272d0c3d5ec31cb39d6d4a38950c59acf757c6')
      pinCell(gr as Prov, 'crm_sales_gross', 5, '8178807561f6b0e50238d923af7f8db1d4ae0c030b9f9073ae3b31a3d2970d9c')

      const v = resolveNativeMetricValues('serra-honda')
      expect([...v.keys()].sort()).toEqual(NATIVE7)
      expect(v.get('gross.total_sum')).toBeCloseTo(14185.2, 2)
      expect(v.get('gross.reconciliation_mismatches')).toBe(0)
      expect(v.get('dashboard.response_time_actual_avg_min')).toBe(210)
      // appt rates use the appointments-family denominator (14) — never Dashboard apptsSet.
      if (ap.available) {
        expect(ap.total).toBe(14)
        expect([ap.show, ap.noShow, ap.confirmed, ap.cancelled]).toEqual([8, 5, 7, 1])
        expect(v.get('appt.show_rate')).toBeCloseTo(8 / 14, 6)
        expect(v.get('appt.no_show_rate')).toBeCloseTo(5 / 14, 6)
        expect(v.get('appt.confirmed_rate')).toBeCloseTo(7 / 14, 6)
        expect(v.get('appt.cancel_rate')).toBeCloseTo(1 / 14, 6)
      }
      // CRM Sales Gross authoritative for gross.total_sum; Dashboard is cross-check, NEVER summed.
      if (gr.available && dp.available) {
        expect(v.get('gross.total_sum')).toBe(gr.totalSum)
        expect(v.get('gross.total_sum')).not.toBe((gr.totalSum ?? 0) + (dp.summary.totalGross ?? 0))
      }
      for (const s of FORBIDDEN_SLUGS) expect(v.has(s)).toBe(false)
      expect(forbiddenAcceptedCount('serra-honda')).toBe(0)
    } finally {
      leave()
    }
  })

  it('serra-nissan: 3 accepted cells pinned; exact 7-key native set; values; no forbidden leakage', () => {
    enter()
    try {
      const dp = readDealershipPerformance('serra-nissan')
      const ap = readAppointments('serra-nissan')
      const gr = readCrmSalesGross('serra-nissan')
      pinCell(dp as Prov, 'dealership_performance', 41, '969ff03d65554d1ab0fe62d1c7b6262375c31b7a7f6b5e2e4f77dfd55ffc7328')
      pinCell(ap as Prov, 'appointments', 6, 'a73f4e379945257e56d7b05e2b340e58fac16b058e79294a0bddbf374ef423bc')
      pinCell(gr as Prov, 'crm_sales_gross', 6, '7a31cee49f220d481292e6ec846d78c95bcd661082f9c3abca9844d466c2e15f')

      const v = resolveNativeMetricValues('serra-nissan')
      expect([...v.keys()].sort()).toEqual(NATIVE7)
      expect(v.get('gross.total_sum')).toBeCloseTo(13224, 2)
      expect(v.get('gross.reconciliation_mismatches')).toBe(0)
      expect(v.get('dashboard.response_time_actual_avg_min')).toBe(238)
      if (ap.available) {
        expect(ap.total).toBe(6)
        expect([ap.show, ap.noShow, ap.confirmed, ap.cancelled]).toEqual([2, 3, 3, 1])
        expect(v.get('appt.show_rate')).toBeCloseTo(2 / 6, 6)
        expect(v.get('appt.no_show_rate')).toBeCloseTo(3 / 6, 6)
        expect(v.get('appt.confirmed_rate')).toBeCloseTo(3 / 6, 6)
        expect(v.get('appt.cancel_rate')).toBeCloseTo(1 / 6, 6)
      }
      if (gr.available && dp.available) {
        expect(v.get('gross.total_sum')).toBe(gr.totalSum)
        expect(v.get('gross.total_sum')).not.toBe((gr.totalSum ?? 0) + (dp.summary.totalGross ?? 0))
      }
      for (const s of FORBIDDEN_SLUGS) expect(v.has(s)).toBe(false)
      expect(forbiddenAcceptedCount('serra-nissan')).toBe(0)
    } finally {
      leave()
    }
  })

  it('tony-serra-ford: 3 accepted cells pinned; values; no leakage; + missing-not-zero & unavailable-denominator negatives', () => {
    enter()
    try {
      const dp = readDealershipPerformance('tony-serra-ford')
      const ap = readAppointments('tony-serra-ford')
      const gr = readCrmSalesGross('tony-serra-ford')
      pinCell(dp as Prov, 'dealership_performance', 41, '2ae6dbbe44027bdf7f63512f10e41ac5cf72a85187a07a31335384b8185584d6')
      pinCell(ap as Prov, 'appointments', 7, '1d52c108925f2ccb8b4faa2e87c5262614bce373eedb8e3c3b875f496e1a16ff')
      pinCell(gr as Prov, 'crm_sales_gross', 7, '98bac42071f70ee0ca86aade3a9c564b108853d4aa56e883fab16b965b3b7689')

      const v = resolveNativeMetricValues('tony-serra-ford')
      expect([...v.keys()].sort()).toEqual(NATIVE7)
      expect(v.get('gross.total_sum')).toBeCloseTo(1600.99, 2)
      expect(v.get('gross.reconciliation_mismatches')).toBe(0)
      expect(v.get('dashboard.response_time_actual_avg_min')).toBe(317)
      if (ap.available) {
        expect(ap.total).toBe(7)
        expect([ap.show, ap.noShow, ap.confirmed, ap.cancelled]).toEqual([3, 4, 3, 0])
        expect(v.get('appt.show_rate')).toBeCloseTo(3 / 7, 6)
        expect(v.get('appt.no_show_rate')).toBeCloseTo(4 / 7, 6)
        expect(v.get('appt.confirmed_rate')).toBeCloseTo(3 / 7, 6)
        expect(v.get('appt.cancel_rate')).toBeCloseTo(0 / 7, 6)
      }
      if (gr.available && dp.available) {
        expect(v.get('gross.total_sum')).toBe(gr.totalSum)
        expect(v.get('gross.total_sum')).not.toBe((gr.totalSum ?? 0) + (dp.summary.totalGross ?? 0))
      }
      for (const s of FORBIDDEN_SLUGS) expect(v.has(s)).toBe(false)
      expect(forbiddenAcceptedCount('tony-serra-ford')).toBe(0)

      // NEGATIVE (missing-not-zero): an absent profile surfaces NOTHING — never a zero.
      expect(resolveNativeMetricValues('halo-m1-proof-no-such-profile').size).toBe(0)

      // NEGATIVE (unavailable denominator): appointments present but total=0 → appt.* withheld.
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'halo-denom0-'))
      const prevRoot = process.env.BRAIN_PROFILES_ROOT
      try {
        process.env.BRAIN_PROFILES_ROOT = tmp
        const dbPath = path.join(tmp, 'z', 'brain', 'brain.db')
        fs.mkdirSync(path.dirname(dbPath), { recursive: true })
        const db = new Database(dbPath)
        db.exec(
          `CREATE TABLE ingest_delivery (id TEXT, profile TEXT, report_kind TEXT, period_start TEXT, period_end TEXT, checksum TEXT, parser_version TEXT, accepted_row_count INTEGER, header_json TEXT, revision INTEGER, status TEXT, superseded_by TEXT);
           CREATE TABLE ingest_row (id TEXT, delivery_id TEXT, profile TEXT, report_kind TEXT, row_index INTEGER, row_json TEXT);`,
        )
        db.prepare(
          `INSERT INTO ingest_delivery (id,profile,report_kind,period_start,period_end,checksum,parser_version,accepted_row_count,header_json,revision,status,superseded_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        ).run('ap0', 'z', 'appointments', '2026-08-24', '2026-08-30', 'c', 'v1', 0,
          JSON.stringify(['Appointment ID', 'Appointment Status', 'Is Completed', 'Is Confirmed', 'Is Show', 'Is No Show', 'Is Cancelled', 'Rescheduled Date']),
          1, 'accepted', null)
        db.close()
        const apZ = readAppointments('z')
        expect(apZ.available).toBe(true)
        if (apZ.available) expect(apZ.total).toBe(0)
        const vz = resolveNativeMetricValues('z')
        for (const s of ['appt.show_rate', 'appt.no_show_rate', 'appt.confirmed_rate', 'appt.cancel_rate']) {
          expect(vz.has(s)).toBe(false) // 0 denominator → withheld, never 0
        }
      } finally {
        if (prevRoot === undefined) delete process.env.BRAIN_PROFILES_ROOT; else process.env.BRAIN_PROFILES_ROOT = prevRoot
        fs.rmSync(tmp, { recursive: true, force: true })
      }
    } finally {
      leave()
    }
  })
})

/* ── Block 2 — a supported Vin metric crosses a threshold through the REAL app alert path,
 *   dispatch DISABLED: internal INERT record only, no transport. The notification record is
 *   SYNTHETIC (temp profile, never a governed store); zero sends. ── */
async function runInert(value: number, now: number) {
  const savedEnv = process.env.BRAIN_PROFILES_ROOT
  const savedTicks = ['OUTBOUND_LIVE_ENABLED', 'COMMS_TICK_ENABLED', 'SENTINEL_TICK_ENABLED'].map(
    (k) => [k, process.env[k]] as const,
  )
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'halo-inert-'))
  process.env.BRAIN_PROFILES_ROOT = tmp
  for (const [k] of savedTicks) delete process.env[k]
  const sender = vi.fn(async () => ({ ok: true as const, email_id: 'must-not-send' }))
  try {
    const created = createMetricAlert(
      {
        profile: 'inert', email: 'inert@fixture.invalid',
        metric_id: 'appt.no_show_rate', metric_label: 'Appointment no-show rate',
        rule_type: 'threshold', direction: 'above', threshold: 0.2,
      },
      now,
    )
    const values: MetricValues = new Map([['appt.no_show_rate', value]])
    const decisions = evaluateProfileAlerts('inert', { values, now })
    const results = await dispatchFiringAlerts('inert', decisions, { now, send: false, sender })
    return {
      createdOk: created.ok,
      firing: decisions.filter((d) => d.decision.fires).length,
      firingMetric: decisions.find((d) => d.decision.fires)?.alert.metric_id,
      results,
      senderCalls: sender.mock.calls.length,
      records: listNotifications('inert').filter((n) => n.metric_id === 'appt.no_show_rate').length,
    }
  } finally {
    if (savedEnv === undefined) delete process.env.BRAIN_PROFILES_ROOT
    else process.env.BRAIN_PROFILES_ROOT = savedEnv
    for (const [k, val] of savedTicks) if (val !== undefined) process.env[k] = val
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

describe('Halo M1R inert alert — supported Vin metric via the real app path (dispatch disabled)', () => {
  it('SYNTHETIC dry-run: a representative 4/18 no-show value fires an inert alert; nothing sent', async () => {
    // Clearly-labeled synthetic value (NOT a governed reading) — proves the alert path is inert.
    const r = await runInert(4 / 18, Date.now())
    expect(r.createdOk).toBe(true)
    expect(r.firing).toBe(1)
    expect(r.firingMetric).toBe('appt.no_show_rate')
    expect(r.results).toEqual([expect.objectContaining({ dry_run: true, sent: false })])
    expect(r.senderCalls).toBe(0)
    expect(r.records).toBe(1) // internal INERT record in a TEMP store, dispatch disabled
  })

  it('REAL-sourced: Honda no-show 5/14 (Aug24 period) fires an inert alert; zero sends, no governed write', async () => {
    expect(HAVE_DATA).toBe(true) // real accepted store present — this test is not skipped
    const savedEnv = process.env.BRAIN_PROFILES_ROOT
    let honda: number | null | undefined
    let periodStart = ''
    process.env.BRAIN_PROFILES_ROOT = REAL_ROOT
    try {
      honda = resolveNativeMetricValues('serra-honda').get('appt.no_show_rate')
      const ap = readAppointments('serra-honda')
      expect(ap.available).toBe(true)
      if (ap.available) periodStart = ap.provenance.period.start ?? ''
    } finally {
      if (savedEnv === undefined) delete process.env.BRAIN_PROFILES_ROOT
      else process.env.BRAIN_PROFILES_ROOT = savedEnv
    }
    // Value + period come from the governed CURRENT accepted appointments delivery, not hard-code.
    expect(typeof honda).toBe('number')
    expect(honda as number).toBeCloseTo(5 / 14, 6)
    expect(periodStart).toBe('2026-08-24')

    const r = await runInert(honda as number, Date.now())
    expect(r.firing).toBe(1)
    expect(r.results).toEqual([expect.objectContaining({ dry_run: true, sent: false })])
    expect(r.senderCalls).toBe(0)
    expect(r.records).toBe(1)
  })
})
