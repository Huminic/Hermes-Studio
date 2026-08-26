// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { NativePerformancePanel } from '@/components/customer-console/native-performance-panel'

function stubFetch(payload: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    ),
  )
}

const HONDA = {
  ok: true,
  profile: 'serra-honda',
  dealershipPerformance: {
    available: true,
    provenance: { period: { start: '2026-08-17', end: '2026-08-23' }, acceptedRows: 40, checksum: 'x' },
    summary: {
      leads: 96,
      apptsSet: 18,
      apptsShow: 12,
      totalVisits: 31,
      visitsSold: 3,
      soldInPeriod: 5,
      frontGross: 3184.5,
      backGross: 9056.28,
      totalGross: 12240.78,
      avgTotalGross: 2448.156,
    },
    byInventoryType: [
      { label: 'New', leads: 54, soldInPeriod: 3 },
      { label: 'Used', leads: 29, soldInPeriod: 2 },
      { label: 'Unknown', leads: 13, soldInPeriod: 0 },
    ],
  },
  appointments: {
    available: true,
    provenance: { period: { start: '2026-08-17', end: '2026-08-23' } },
    total: 18,
    completed: 5,
    confirmed: 9,
    show: 12,
    noShow: 3,
    cancelled: 1,
    rescheduled: 2,
  },
  responseTimes: {
    available: true,
    units: 'minutes',
    period: { start: '2026-08-17', end: '2026-08-23', timezone: 'America/New_York' },
    coverage: { total_rows: 59, accepted_rows: 57, reconciles: true },
    metrics: {
      response_time_actual_avg_min: 12.34,
      response_time_actual_median_min: 8.1,
      response_time_adjusted_avg_min: 10.0,
      response_time_adjusted_median_min: 7.0,
      target_category_counts: { 'Target 1': 20, 'Target 2': 10, Missed: 5, 'No Contact': 2 },
    },
  },
}

const FORD = {
  ok: true,
  profile: 'tony-serra-ford',
  dealershipPerformance: { available: false, reason: 'no accepted dealership_performance delivery' },
  appointments: { available: false, reason: 'no accepted appointments delivery' },
  responseTimes: HONDA.responseTimes,
}

describe('NativePerformancePanel', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('renders Honda DP + appointments + a separate, non-blended RT panel', async () => {
    stubFetch(HONDA)
    render(<NativePerformancePanel profile="serra-honda" />)
    await waitFor(() => expect(screen.getByTestId('dp-leads')).toBeTruthy())

    expect(screen.getByTestId('dp-leads').textContent).toContain('96')
    expect(screen.getByTestId('dp-frontGross').textContent).toContain('$3,184.50')
    expect(screen.getByTestId('dp-totalGross').textContent).toContain('$12,240.78')
    expect(screen.getByTestId('dp-inventory').textContent).toContain('Used')

    expect(screen.getByTestId('appt-total').textContent).toContain('18')
    expect(screen.getByTestId('appt-rescheduled').textContent).toContain('2')
    expect(screen.getByTestId('appt-noShow').textContent).toContain('3')

    const rt = screen.getByTestId('response-times')
    expect(rt.textContent).toContain('Standalone Response Times')
    expect(rt.textContent).toContain('not blended')
    expect(screen.getByTestId('rt-actual-avg').textContent).toContain('12.3 min')
    expect(screen.getByTestId('rt-targets').textContent).toContain('Target 1')
  })

  it('shows explicit unavailable (never 0) for Ford DP + appointments, RT still present', async () => {
    stubFetch(FORD)
    render(<NativePerformancePanel profile="tony-serra-ford" />)
    await waitFor(() => expect(screen.getByTestId('response-times')).toBeTruthy())

    // No fabricated zeros — the DP/appointment stat cells never render.
    expect(screen.queryByTestId('dp-leads')).toBeNull()
    expect(screen.queryByTestId('appt-total')).toBeNull()

    const unavailText = screen
      .getAllByTestId('native-unavailable')
      .map((n) => n.textContent)
      .join(' | ')
    expect(unavailText).toContain('Dealership performance — unavailable')
    expect(unavailText).toContain('Appointments — unavailable')

    // RT remains available and labeled.
    expect(screen.getByTestId('rt-actual-avg').textContent).toContain('12.3 min')
  })
})
