// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { HaloProfileNotAllowedError } from '@/server/reports/halo-report-card'
import { buildM2BReportModel } from '@/server/reports/m2b/report-model'
import { offlineNarrationDeps } from '@/server/reports/m2b/offline-narratives'

const REAL_ROOT = '/srv/ingest-dev/analytics'
const HAVE_DATA = fs.existsSync(`${REAL_ROOT}/serra-honda/brain/brain.db`)
// Fixed clock so freshness/age is deterministic (governed period end 2026-08-30).
const NOW = Date.parse('2026-08-31T12:00:00Z')

describe('M2B report model - Sales-only gate (no data needed)', () => {
  it('fails closed for non-Sales / unknown / traversal-like profiles', async () => {
    for (const bad of ['serra-service', 'unknown-store', 'serra-honda/../serra-service', '']) {
      await expect(buildM2BReportModel(bad, { now: NOW })).rejects.toThrow(HaloProfileNotAllowedError)
    }
  })
})

describe.runIf(HAVE_DATA)('M2B report model - accepted three-store data', () => {
  const saved = process.env.BRAIN_PROFILES_ROOT
  beforeAll(() => { process.env.BRAIN_PROFILES_ROOT = REAL_ROOT })
  afterAll(() => {
    if (saved === undefined) delete process.env.BRAIN_PROFILES_ROOT
    else process.env.BRAIN_PROFILES_ROOT = saved
  })

  it('serra-honda: 7 supported (NATIVE7) / 3 missing / 10 withheld; gross reconciles; ROI/CAGE/comm withheld', async () => {
    const m = await buildM2BReportModel('serra-honda', { now: NOW, narration: offlineNarrationDeps('serra-honda') })
    expect(m.coverage_counts).toMatchObject({ total: 20, supported: 7, missing: 3, withheld: 10, unsupported: 0 })
    const bySlug = Object.fromEntries(m.ledger.map((r) => [r.slug, r]))
    expect(bySlug['gross.total_sum'].state).toBe('supported')
    expect(bySlug['gross.total_sum'].display).toBe('$14,185.20')
    for (const s of ['appt.show_rate', 'appt.no_show_rate', 'appt.confirmed_rate', 'appt.cancel_rate']) {
      expect(bySlug[s].state).toBe('supported')
    }
    // R2: reconciliation-mismatches (CRM per-deal) + response time (Dashboard) are VALUES.
    expect(bySlug['gross.reconciliation_mismatches'].state).toBe('supported')
    expect(bySlug['gross.reconciliation_mismatches'].display).toBe('0')
    expect(bySlug['dashboard.response_time_actual_avg_min'].state).toBe('supported')
    expect(bySlug['dashboard.response_time_actual_avg_min'].display).toBe('210')
    for (const s of ['roi.total_leads', 'roi.sold_from_leads', 'cage.total_comms', 'comm.escalation_keyword_screen']) {
      expect(bySlug[s].state).toBe('withheld')
      expect(bySlug[s].reason && bySlug[s].reason!.length).toBeGreaterThan(0)
    }
    for (const s of ['engagement.reply_rate', 'engagement.conversations', 'engagement.resurrections']) {
      expect(bySlug[s].state).toBe('missing')
      expect(bySlug[s].display).toBeNull()
    }
    // three comparison layers carried on each ledger row
    expect(bySlug['appt.show_rate'].industry.state).toBe('directional_non_scoring')
    expect(bySlug['gross.total_sum'].industry.state).toBe('no_benchmark')
    expect(bySlug['appt.show_rate'].baseline.state).toBe('insufficient_history')
    expect(bySlug['appt.show_rate'].periods_on_file).toBe(1)
    expect(bySlug['roi.total_leads'].periods_on_file).toBe(0)

    // native dp present + Front+Back reconciles to Total
    expect(m.native_performance.dealership_performance.available).toBe(true)
    if (m.native_performance.dealership_performance.available) {
      const rec = m.native_performance.dealership_performance.reconciliation
      expect(rec.reconciles).toBe(true)
      expect(Math.abs(rec.delta)).toBeLessThanOrEqual(0.01)
    }
    expect(m.native_performance.appointments.available).toBe(true)
    expect(m.overall_freshness.freshness).toBe('fresh')
    expect(m.overall_freshness.age_days).toBe(0)
    // CRM Sales Gross (gross precedence) is now listed alongside appointments + dashboard.
    expect(m.evidence_manifest.sources.map((s) => s.family).sort()).toEqual(['appointments', 'crm_sales_gross', 'dealership_performance'])
    for (const s of m.evidence_manifest.sources) expect(s.checksum.length).toBe(64)
  })

  it('offline AI narration validates -> ai_grounded, provider claude-code-offline, acceptance MET', async () => {
    const m = await buildM2BReportModel('serra-honda', { now: NOW, narration: offlineNarrationDeps('serra-honda') })
    expect(m.narrative_mode).toBe('ai_grounded')
    expect(m.narrative_provider).toBe('claude-code-offline')
    expect(m.ai_narrative_acceptance).toBe('met')
    expect(m.narrative_fallback_reason).toBeNull()
    expect(m.narrative_claims && m.narrative_claims.length).toBeGreaterThan(0)
    // every claim cites at least one real catalog slug and grounds its numbers
    const slugs = new Set(m.ledger.map((r) => r.slug))
    for (const c of m.narrative_claims ?? []) {
      expect(c.evidence.length).toBeGreaterThan(0)
      for (const e of c.evidence) expect(slugs.has(e)).toBe(true)
    }
    // the AI narrative carries the exact supported values
    expect(m.narrative).toContain('$14,185.20')
    expect(m.narrative).toContain('57.1%')
  })

  it('without a provider, narration falls back deterministic and AI acceptance is UNMET', async () => {
    // No narration deps -> real completeChat -> unconfigured in the isolated instance.
    const m = await buildM2BReportModel('serra-nissan', { now: NOW })
    expect(m.narrative_mode).toBe('deterministic_grounded')
    expect(m.ai_narrative_acceptance).toBe('unmet')
    expect(m.narrative_provider).toBe('none')
    expect(m.narrative_fallback_reason).toBe('provider_unconfigured')
  })

  it('serra-nissan: 7 supported (NATIVE7 incl. appointments); real values, not zero; reconciles', async () => {
    const m = await buildM2BReportModel('serra-nissan', { now: NOW, narration: offlineNarrationDeps('serra-nissan') })
    expect(m.coverage_counts.supported).toBe(7)
    const bySlug = Object.fromEntries(m.ledger.map((r) => [r.slug, r]))
    expect(bySlug['gross.total_sum'].display).toBe('$13,224.00')
    expect(bySlug['appt.show_rate'].display).toBe('33.3%')
    expect(bySlug['appt.no_show_rate'].display).toBe('50.0%')
    expect(bySlug['dashboard.response_time_actual_avg_min'].display).toBe('238')
    expect(m.native_performance.appointments.available).toBe(true)
    expect(m.narrative_mode).toBe('ai_grounded')
  })

  it('tony-serra-ford: 7 supported (NATIVE7); gross $1,600.99; nothing fabricated; offline narrative grounded', async () => {
    const m = await buildM2BReportModel('tony-serra-ford', { now: NOW, narration: offlineNarrationDeps('tony-serra-ford') })
    expect(m.coverage_counts.supported).toBe(7)
    const bySlug = Object.fromEntries(m.ledger.map((r) => [r.slug, r]))
    expect(bySlug['gross.total_sum'].display).toBe('$1,600.99')
    expect(bySlug['dashboard.response_time_actual_avg_min'].display).toBe('317')
    // Missing/withheld are never rendered as zero (a genuine supported 0, e.g. recon, is allowed).
    for (const r of m.ledger) {
      if (r.state !== 'supported' && r.display !== null) expect(r.display).not.toBe('0')
    }
    expect(m.native_performance.dealership_performance.available).toBe(true)
    expect(m.native_performance.appointments.available).toBe(true)
    expect(m.narrative_mode).toBe('ai_grounded')
    expect(m.narrative).toContain('$1,600.99')
  })

  it('missing-not-zero invariant: no missing/withheld row displays a zero', async () => {
    for (const p of ['serra-honda', 'serra-nissan', 'tony-serra-ford']) {
      const m = await buildM2BReportModel(p, { now: NOW, narration: offlineNarrationDeps(p) })
      for (const r of m.ledger) {
        if (r.state !== 'supported') expect(r.display === null || r.display === '').toBe(true)
      }
    }
  })
})
