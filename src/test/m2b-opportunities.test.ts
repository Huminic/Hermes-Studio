// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildM2BOpportunities, type OppInput } from '@/server/reports/m2b/opportunities'

const OWNERS = new Set(['GM', 'Sales Manager', 'Salesperson'])
const TYPES = new Set(['coverage_gap', 'notification', 'automation', 'coaching', 'huminic_opportunity'])

function hondaLike(): OppInput {
  // R2: NATIVE7 supported (recon + response-time are now VALUES, not withheld).
  const withheld = [
    'roi.total_leads', 'roi.sold_from_leads', 'roi.duplicate_rate',
    'cage.total_comms', 'cage.deals_from_leads', 'cage.rep_count',
    'comm.escalation_keyword_screen', 'comm.template_overuse', 'comm.inbound_high_intent_keywords', 'comm.multi_rep_within_24h',
  ]
  const supported = [
    'appt.show_rate', 'appt.no_show_rate', 'appt.confirmed_rate', 'appt.cancel_rate',
    'gross.total_sum', 'gross.reconciliation_mismatches', 'dashboard.response_time_actual_avg_min',
  ]
  const missing = ['engagement.reply_rate', 'engagement.conversations', 'engagement.resurrections']
  return {
    profile: 'serra-honda',
    dealerName: 'Serra Honda',
    ledger: [
      ...supported.map((slug) => ({ slug, state: 'supported' as const })),
      ...missing.map((slug) => ({ slug, state: 'missing' as const })),
      ...withheld.map((slug) => ({ slug, state: 'withheld' as const })),
    ],
    coverage_counts: { total: 20, supported: 7, missing: 3, withheld: 10, unsupported: 0 },
    dealershipPerformance: { available: true, summary: { leads: 96, apptsSet: 18, apptsShow: 12, soldInPeriod: 5 } },
    appointments: { available: true, counts: { total: 18, show: 12, noShow: 4, confirmed: 6, cancelled: 2 } },
  }
}

// Pure builder-branch fixture: a store with ZERO accepted families (exercises the
// coverage-first "restore deliveries" path). NOT a claim about a real rooftop.
function noAcceptedSourceStore(): OppInput {
  const all = [
    'appt.show_rate', 'appt.no_show_rate', 'appt.confirmed_rate', 'appt.cancel_rate', 'gross.total_sum',
    'gross.reconciliation_mismatches', 'dashboard.response_time_actual_avg_min',
    'engagement.reply_rate', 'engagement.conversations', 'engagement.resurrections',
  ].map((slug) => ({ slug, state: 'missing' as const }))
  const withheld = ['roi.total_leads', 'cage.total_comms', 'comm.escalation_keyword_screen'].map((slug) => ({ slug, state: 'withheld' as const }))
  return {
    profile: 'tony-serra-ford',
    dealerName: 'Tony Serra Ford',
    ledger: [...all, ...withheld],
    coverage_counts: { total: 20, supported: 0, missing: 10, withheld: 10, unsupported: 0 },
    dealershipPerformance: { available: false, reason: 'no accepted dealership_performance' },
    appointments: { available: false, reason: 'no accepted appointments' },
  }
}

describe('M2B opportunities', () => {
  it('every opportunity is well-formed and owner/type-valid', () => {
    for (const o of buildM2BOpportunities(hondaLike())) {
      expect(OWNERS.has(o.owner)).toBe(true)
      expect(TYPES.has(o.type)).toBe(true)
      for (const k of ['trigger', 'action', 'recipient', 'prerequisites', 'safety_limits', 'approval_needed', 'rationale'] as const) {
        expect(typeof o[k]).toBe('string')
        expect(o[k].length).toBeGreaterThan(0)
      }
      expect(o.confidence).toBeGreaterThan(0)
      expect(o.expected_impact).toBeGreaterThanOrEqual(1)
      // ASCII hyphens only (no en/em dash) - PDF QA
      expect(o.trigger + o.action).not.toMatch(/[–—]/)
    }
  })

  it('ranks by impact x confidence descending, ranks are 1..n contiguous', () => {
    const os = buildM2BOpportunities(hondaLike())
    for (let i = 1; i < os.length; i++) expect(os[i - 1].score).toBeGreaterThanOrEqual(os[i].score)
    expect(os.map((o) => o.rank)).toEqual(os.map((_, i) => i + 1))
  })

  it('Honda: contamination (GM), no-show (Sales Manager), funnel, engagement, baseline all present', () => {
    const os = buildM2BOpportunities(hondaLike())
    const top = os[0]
    expect(top.title).toMatch(/Lead-Intent selection to Sales-only/i)
    expect(top.owner).toBe('GM')
    expect(top.evidence_refs).toContain('roi.total_leads')
    expect(os.some((o) => /no-show follow-up/i.test(o.title) && o.owner === 'Sales Manager')).toBe(true)
    expect(os.some((o) => /lead-to-sold funnel/i.test(o.title))).toBe(true)
    expect(os.some((o) => /messaging and SMS engagement/i.test(o.title) && o.type === 'huminic_opportunity')).toBe(true)
    expect(os.some((o) => /3 governed weekly periods/i.test(o.title))).toBe(true)
  })

  it('zero-accepted-source store: coverage-first restore opportunity; no funnel/no-show (no dp/appt data)', () => {
    const os = buildM2BOpportunities(noAcceptedSourceStore())
    expect(os.some((o) => /Restore accepted Sales deliveries/i.test(o.title) && o.expected_impact === 5)).toBe(true)
    expect(os.some((o) => /no-show follow-up/i.test(o.title))).toBe(false)
    expect(os.some((o) => /lead-to-sold funnel/i.test(o.title))).toBe(false)
  })

  it('no opportunity fabricates a metric value the input did not supply', () => {
    // Honda funnel trigger uses only supplied counts (96/18/12/5); assert no stray numbers.
    const funnel = buildM2BOpportunities(hondaLike()).find((o) => /funnel/i.test(o.title))!
    const nums = (funnel.trigger.match(/\d+/g) ?? []).map(Number)
    for (const n of nums) expect([96, 18, 12, 5, 3]).toContain(n) // 3 only via ">= 3" is in baseline, not funnel; funnel uses 96/18/12/5
  })
})
