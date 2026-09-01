// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { buildAcceptedFindings } from '@/server/reports/accepted-findings'
import {
  resolveAcceptedFacts,
  assembleAcceptedFacts,
  AcceptedFactsValidationError,
  NATIVE7,
  type AcceptedFactsBundle,
  type AcceptedFactsSources,
} from '@/server/reports/accepted-facts'
import type { AppointmentsMetrics, CrmSalesGross, DealershipPerformance } from '@/server/ingest-native-metrics'

const REAL_ROOT = '/srv/ingest-dev/analytics'
const HAVE_DATA = fs.existsSync(`${REAL_ROOT}/serra-honda/brain/brain.db`)
const NOW = Date.parse('2026-08-31T12:00:00Z')
const NATIVE7_SET = new Set<string>(NATIVE7)
const QUARANTINED = new Set(['roi.total_leads', 'roi.sold_from_leads', 'roi.duplicate_rate', 'cage.total_comms', 'cage.deals_from_leads', 'cage.rep_count', 'comm.escalation_keyword_screen', 'comm.template_overuse', 'comm.inbound_high_intent_keywords', 'comm.multi_rep_within_24h'])

type Fx = { stores: Record<string, { appointments: unknown; crm: unknown; dashboard: unknown }> }
const FIXTURE: Fx = JSON.parse(fs.readFileSync(new URL('./fixtures/r2-governed-facts.fixture.json', import.meta.url), 'utf8'))
function sourcesFromFixture(profile: string): AcceptedFactsSources {
  const s = FIXTURE.stores[profile]
  return {
    appointments: (s.appointments as AppointmentsMetrics) ?? null,
    crm: (s.crm as CrmSalesGross) ?? null,
    dashboard: (s.dashboard as DealershipPerformance) ?? null,
  }
}
const bundleOf = (profile: string) => assembleAcceptedFacts(profile, sourcesFromFixture(profile), { now: NOW })
const clone = (b: AcceptedFactsBundle): AcceptedFactsBundle => JSON.parse(JSON.stringify(b))

function assertWellFormed(findings: ReturnType<typeof buildAcceptedFindings>, bundle: AcceptedFactsBundle) {
  const accepted = new Set<string>([...bundle.observed_kpis.map((k) => k.slug), ...bundle.accepted_context_facts.map((f) => f.key)])
  for (const f of findings) {
    expect(f.evidence_refs.length).toBeGreaterThan(0)
    for (const e of f.evidence_refs) {
      expect(accepted.has(e)).toBe(true) // resolves to an accepted fact
      expect(QUARANTINED.has(e)).toBe(false) // never a quarantined slug
    }
    expect(f.confidence).toBeGreaterThan(0)
    expect(f.expected_impact).toBeGreaterThanOrEqual(1)
    expect(f.expected_impact).toBeLessThanOrEqual(5)
    for (const k of ['title', 'proves', 'does_not_prove', 'next_action', 'follow_up_metric'] as const) {
      expect(typeof f[k]).toBe('string')
      expect(f[k].length).toBeGreaterThan(0)
    }
    expect(f.inert_notification_preview).toMatch(/INERT/)
    expect(f.inert_automation_preview).toMatch(/INERT/)
    expect(f.title + f.proves + f.does_not_prove + f.next_action).not.toMatch(/[–—]/) // ASCII only
    for (const c of f.fired_conditions) expect(['SW-032', 'SW-041']).toContain(c)
  }
}

