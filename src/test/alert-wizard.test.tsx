// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AlertWizard } from '@/components/customer-console/AlertWizard'
import { AlertModal } from '@/components/customer-console/AlertModal'

const catalog = [
  {
    category: 'Appointments',
    metrics: [
      { id: 'appt.show_rate', label: 'Appointment show rate', description: 'Share shown.', category: 'Appointments', format: 'percent', concerning: 'below', source: 'vin-report' },
    ],
  },
]

let posted: Record<string, unknown> | null = null
beforeEach(() => {
  posted = null
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: { method?: string; body?: string }) => {
      if (!init || !init.method) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, alerts: [], catalog }) })
      }
      if (init.method === 'POST') {
        posted = JSON.parse(init.body ?? '{}')
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, id: 'x' }) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) })
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

const selects = (c: HTMLElement) => Array.from(c.querySelectorAll('select'))

describe('AlertWizard', () => {
  it('fetches the catalog, defaults direction, stores a percent threshold as 0–1', async () => {
    const onCreated = vi.fn()
    const { container } = render(<AlertWizard profile="serra-honda" onCreated={onCreated} />)
    await waitFor(() => expect(screen.getByText('Appointment show rate')).toBeTruthy())

    // pick the metric (first select) → direction defaults to its concerning side ('below')
    fireEvent.change(selects(container)[0], { target: { value: 'appt.show_rate' } })
    // percent threshold entered as 50 → stored as 0.5
    fireEvent.change(screen.getByPlaceholderText('e.g. 50'), { target: { value: '50' } })
    fireEvent.click(screen.getByRole('button', { name: /create alert/i }))

    await waitFor(() => expect(posted).toBeTruthy())
    expect(posted).toMatchObject({ profile: 'serra-honda', metric_id: 'appt.show_rate', rule_type: 'threshold', direction: 'below', threshold: 0.5 })
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
  })

  it('shows a live plain-language preview', async () => {
    const { container } = render(<AlertWizard profile="serra-honda" />)
    await waitFor(() => expect(screen.getByText('Appointment show rate')).toBeTruthy())
    fireEvent.change(selects(container)[0], { target: { value: 'appt.show_rate' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. 50'), { target: { value: '50' } })
    await waitFor(() => expect(screen.getByText(/falls below 50%/)).toBeTruthy())
  })
})

describe('AlertModal', () => {
  it('renders the wizard and closes on backdrop click', async () => {
    const onClose = vi.fn()
    const { container } = render(<AlertModal profile="serra-honda" onClose={onClose} />)
    await waitFor(() => expect(screen.getByText('Create an alert')).toBeTruthy())
    // backdrop is the dialog root; clicking it closes
    fireEvent.click(container.querySelector('[role="dialog"]') as HTMLElement)
    expect(onClose).toHaveBeenCalled()
  })
})
