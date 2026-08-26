// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DashboardLanding } from '@/components/customer-console/cockpit/DashboardLanding'

const view = {
  reach: { value: 0.66, display: '272', sub: '66% of 414 leads' },
  night: { value: 0.44, display: '44', sub: '44% after hours' },
  odometer: 159549,
  median_reply_secs: 3,
  impact: [
    { key: 'ai_actions', label: 'AI Actions', value: 827, display: '827', arrow: { dir: 'up', good: true } },
    { key: 'leads_touched', label: 'Leads Touched', value: 272, display: '272', arrow: { dir: 'up', good: true } },
    { key: 'conversations', label: 'Conversations Held', value: 61, display: '61', arrow: null },
    { key: 'sales_touched', label: 'Sales Touched', value: null, display: '—', arrow: null, note: 'Needs the CRM sold-join' },
    { key: 'revenue_presence', label: 'Revenue Presence', value: null, display: '—', arrow: null, note: 'Set your average gross' },
  ],
  ladder: [
    { key: 'reached', label: 'Reached', count: 272, conv: null },
    { key: 'replied', label: 'Replied', count: 61, conv: 0.224 },
    { key: 'sold', label: 'Walked In / Sold', count: null, conv: null, note: 'Needs the CRM join' },
  ],
  night_shift: { after_hours_pct: 44, ah_threads: 44, median_reply_secs: 3, resurrections: 7 },
  accent: '#dc2626',
  heartbeats: {},
  window_days: 30,
}

const catalog = [{ category: 'Appointments', metrics: [{ id: 'appt.show_rate', label: 'Appointment show rate', description: 'd', category: 'Appointments', format: 'percent', concerning: 'below', source: 'vin-report' }] }]

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.includes('/api/customer/cockpit')) return Promise.resolve({ json: () => Promise.resolve({ ok: true, view }) })
      if (url.includes('/api/customer/alerts')) return Promise.resolve({ json: () => Promise.resolve({ ok: true, alerts: [], catalog }) })
      return Promise.resolve({ json: () => Promise.resolve({ ok: true }) }) // AskAi + any others, benign
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

describe('DashboardLanding (report sections integration)', () => {
  it('renders the Impact Board, Engagement Ladder, and Night Shift & Resurrections from the view', async () => {
    render(<DashboardLanding profile="serra-honda" />)
    await waitFor(() => expect(screen.getByText('AI Impact Board')).toBeTruthy())
    // Impact Board metrics incl. an honest gap
    expect(screen.getByText('Leads Touched')).toBeTruthy()
    expect(screen.getByText('Sales Touched')).toBeTruthy()
    expect(screen.getByText('Needs the CRM sold-join')).toBeTruthy()
    // Engagement Ladder
    expect(screen.getByText('New Buyer Funnel Facts')).toBeTruthy()
    expect(screen.getByText('Reached')).toBeTruthy()
    // Night Shift & Resurrections ('Night Shift' also appears as a gauge label → use getAll)
    expect(screen.getAllByText('Night Shift').length).toBeGreaterThan(0)
    expect(screen.getByText('Resurrections')).toBeTruthy()
  })

  it('the "Create alert" button opens the alert modal', async () => {
    render(<DashboardLanding profile="serra-honda" />)
    await waitFor(() => expect(screen.getByText('+ Create alert')).toBeTruthy())
    fireEvent.click(screen.getByText('+ Create alert'))
    await waitFor(() => expect(screen.getByText('Create an alert')).toBeTruthy())
  })
})
