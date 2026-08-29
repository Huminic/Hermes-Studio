// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { ChatResult } from '@/server/dashboard-ask'
import type { HaloReportCard } from '@/server/reports/halo-report-card'
import {
  narrateHaloReportCard,
  validateAiNarrative,
  allowedNumbersFor,
  buildHaloAiFacts,
  type CompletionFn,
} from '@/server/reports/halo-ai-narrative'

/** A small, realistic Honda-shaped card (2 current values, 1 withheld, 1 no-current). */
function hondaCard(): HaloReportCard {
  return {
    profile: 'serra-honda',
    sales_only: true,
    manifest_version: '1.1.0',
    window_days: 30,
    narrative_mode: 'deterministic_grounded',
    narrative_provider: 'none',
    narrative_fallback_reason: null,
    narrative_claims: null,
    coverage: { total: 4, current_value: 2, no_current_data: 1, withheld: 1 },
    limitations: ['Sales-only: Service and Parts are excluded.'],
    narrative:
      'Halo Data report — serra-honda (Sales only).\n2 of 4 catalog measures have a current governed value.',
    cards: [
      {
        slug: 'gross.total_sum', label: 'Total gross', category: 'Gross', unit: 'currency_usd',
        display: '$12,240.78', current: { state: 'value', value: 12240.78, unit: 'currency_usd' },
        industry: { state: 'no_benchmark', note: 'incompatible grain' },
        baseline: { state: 'insufficient_history', periods_available: 0, needed: 3 },
        provenance: { source: 'dealership_performance', period: { start: '2026-08-17', end: '2026-08-23' }, checksum: 'abc' },
      },
      {
        slug: 'appt.show_rate', label: 'Appointment show rate', category: 'Appointments', unit: 'ratio_0_1',
        display: '66.7%', current: { state: 'value', value: 0.6667, unit: 'ratio_0_1' },
        industry: { state: 'no_benchmark', note: '' },
        baseline: { state: 'insufficient_history', periods_available: 0, needed: 3 },
        provenance: { source: 'appointments', period: { start: '2026-08-17', end: '2026-08-23' } },
      },
      {
        slug: 'roi.total_leads', label: 'Total leads (all sources)', category: 'Leads & ROI', unit: 'count',
        display: null, current: { state: 'withheld', reason: 'Dashboard vs Lead Source ROI diverge' },
        industry: { state: 'no_benchmark', note: '' },
        baseline: { state: 'insufficient_history', periods_available: 0, needed: 3 },
        provenance: null,
      },
      {
        slug: 'engagement.conversations', label: 'Conversations held', category: 'Engagement', unit: 'count',
        display: null, current: { state: 'no_current_data', reason: 'hub has 0 threads' },
        industry: { state: 'no_benchmark', note: '' },
        baseline: { state: 'insufficient_history', periods_available: 0, needed: 3 },
        provenance: null,
      },
    ],
  }
}

/** An all-withheld Ford-shaped card — nothing to narrate but coverage. */
function fordCard(): HaloReportCard {
  return {
    profile: 'tony-serra-ford',
    sales_only: true,
    manifest_version: '1.1.0',
    window_days: 30,
    narrative_mode: 'deterministic_grounded',
    narrative_provider: 'none',
    narrative_fallback_reason: null,
    narrative_claims: null,
    coverage: { total: 19, current_value: 0, no_current_data: 0, withheld: 19 },
    limitations: ['Sales-only.'],
    narrative:
      'Halo Data report — tony-serra-ford (Sales only).\nNo catalog measure has a current governed value for this store/period — every measure is withheld or awaiting data.',
    cards: [
      {
        slug: 'gross.total_sum', label: 'Total gross', category: 'Gross', unit: 'currency_usd',
        display: null, current: { state: 'withheld', reason: 'no accepted delivery' },
        industry: { state: 'no_benchmark', note: '' },
        baseline: { state: 'insufficient_history', periods_available: 0, needed: 3 },
        provenance: null,
      },
    ],
  }
}

