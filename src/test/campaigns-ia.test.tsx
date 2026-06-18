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

const automations = [
  {
    id: 'auto-1',
    name: 'Instant SMS for new leads',
    trigger: 'new_lead' as const,
    channel: 'sms',
    agent_id: 'caroline',
    wait_hours: 0,
    status: 'draft' as const,
    last_triggered_at: null,
    created_at: 1,
    updated_at: 1,
  },
  {
    id: 'auto-2',
    name: '24-hour follow-up for all leads',
    trigger: 'lead_followup' as const,
    channel: 'sms',
    agent_id: 'caroline',
    wait_hours: 24,
    status: 'draft' as const,
    last_triggered_at: null,
    created_at: 2,
    updated_at: 2,
  },
]

const agents = [
  { id: 'caroline', label: 'Sales', team: 'sales' },
  { id: 'nancy-gaston', label: 'Service', team: 'service' },
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
      if (u.includes('/api/customer/automations') && method === 'GET') {
        return json({ ok: true, automations, agents })
      }
      if (u.includes('/api/customer/automations')) {
        // POST/PUT/DELETE
        return json({ ok: true, automation: automations[0] })
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

describe('Marketing IA', () => {
  it('renders exactly Overview/Campaigns/Automations/Lists tabs, no Triggers', async () => {
    setupFetch()
    renderCampaignsPage()

    for (const name of ['Overview', 'Campaigns', 'Automations', 'Lists']) {
      expect(screen.getByRole('tab', { name })).toBeTruthy()
    }
    expect(screen.queryByRole('tab', { name: 'Triggers' })).toBeNull()
  })

  it('shows renamed overview cards reflecting real state, no global New campaign button', async () => {
    setupFetch()
    renderCampaignsPage()

    expect(await screen.findByText('Active Campaigns')).toBeTruthy()
    expect(screen.getByText('Active Automations')).toBeTruthy()
    expect(screen.getByText('Saved audience lists')).toBeTruthy()
    // Old labels gone.
    expect(screen.queryByText('Campaigns ready')).toBeNull()
    expect(screen.queryByText('Lead-flow trigger plan')).toBeNull()
    // The only "New campaign" buttons live inside the overview/Campaigns tab,
    // never as an outer/global header action. The header (h3 "Marketing") has
    // no New campaign sibling button — count comes only from cards.
    const newCampaignButtons = screen.getAllByRole('button', {
      name: 'New campaign',
    })
    expect(newCampaignButtons.length).toBe(1) // overview card only
  })

  it('lists seeded automations and opens a real builder (draft, never sends)', async () => {
    const fetchMock = setupFetch()
    renderCampaignsPage()

    fireEvent.click(screen.getByRole('tab', { name: 'Automations' }))

    expect(await screen.findByText('Instant SMS for new leads')).toBeTruthy()
    expect(screen.getByText('24-hour follow-up for all leads')).toBeTruthy()

    // Open the builder.
    fireEvent.click(screen.getAllByRole('button', { name: 'New automation' })[0])
    expect(
      screen.getByPlaceholderText('e.g. Instant SMS for new leads'),
    ).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Trigger' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Channel' })).toBeTruthy()

    expect(calledSendTick(fetchMock)).toBe(false)
  })

  it('activates an automation via PUT status without sending', async () => {
    const fetchMock = setupFetch()
    renderCampaignsPage()

    fireEvent.click(screen.getByRole('tab', { name: 'Automations' }))
    await screen.findByText('Instant SMS for new leads')

    fireEvent.click(screen.getAllByRole('button', { name: 'Activate' })[0])

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          (call) =>
            String(call[0]).includes('/api/customer/automations') &&
            call[1]?.method === 'PUT' &&
            String(call[1]?.body).includes('"status":"active"'),
        ),
      ).toBe(true)
    })
    expect(calledSendTick(fetchMock)).toBe(false)
  })

  it('keeps campaign card actions (incl. Delete) under the Campaigns tab', async () => {
    const fetchMock = setupFetch()
    renderCampaignsPage()

    fireEvent.click(screen.getByRole('tab', { name: 'Campaigns' }))

    expect(await screen.findByText('Service reminder')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Preview' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send now' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'View results' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy()
    expect(calledSendTick(fetchMock)).toBe(false)
  })

  it('Lists tab offers sample CSV download and list delete', async () => {
    setupFetch()
    renderCampaignsPage()

    fireEvent.click(screen.getByRole('tab', { name: 'Lists' }))

    expect(await screen.findByText('Recent service customers')).toBeTruthy()
    expect(
      screen.getAllByRole('button', { name: /Sample CSV/ }).length,
    ).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy()
  })
})