describe('accepted findings - branch behavior (durable fixture; no /srv)', () => {
  it('Honda: neither SW fires; positive-control + context findings; no fired conditions', () => {
    const b = bundleOf('serra-honda')
    const findings = buildAcceptedFindings(b)
    expect(findings.every((f) => f.fired_conditions.length === 0)).toBe(true)
    expect(findings.some((f) => f.id === 'appointments-within-ratified-thresholds')).toBe(true)
    expect(findings.some((f) => f.id === 'response-time-context' && f.fired_conditions.length === 0)).toBe(true)
    assertWellFormed(findings, b)
  })

  it('Nissan: SW-032 + SW-041 findings fire; no discrepancy finding', () => {
    const b = bundleOf('serra-nissan')
    const findings = buildAcceptedFindings(b)
    expect(findings.find((f) => f.id === 'sw032-low-show-rate')!.fired_conditions).toEqual(['SW-032'])
    expect(findings.find((f) => f.id === 'sw041-high-no-show-rate')!.fired_conditions).toEqual(['SW-041'])
    expect(findings.some((f) => f.id.startsWith('discrepancy-'))).toBe(false)
    assertWellFormed(findings, b)
  })

  it('Ford: both fire + discrepancy finding (GM/handoff); gross finding notes composites blocked', () => {
    const b = bundleOf('tony-serra-ford')
    const findings = buildAcceptedFindings(b)
    const disc = findings.find((f) => f.id === 'discrepancy-crm_rows_vs_dashboard_sold')!
    expect(disc.owner).toBe('GM')
    expect(disc.lens).toBe('handoff_process')
    expect(findings.find((f) => f.id === 'gross-context-review')!.does_not_prove).toMatch(/blocked/i)
    assertWellFormed(findings, b)
  })

  it('ranks by impact x confidence desc; ranks 1..n contiguous; deterministic', () => {
    const b = bundleOf('tony-serra-ford')
    const a1 = buildAcceptedFindings(b)
    const a2 = buildAcceptedFindings(b)
    expect(a1).toEqual(a2)
    for (let i = 1; i < a1.length; i++) expect(a1[i - 1].score).toBeGreaterThanOrEqual(a1[i].score)
    expect(a1.map((f) => f.rank)).toEqual(a1.map((_, i) => i + 1))
  })
})

describe('accepted findings - ADVERSARIAL fail-closed validation (forged bundles rejected)', () => {
  const base = () => bundleOf('serra-nissan') // valid, both SW fire

  it('rejects a non-Sales / Service-domain profile', () => {
    const b = clone(base()); b.profile = 'serra-service'
    expect(() => buildAcceptedFindings(b)).toThrow(AcceptedFactsValidationError)
  })
  it('rejects sales_only !== true', () => {
    const b = clone(base()); (b as { sales_only: boolean }).sales_only = false
    expect(() => buildAcceptedFindings(b)).toThrow(AcceptedFactsValidationError)
  })
  it('rejects a quarantined SLUG promoted as an observed KPI', () => {
    const b = clone(base())
    b.observed_kpis.push({ ...b.observed_kpis[0], slug: 'roi.total_leads', evidence_ref: 'roi.total_leads' })
    expect(() => buildAcceptedFindings(b)).toThrow(AcceptedFactsValidationError)
  })
  it('rejects a NATIVE7 slug carrying a quarantined SOURCE FAMILY (lead_source_roi)', () => {
    const b = clone(base())
    b.observed_kpis.find((k) => k.slug === 'gross.total_sum')!.compatibility.source_family = 'lead_source_roi'
    expect(() => buildAcceptedFindings(b)).toThrow(AcceptedFactsValidationError)
  })
  it('rejects a forged "gross reconciles" claim with mismatched periods', () => {
    const b = clone(base())
    b.cross_source_gross = { crm_total: 1, dp_total: 2, tolerance: 0.5, periods_match: false, reconciles: true }
    expect(() => buildAcceptedFindings(b)).toThrow(AcceptedFactsValidationError)
  })
  it('rejects an exact condition promoted from a non-fresh appointments family (stale evidence)', () => {
    const b = clone(base())
    const ap = b.family_coverage.find((f) => f.family === 'appointments')!
    ap.fresh = false
    expect(() => buildAcceptedFindings(b)).toThrow(AcceptedFactsValidationError)
  })
  it('rejects an exact condition whose base does not resolve to an accepted fact (unresolved ref)', () => {
    const b = clone(base())
    b.observed_kpis = b.observed_kpis.filter((k) => k.slug !== 'appt.show_rate')
    expect(() => buildAcceptedFindings(b)).toThrow(AcceptedFactsValidationError)
  })
  it('rejects a dealer identity that does not match the profile registry (forged bundle)', () => {
    const b = clone(base()); b.dealer_name = 'Fake Motors'
    expect(() => buildAcceptedFindings(b)).toThrow(AcceptedFactsValidationError)
  })
  it('rejects a tampered compatibility-gate invariant', () => {
    const b = clone(base()); (b.gates as { quarantined_cannot_feed_accepted: boolean }).quarantined_cannot_feed_accepted = false
    expect(() => buildAcceptedFindings(b)).toThrow(AcceptedFactsValidationError)
  })
  it('rejects a non-SHA-256 checksum on an accepted KPI', () => {
    const b = clone(base()); b.observed_kpis[0].compatibility.checksum = 'not-a-real-checksum'
    expect(() => buildAcceptedFindings(b)).toThrow(AcceptedFactsValidationError)
  })
})

