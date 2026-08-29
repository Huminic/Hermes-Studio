// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { HaloReportCardPanel } from '@/components/customer-console/halo-report-card'

function stubFetch(payload: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })),
  )
}

const REPORT = {
  ok: true,
  report: {
    profile: 'serra-honda',
    sales_only: true,
    manifest_version: '1.1.0',
    window_days: 30,
    narrative_mode: 'deterministic_grounded',
    coverage: { total: 19, current_value: 5, no_current_data: 3, withheld: 11 },
    limitations: [
      'Sales-only: Service and Parts are excluded (separate combined Serra Service workspace).',
      '11 measure(s) withheld pending governed readers.',
      'Industry references are directional and NON-SCORING where no definition-compatible standard exists.',
      'Dealer baseline: insufficient history (fewer than 3 governed periods) — non-scoring.',
    ],
    narrative: 'Halo Data report — serra-honda (Sales only).\n5 of 19 catalog measures have a current governed value.',
    cards: [
      { slug: 'gross.total_sum', label: 'Total gross', category: 'Gross', unit: 'currency_usd', display: '$12,240.78', current: { state: 'value', value: 12240.78, unit: 'currency_usd' }, industry: { state: 'no_benchmark', note: 'incompatible grain' }, baseline: { state: 'insufficient_history', periods_available: 0, needed: 3 }, provenance: { source: 'dealership_performance', period: { start: '2026-08-17', end: '2026-08-23' }, checksum: 'abc' } },
      { slug: 'appt.show_rate', label: 'Appointment show rate', category: 'Appointments', unit: 'ratio_0_1', display: '66.7%', current: { state: 'value', value: 0.6667, unit: 'ratio_0_1' }, industry: { state: 'directional_non_scoring', scoring: false, range: '50–65% (vendor-directional)', source_url: 'https://www.demandlocal.com/blog/appointment-setting-show-rate-statistics/', source_type: 'vendor blog (directional)', confidence: 'low', source_published_or_updated: '2026-06-04', verified_on: '2026-08-28', definition_compatibility: 'incompatible', note: 'shows ÷ SET vs ÷ ROWS' }, baseline: { state: 'insufficient_history', periods_available: 0, needed: 3 }, provenance: { source: 'appointments', period: { start: '2026-08-17', end: '2026-08-23' } } },
      { slug: 'roi.total_leads', label: 'Total leads (all sources)', category: 'Leads & ROI', unit: 'count', display: null, current: { state: 'withheld', reason: 'Dashboard vs Lead Source ROI definitions diverge' }, industry: { state: 'no_benchmark', note: '' }, baseline: { state: 'insufficient_history', periods_available: 0, needed: 3 }, provenance: null },
      { slug: 'engagement.conversations', label: 'Conversations held', category: 'Engagement', unit: 'count', display: null, current: { state: 'no_current_data', reason: 'hub has 0 threads' }, industry: { state: 'no_benchmark', note: '' }, baseline: { state: 'insufficient_history', periods_available: 0, needed: 3 }, provenance: null },
    ],
  },
}

