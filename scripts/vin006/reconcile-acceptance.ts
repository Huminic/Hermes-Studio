/**
 * HUM-VIN-006 acceptance — INDEPENDENT reconciliation of the isolated analytical root.
 *  - Response Times: for each profile, re-derive the metrics from the dry-run derivative FROM
 *    SCRATCH (not via the consumer) and compare to the stored analytical readback; verify the
 *    derivative sha matches. Missing => WITHHELD (never zero).
 *  - Natives: read each profile's brain.db (via listActiveRows) and assert the promoted
 *    deliveries/rows exist. Reads only; no writes.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { parseCsv } from '../../src/server/analytics/promote-response-times'
import { countActiveRows } from '../../src/server/ingest/ingest-delivery-store'

const DRY = '/srv/ingest-dev/dry-run'
const ANALYTICS = '/srv/ingest-dev/analytics'
const PROFILES = ['serra-honda', 'serra-nissan', 'tony-serra-ford']
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex')
let fail = 0
const ok = (c: boolean, m: string) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${m}`); if (!c) fail++ }

// independent RT metric re-derivation (deliberately re-implemented, not the consumer's function).
// Mirrors the corrected contract: response times are excel-day * 1440 minutes; target is categorical.
const round2 = (n: number) => Math.round(n * 100) / 100
const mean = (xs: number[]) => xs.length ? round2(xs.reduce((a, b) => a + b, 0) / xs.length) : null
const med = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? round2(s[m]!) : round2((s[m - 1]! + s[m]!) / 2) }
function rederive(csv: string) {
  const rows = parseCsv(csv), h = rows[0]!, d = rows.slice(1)
  const ci = (n: string) => h.indexOf(n)
  const dayMin = (col: number) => d.map((r) => (r[col] ?? '').trim()).filter((v) => v !== '').map((v) => Number(v) * 1440)
  const actual = dayMin(ci('responseTimeActual')), adjusted = dayMin(ci('responseTimeAdjusted'))
  const it = ci('responseTimeTarget')
  const tc: Record<string, number> = { 'Target 1': 0, 'Target 2': 0, 'Missed': 0, 'No Contact': 0, other: 0 }
  for (const r of d) { const t = (r[it] ?? '').trim(); if (t === '') continue; if (t in tc && t !== 'other') tc[t]! += 1; else tc.other! += 1 }
  const nb = (name: string) => { const i = ci(name); return d.filter((r) => (r[i] ?? '').trim() !== '').length }
  return {
    leads_total: d.length, responded: actual.length,
    response_time_actual_avg_min: mean(actual), response_time_actual_median_min: med(actual),
    response_time_adjusted_avg_min: mean(adjusted), response_time_adjusted_median_min: med(adjusted),
    target_category_counts: tc, sold_count: nb('soldDateUtc'), appointment_count: nb('appointmentUtc'), unanswered_count: nb('unansweredCommunication.taskAgeInDays'),
  }
}

console.log('── Response Times reconciliation ──')
for (const profile of PROFILES) {
  const rbDir = path.join(ANALYTICS, profile, 'response-times')
  if (!fs.existsSync(rbDir)) { console.log(`WITHHELD ${profile}: no RT analytical readback`); continue }
  for (const per of fs.readdirSync(rbDir)) {
    const stored = JSON.parse(fs.readFileSync(path.join(rbDir, per, 'readback.json'), 'utf8'))
    const cap = String(stored.provenance.capture_id)
    const derPath = path.join(DRY, 'inbound', profile, cap, 'response-times-canonical-v1.csv')
    const derBuf = fs.readFileSync(derPath)
    ok(sha256(derBuf) === stored.provenance.derivative_sha256, `${profile} ${per}: derivative sha matches stored provenance`)
    const re = rederive(derBuf.toString('utf8'))
    for (const k of Object.keys(re) as Array<keyof typeof re>) {
      const a = JSON.stringify(re[k]), b = JSON.stringify(stored.metrics[k])
      ok(a === b, `${profile} ${per}: ${k} = ${a} (stored ${b})`)
    }
  }
}

console.log('\n── Native brain.db reconciliation ──')
const EXPECT: Array<[string, string, number]> = [
  ['serra-honda', 'appointments', 18],
  ['serra-honda', 'dealership_performance', 40],
  ['serra-nissan', 'dealership_performance', 40],
]
// profileRoot is the per-profile base (resolveBrainPaths uses it directly, no <profile> join)
const perProfile = (p: string) => path.join(ANALYTICS, p)
for (const [profile, kind, rows] of EXPECT) {
  const n = countActiveRows(profile, { report_kind: kind, profileRoot: perProfile(profile) })
  ok(n === rows, `${profile}/${kind}: ${n} active rows (expect ${rows})`)
}
// withheld: Ford has no native (its Dashboard was the excluded duplicate)
ok(countActiveRows('tony-serra-ford', { profileRoot: perProfile('tony-serra-ford') }) === 0, 'tony-serra-ford: 0 native rows (native withheld, RT-only) — withheld not zero-filled')

console.log(`\n${fail === 0 ? 'RECONCILE: ALL OK' : `RECONCILE: ${fail} MISMATCH`}`)
process.exit(fail === 0 ? 0 : 1)