/** A CompletionFn that returns a fixed model output as JSON (or raw text). */
function fakeComplete(payload: unknown, opts: { raw?: boolean; via?: 'hermes' | 'openai-direct' } = {}): CompletionFn {
  return async () =>
    ({ ok: true, text: opts.raw ? String(payload) : JSON.stringify(payload), via: opts.via ?? 'hermes' }) as ChatResult
}

describe('Halo AI narration — facts + allowed numbers', () => {
  it('structured facts carry NO raw values beyond aggregates (slug/label/display/states/provenance)', () => {
    const facts = buildHaloAiFacts(hondaCard())
    expect(facts.profile).toBe('serra-honda')
    expect(facts.metrics).toHaveLength(4)
    expect(facts.metrics[0]).toMatchObject({ slug: 'gross.total_sum', display: '$12,240.78', current_state: 'value', provenance_source: 'dealership_performance' })
    // withheld metric exposes state + null display, never a fabricated number
    expect(facts.metrics[2]).toMatchObject({ slug: 'roi.total_leads', display: null, current_state: 'withheld' })
    // no PII / raw conversation fields
    expect(JSON.stringify(facts)).not.toMatch(/phone|email|customer_name|message_body/i)
  })

  it('allowedNumbersFor derives ONLY from facts (displays, coverage, window, periods, baseline)', () => {
    const nums = allowedNumbersFor(hondaCard())
    for (const t of ['30', '4', '2', '1', '12240.78', '66.7', '0', '3', '2026', '08', '17', '23']) {
      expect(nums.has(t)).toBe(true)
    }
    expect(nums.has('99999')).toBe(false)
  })
})

describe('Halo AI narration — success path', () => {
  it('validates a grounded, evidence-referenced narrative → ai_grounded', async () => {
    const complete = fakeComplete({
      summary: '2 of 4 catalog measures have a current governed value; missing measures are withheld or awaiting data.',
      claims: [
        { text: 'Total gross for the native period is $12,240.78.', evidence: ['gross.total_sum'] },
        { text: 'Appointment show rate is 66.7% for the shown period.', evidence: ['appt.show_rate'] },
        { text: 'Total leads is withheld pending a governed reader.', evidence: ['roi.total_leads'] },
      ],
    })
    const n = await narrateHaloReportCard(hondaCard(), { complete })
    expect(n.narrative_mode).toBe('ai_grounded')
    expect(n.narrative_provider).toBe('hermes')
    expect(n.narrative_fallback_reason).toBeNull()
    expect(n.narrative).toContain('$12,240.78')
    expect(n.narrative).toContain('66.7%')
    expect(n.narrative_claims).toHaveLength(3)
  })
})

describe('Halo AI narration — rejection → deterministic fallback', () => {
  const runReject = async (payload: unknown, opts?: { raw?: boolean }) =>
    narrateHaloReportCard(hondaCard(), { complete: fakeComplete(payload, opts) })

  it('rejects a hallucinated number not present in the facts', async () => {
    const n = await runReject({ summary: 'Overview.', claims: [{ text: 'Total gross is $99,999.00.', evidence: ['gross.total_sum'] }] })
    expect(n.narrative_mode).toBe('deterministic_grounded')
    expect(n.narrative_fallback_reason).toMatch(/^hallucinated_number:/)
    expect(n.narrative).toBe(hondaCard().narrative) // fail-closed to deterministic
  })

  it('rejects an unknown evidence reference', async () => {
    const n = await runReject({ summary: 'Overview.', claims: [{ text: 'Total gross looks fine.', evidence: ['gross.made_up'] }] })
    expect(n.narrative_mode).toBe('deterministic_grounded')
    expect(n.narrative_fallback_reason).toBe('unknown_evidence:gross.made_up')
  })

  it('rejects unsupported benchmark / scoring language', async () => {
    const n = await runReject({ summary: 'Gross is above average and beats the industry target.', claims: [] })
    expect(n.narrative_mode).toBe('deterministic_grounded')
    expect(n.narrative_fallback_reason).toBe('unsupported_benchmark_language')
  })

  it('rejects unsupported causal / attribution language', async () => {
    const n = await runReject({ summary: 'Show rate is solid because the team followed up quickly.', claims: [] })
    expect(n.narrative_mode).toBe('deterministic_grounded')
    expect(n.narrative_fallback_reason).toBe('unsupported_causal_language')
  })

  it('rejects a factual (numeric) claim that carries no evidence', async () => {
    const n = await runReject({ summary: 'Overview.', claims: [{ text: 'There are 4 measures on the card.', evidence: [] }] })
    expect(n.narrative_mode).toBe('deterministic_grounded')
    expect(n.narrative_fallback_reason).toBe('unreferenced_numeric_claim')
  })

  it('rejects malformed model output (not JSON of the required shape)', async () => {
    const n = await runReject('this is not json', { raw: true })
    expect(n.narrative_mode).toBe('deterministic_grounded')
    expect(n.narrative_fallback_reason).toBe('model_output_malformed')
  })
})