describe('HaloReportCardPanel', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('renders identity, coverage, grounded-narrative mode, grouped cards, states, provenance, limitations', async () => {
    stubFetch(REPORT)
    render(<HaloReportCardPanel profile="serra-honda" />)
    await waitFor(() => expect(screen.getByTestId('halo-report')).toBeTruthy())

    // Identity + narrative mode label
    expect(screen.getByTestId('halo-report').textContent).toContain('Halo Data — serra-honda')
    expect(screen.getByTestId('halo-narrative-mode').textContent).toContain('deterministic_grounded')
    // Coverage
    expect(screen.getByTestId('halo-coverage').textContent).toContain('5 / 19')

    // Window wording is NEUTRAL — does not imply every metric covers the window.
    const win = screen.getByTestId('halo-window-note').textContent ?? ''
    expect(win).toMatch(/requested activity window: 30 days/i)
    expect(win).toMatch(/native source periods shown per metric/i)
    expect(win).not.toMatch(/^last 30 days/i)

    // Current VALUE + provenance/period
    expect(screen.getByTestId('halo-current-gross.total_sum').textContent).toContain('$12,240.78')
    expect(screen.getByTestId('halo-prov-gross.total_sum').textContent).toMatch(/dealership_performance.*2026-08-17.*2026-08-23/)

    // Missing is NEVER rendered as zero.
    const withheld = screen.getByTestId('halo-current-roi.total_leads').textContent ?? ''
    expect(withheld).toContain('Withheld')
    expect(withheld.trim()).not.toBe('0')
    const noData = screen.getByTestId('halo-current-engagement.conversations').textContent ?? ''
    expect(noData).toContain('No current value')
    expect(noData.trim()).not.toBe('0')

    // Incompatible industry reference is shown as directional/non-scoring, NEVER a score.
    const showCard = screen.getByTestId('halo-card-appt.show_rate')
    const ind = within(showCard).getByTestId('halo-industry').textContent ?? ''
    expect(ind).toMatch(/non-scoring/i)
    expect(ind).toMatch(/incompatible/i)
    expect(ind).not.toMatch(/\btarget\b/i)
    expect(ind).not.toMatch(/below target|above target|within target/i)

    // Limitations surfaced (withheld + non-scoring + Sales-only)
    const lim = screen.getByTestId('halo-limitations').textContent ?? ''
    expect(lim).toMatch(/withheld/i)
    expect(lim).toMatch(/non-scoring/i)
    expect(lim).toMatch(/Service and Parts/i)
  })

  it('baseline state=band renders a NEUTRAL "historical band available" (never claims "within")', async () => {
    const report = {
      ok: true,
      report: {
        profile: 'serra-honda', sales_only: true, manifest_version: '1.1.0', window_days: 30,
        narrative_mode: 'deterministic_grounded',
        coverage: { total: 1, current_value: 1, no_current_data: 0, withheld: 0 },
        limitations: ['Sales-only.'],
        narrative: 'n/a',
        cards: [
          {
            slug: 'appt.show_rate', label: 'Appointment show rate', category: 'Appointments', unit: 'ratio_0_1',
            display: '66.7%', current: { state: 'value', value: 0.6667, unit: 'ratio_0_1' },
            industry: { state: 'no_benchmark', note: '' },
            baseline: { state: 'band', mean: 0.5, stddev: 0.1, periods_available: 4 },
            provenance: { source: 'appointments', period: { start: '2026-08-17', end: '2026-08-23' } },
          },
        ],
      },
    }
    stubFetch(report)
    render(<HaloReportCardPanel profile="serra-honda" />)
    await waitFor(() => expect(screen.getByTestId('halo-report')).toBeTruthy())
    const base = within(screen.getByTestId('halo-card-appt.show_rate')).getByTestId('halo-baseline').textContent ?? ''
    expect(base).toMatch(/historical band available/i)
    expect(base).toMatch(/4 periods/i)
    expect(base).toMatch(/non-scoring/i)
    expect(base).not.toMatch(/within/i)
  })

  it('deterministic fallback: surfaces the fallback reason and the mode badge', async () => {
    const report = {
      ...REPORT.report,
      narrative_mode: 'deterministic_grounded',
      narrative_provider: 'none',
      narrative_fallback_reason: 'provider_unconfigured',
    }
    stubFetch({ ok: true, report })
    render(<HaloReportCardPanel profile="serra-honda" />)
    await waitFor(() => expect(screen.getByTestId('halo-report')).toBeTruthy())
    const fb = screen.getByTestId('halo-narrative-fallback').textContent ?? ''
    expect(fb).toMatch(/AI narration unavailable/i)
    expect(fb).toMatch(/provider_unconfigured/i)
    expect(screen.getByTestId('halo-narrative-provider').textContent).toMatch(/deterministic_grounded/i)
  })

  it('ai_grounded: shows the AI-grounded provider badge and NO fallback line', async () => {
    const report = {
      ...REPORT.report,
      narrative_mode: 'ai_grounded',
      narrative_provider: 'hermes',
      narrative_fallback_reason: null,
    }
    stubFetch({ ok: true, report })
    render(<HaloReportCardPanel profile="serra-honda" />)
    await waitFor(() => expect(screen.getByTestId('halo-report')).toBeTruthy())
    expect(screen.getByTestId('halo-narrative-provider').textContent).toMatch(/AI-grounded · hermes/i)
    expect(screen.queryByTestId('halo-narrative-fallback')).toBeNull()
  })

  it('shows the Sales-domain gate message on a 400 (never a blank/zeroed report)', async () => {
    stubFetch({ ok: false, error: 'Halo report is available only for governed Sales profiles (serra-honda, serra-nissan, tony-serra-ford).' }, 400)
    render(<HaloReportCardPanel profile="serra-service" />)
    await waitFor(() => expect(screen.getByTestId('halo-error')).toBeTruthy())
    expect(screen.getByTestId('halo-error').textContent).toMatch(/governed Sales profiles/i)
  })
})
