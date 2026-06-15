// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CustomerCampaignsRenderer } from '@/components/customer-console/campaigns-renderer'
import { defaultStudioConfig } from '@/lib/studio-config'

const campaigns = [
  {
    id: 'camp-1',
    audience_id: 'aud-1',
    channel: 'sms',
    message_template: 'Time to schedule service.',
    schedule: null,
    status: 'draft',
    template: 'Service reminder',
    created_at: 1,
    updated_at: 1,
  },
]

const audiences = [
  {
    id: 'aud-1',
    name: 'Recent service customers',
    query: { channel: 'sms' },
    created_at: 1,
  },
]

const templates = [
  {
    id: 'service-reminder',
    name: 'Service reminder',
    description: 'Bring customers back for service',
    channel: 'sms' as const,
    message_template: 'Time to schedule service.',
    domain: 'service' as const,
  },
]

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

function setupFetch() {
  const fetchMock = vi.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url)
      const method = init?.method ?? 'GET'

      if (u.includes('/api/customer/campaigns?')) {
        return json({ ok: true, campaigns, templates })
      }

      if (u.includes('/api/customer/audiences?')) {
        return json({ ok: true, audiences })
      }

      if (u.includes('/api/customer/lead-flow') && method === 'PUT') {
        return json({ ok: true })
      }

      if (u.includes('/api/customer/lead-flow')) {
        return json({
          ok: true,
          account_enabled: true,
          flow: {
            enabled: true,
            steps: [
              { channel: 'sms', wait_hours: 0 },
              { channel: 'email', wait_hours: 24 },
            ],
          },
        })
      }

      if (u.includes('/api/customer/audiences') && method === 'POST') {
        const body =
          typeof init?.body === 'string'
            ? (JSON.parse(init.body) as { action?: string })
            : {}
        if (body.action === 'preview') {
          return json({
            ok: true,
            preview: {
              count: 3,
              sample: [
                { id: 'c1', display_name: 'A Customer', channels: ['sms'] },
              ],
            },
          })
        }
        return json({
          ok: true,
          audience: {
            id: 'aud-2',
            name: 'My customer list',
            query: { channel: 'sms' },
            created_at: 2,
          },
        })
      }

      if (u.includes('/api/customer/campaigns/results')) {
        return json({
          ok: true,
          results: {
            campaign_id: 'camp-1',
            status: 'draft',
            audience_name: 'Recent service customers',
            audience_size: 3,
            delivered: 0,
            failed: 0,
          },
        })
      }

      return json({ ok: true })
    },
  )

  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function renderCampaignsPage() {
  return render(
    <CustomerCampaignsRenderer
      profile="huminic"
      config={defaultStudioConfig('huminic')}
    />,
  )
}

function calledSendTick(fetchMock: ReturnType<typeof setupFetch>) {
  return fetchMock.mock.calls.some((call) =>
    String(call[0]).includes('/api/customer/campaigns/tick'),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CustomerCampaignsRenderer IA polish', () => {
  it('renders top-level IA tabs and overview cards for campaigns, triggers, and lists', async () => {
    const fetchMock = setupFetch()
    renderCampaignsPage()

    for (const name of ['Overview', 'Campaigns', 'Triggers', 'Lists']) {
      expect(screen.getByRole('tab', { name })).toBeTruthy()
    }

    expect(await screen.findByText('Campaigns ready')).toBeTruthy()
    expect(screen.getByText('Lead-flow trigger plan')).toBeTruthy()
    expect(screen.getByText('Saved audience lists')).toBeTruthy()
    expect(await screen.findByText('Enabled')).toBeTruthy()
    expect(
      screen.getByText(/Text message immediately then Email after 24h/),
    ).toBeTruthy()
    expect(
      screen.getAllByRole('button', { name: 'New campaign' }).length,
    ).toBeGreaterThan(0)
    expect(
      screen.getByRole('button', { name: 'Manage campaigns' }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Manage triggers' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Upload list' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'New list' })).toBeTruthy()
    expect(calledSendTick(fetchMock)).toBe(false)
  })

  it('keeps campaign card actions under the Campaigns tab without sending', async () => {
    const fetchMock = setupFetch()
    renderCampaignsPage()

    fireEvent.click(screen.getByRole('tab', { name: 'Campaigns' }))

    expect(await screen.findByText('Service reminder')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Preview' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send now' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'View results' })).toBeTruthy()
    expect(calledSendTick(fetchMock)).toBe(false)
  })

  it('shows honest trigger plan controls and saves the one backend-supported plan', async () => {
    const fetchMock = setupFetch()
    renderCampaignsPage()

    fireEvent.click(screen.getByRole('tab', { name: 'Triggers' }))

    expect(
      await screen.findByText('Current lead-flow trigger plan'),
    ).toBeTruthy()
    expect(screen.getByText(/separate draft trigger objects/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'New plan' }))
    expect(screen.getByText(/new unsaved lead-flow plan/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Save plan' }))

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          (call) =>
            String(call[0]).includes('/api/customer/lead-flow') &&
            call[1]?.method === 'PUT',
        ),
      ).toBe(true)
    })
    expect(calledSendTick(fetchMock)).toBe(false)
  })

  it('lists saved audiences and opens the new-list builder from the Lists tab', async () => {
    const fetchMock = setupFetch()
    renderCampaignsPage()

    fireEvent.click(screen.getByRole('tab', { name: 'Lists' }))

    expect(await screen.findByText('Recent service customers')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Upload list' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'New list' }))

    expect(screen.getByText('New saved list')).toBeTruthy()
    expect(screen.getByDisplayValue('My customer list')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Save list' }))
    expect(await screen.findByText('Saved list.')).toBeTruthy()
    expect(calledSendTick(fetchMock)).toBe(false)
  })
})