describe('accepted findings - mismatch-safe semantics (Blocker 1)', () => {
  it('PERIOD mismatch: no false "governed week" / "sold-count disagreement" / "gross reconciles"', () => {
    const s = sourcesFromFixture('serra-honda')
    const crm = JSON.parse(JSON.stringify(s.crm)) as typeof s.crm
    crm!.provenance.period = { start: '2026-08-17', end: '2026-08-23' } // fresh (age 8) but different period
    const b = assembleAcceptedFacts('serra-honda', { ...s, crm }, { now: NOW })
    const findings = buildAcceptedFindings(b) // honest bundle -> must not throw
    expect(findings.some((f) => f.id === 'discrepancy-period_mismatch_across_families')).toBe(true)
    expect(findings.some((f) => f.id === 'discrepancy-crm_rows_vs_dashboard_sold')).toBe(false)
    const proves = findings.map((f) => f.proves).join(' || ')
    expect(proves).not.toMatch(/same governed week/i)
    expect(proves).not.toMatch(/governed week/i) // period-specific wording is used instead
    expect(proves).not.toMatch(/sold-count/i)
    expect(proves).not.toMatch(/reconciles/i) // no positive reconciliation claim
  })

  it('GROSS mismatch (same period): no sold-count language; block reason is gross, not count', () => {
    const s = sourcesFromFixture('serra-honda')
    const crm = JSON.parse(JSON.stringify(s.crm)) as typeof s.crm
    crm!.totalSum = (crm!.totalSum ?? 0) + 100 // same period, break reconciliation
    const b = assembleAcceptedFacts('serra-honda', { ...s, crm }, { now: NOW })
    const findings = buildAcceptedFindings(b)
    expect(findings.some((f) => f.id === 'discrepancy-crm_vs_dashboard_gross_mismatch')).toBe(true)
    expect(findings.some((f) => f.id === 'discrepancy-crm_rows_vs_dashboard_sold')).toBe(false)
    const proves = findings.map((f) => f.proves).join(' || ')
    expect(proves).not.toMatch(/sold-count/i)
    expect(proves).not.toMatch(/reconciles/i)
    const grossCtx = findings.find((f) => f.id === 'gross-context-review')!
    expect(grossCtx.does_not_prove).toMatch(/do not reconcile/i) // truthful gross block
    expect(grossCtx.does_not_prove).not.toMatch(/sold-count/i)
  })
})

describe.runIf(HAVE_DATA)('accepted findings - /srv read-only integration', () => {
  const saved = process.env.BRAIN_PROFILES_ROOT
  beforeAll(() => { process.env.BRAIN_PROFILES_ROOT = REAL_ROOT })
  afterAll(() => {
    if (saved === undefined) delete process.env.BRAIN_PROFILES_ROOT
    else process.env.BRAIN_PROFILES_ROOT = saved
  })
  const fired = (b: AcceptedFactsBundle) => new Set(buildAcceptedFindings(b).flatMap((f) => f.fired_conditions))

  it('Nissan and Ford fire SW-032 + SW-041; Honda fires neither; no finding cites a quarantined slug', () => {
    expect(fired(resolveAcceptedFacts('serra-honda', { now: NOW }))).toEqual(new Set())
    expect(fired(resolveAcceptedFacts('serra-nissan', { now: NOW }))).toEqual(new Set(['SW-032', 'SW-041']))
    expect(fired(resolveAcceptedFacts('tony-serra-ford', { now: NOW }))).toEqual(new Set(['SW-032', 'SW-041']))
    for (const p of ['serra-honda', 'serra-nissan', 'tony-serra-ford']) {
      for (const f of buildAcceptedFindings(resolveAcceptedFacts(p, { now: NOW }))) {
        for (const e of f.evidence_refs) expect(QUARANTINED.has(e)).toBe(false)
      }
    }
  })
})
