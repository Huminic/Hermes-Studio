// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AlertsPanel } from '@/components/customer-console/AlertsPanel'

function stubFetch(payload: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } })),
  )
}

afterEach(() => vi.unstubAllGlobals())

const DISPLAY = {
  ok: true,
  alerts: [],
  catalog: {},
  display: [
    {
      id: 'a1', kind: 'metric', status: 'paused',
      query_name: 'Average response time (actual minutes) above threshold',
      description: 'Alerts when average response time rises above 30.',
      email: '',
      metric_label: 'Avg response time (actual, min)', direction: 'above', threshold: 30,
      recipientRole: 'Manager', currentValue: 210, currentValueResolved: true,
      dataThroughLabel: 'Aug 30, 2026', ageLabel: 'Data through Aug 30, 2026 · updated yesterday',
    },
    {
      id: 'a2', kind: 'metric', status: 'paused',
      query_name: 'High-intent inbound follow-up', description: 'Withheld source.',
      email: '', metric_label: 'High-intent inbound', direction: 'above', threshold: null,
      recipientRole: 'Salesperson or Manager', currentValue: null, currentValueResolved: false,
      dataThroughLabel: 'Aug 30, 2026', ageLabel: 'Data through Aug 30, 2026 · updated yesterday',
    },
  ],
}

describe('AlertsPanel renders the shared display read-model', () => {
  it('shows paused status, metric, threshold, current value, recipient role, and data-through age', async () => {
    stubFetch(DISPLAY)
    render(<AlertsPanel profile="serra-honda" />)
    await waitFor(() => expect(screen.getAllByText(/paused \(inactive\)/i).length).toBeGreaterThan(0))
    expect(screen.getByText(/Avg response time \(actual, min\)/)).toBeTruthy()
    expect(screen.getByText(/Threshold: > 30/)).toBeTruthy()
    expect(screen.getByText(/Current: 210/)).toBeTruthy()
    expect(screen.getByText(/To: Manager/)).toBeTruthy()
    expect(screen.getAllByText(/Data through Aug 30, 2026 · updated yesterday/).length).toBeGreaterThan(0)
  })

  it('a WITHHELD current value renders as "—" (absent), never a fabricated 0', async () => {
    stubFetch(DISPLAY)
    render(<AlertsPanel profile="serra-honda" />)
    await waitFor(() => expect(screen.getByText(/Current: —/)).toBeTruthy())
    // and no "Current: 0" is rendered for the unresolved one
    expect(screen.queryByText(/Current: 0(?!\d)/)).toBeNull()
  })
})