describe('Halo AI narration — provider unavailable / timeout', () => {
  it('provider unconfigured → deterministic fallback with reason + provider none', async () => {
    const complete: CompletionFn = async () => ({ ok: false, unconfigured: true, error: 'no provider' })
    const n = await narrateHaloReportCard(hondaCard(), { complete })
    expect(n.narrative_mode).toBe('deterministic_grounded')
    expect(n.narrative_provider).toBe('none')
    expect(n.narrative_fallback_reason).toBe('provider_unconfigured')
  })

  it('provider error → deterministic fallback (never leaks upstream error text)', async () => {
    const complete: CompletionFn = async () => ({ ok: false, error: 'HTTP 500 secret-ish detail' })
    const n = await narrateHaloReportCard(hondaCard(), { complete })
    expect(n.narrative_mode).toBe('deterministic_grounded')
    expect(n.narrative_fallback_reason).toBe('provider_error')
    expect(n.narrative).not.toMatch(/secret-ish/)
  })

  it('provider timeout → deterministic fallback with provider_timeout', async () => {
    const complete: CompletionFn = () => new Promise(() => {}) // never resolves
    const n = await narrateHaloReportCard(hondaCard(), { complete, timeoutMs: 15 })
    expect(n.narrative_mode).toBe('deterministic_grounded')
    expect(n.narrative_fallback_reason).toBe('provider_timeout')
  })
})

describe('Halo AI narration — all-withheld Ford stays honest', () => {
  it('a compliant coverage-only narrative is accepted and invents no numbers', async () => {
    const complete = fakeComplete({
      summary: 'No catalog measure has a current governed value; 0 of 19 measures are reported this period.',
      claims: [],
    })
    const n = await narrateHaloReportCard(fordCard(), { complete })
    expect(n.narrative_mode).toBe('ai_grounded')
    // nothing fabricated: no currency/percent tokens exist for an all-withheld store
    expect(n.narrative).not.toMatch(/\$[\d,]+\.\d{2}|\d+(?:\.\d+)?%/)
  })

  it('an invented finding is rejected → deterministic "no current value" is preserved', async () => {
    const complete = fakeComplete({
      summary: 'Total gross reached $5,000.00 this period.',
      claims: [{ text: 'Total gross is $5,000.00.', evidence: ['gross.total_sum'] }],
    })
    const n = await narrateHaloReportCard(fordCard(), { complete })
    expect(n.narrative_mode).toBe('deterministic_grounded')
    expect(n.narrative_fallback_reason).toMatch(/^hallucinated_number:/)
    expect(n.narrative).toMatch(/No catalog measure has a current governed value/i)
  })
})

describe('Halo AI narration — validateAiNarrative is pure/direct-testable', () => {
  it('surfaces a concise reason string, never provider credentials', () => {
    const bad = validateAiNarrative({ summary: 'x', claims: [{ text: 'v is 42', evidence: [] }] }, hondaCard())
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.reason).toBe('unreferenced_numeric_claim')
  })
})
