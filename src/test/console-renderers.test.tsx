// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import {
  consoleRenderers,
  getRenderer,
  listRendererKeys,
} from '@/lib/console-renderers'
import { defaultStudioConfig } from '@/lib/studio-config'

// 7-page IA. 12 renderer keys total: 8 page renderers (incl. InfoStore and notifications) +
// tools-widget sub-page + widget-public (public unauthenticated /w/$slug) +
// assistant-pane (right-pane slot) + the legacy knowledge/data route shims.
const EXPECTED_KEYS = [
  'customer-console.chat',
  'customer-console.infostore',
  'customer-console.knowledge',
  'customer-console.tools',
  'customer-console.tools-widget',
  'customer-console.data',
  'customer-console.performance',
  'customer-console.comms',
  'customer-console.campaigns',
  'customer-console.notifications',
  'customer-console.widget-public',
  'customer-console.assistant-pane',
]

describe('console-renderers registry', () => {
  it('contains all expected renderer keys', () => {
    const keys = listRendererKeys()
    for (const key of EXPECTED_KEYS) {
      expect(keys).toContain(key)
    }
    expect(keys).toHaveLength(EXPECTED_KEYS.length)
  })

  it('does not retain old IA renderer keys', () => {
    const keys = listRendererKeys()
    expect(keys).not.toContain('customer-console.dashboard-grid')
    expect(keys).not.toContain('customer-console.widget-editor')
    expect(keys).not.toContain('customer-console.service-kanban')
  })

  it('getRenderer returns the registered component for each expected key', () => {
    for (const key of EXPECTED_KEYS) {
      const renderer = getRenderer(key)
      expect(renderer).toBeDefined()
      expect(renderer).not.toBeNull()
    }
  })

  it('getRenderer returns null for unknown keys', () => {
    expect(getRenderer('nonexistent.key')).toBeNull()
  })

  it('each renderer mounts without throwing using minimal valid props', () => {
    const config = defaultStudioConfig('test-profile')
    for (const key of EXPECTED_KEYS) {
      const Renderer = consoleRenderers[key]
      expect(() => {
        render(
          <Renderer profile="test-profile" config={config} params={{}} />,
        )
      }).not.toThrow()
    }
  })

  it('chat renderer initially shows a loading state while fetching agents', () => {
    // C.2: chat renderer now fetches /api/customer/agents on mount.
    // Synchronous render shows "Loading agents…" until the network
    // resolves; full round-trip is covered by customer-chat-api.test.ts.
    const config = defaultStudioConfig('strukture')
    config.branding.persona_name = 'Automa'
    const Renderer = consoleRenderers['customer-console.chat']
    const { container } = render(
      <Renderer profile="strukture" config={config} params={{}} />,
    )
    // Customer-facing loading copy — no raw profile slug is surfaced.
    expect(container.textContent).toContain('Loading your agents')
    expect(container.textContent).not.toContain('strukture')
  })

  it('knowledge renderer shows the company wiki shell without leaking the slug', () => {
    const config = defaultStudioConfig('cedar-ridge')
    const Renderer = consoleRenderers['customer-console.knowledge']
    const { container } = render(
      <Renderer profile="cedar-ridge" config={config} params={{}} />,
    )
    // Customer-facing shell — the raw profile slug is never surfaced.
    expect(container.textContent).toContain('Company Wiki')
    expect(container.textContent).not.toContain('cedar-ridge')
  })

  it('tools-widget renderer surfaces the unified widget launch surface', () => {
    const config = defaultStudioConfig('huminic')
    const Renderer = consoleRenderers['customer-console.tools-widget']
    const { container } = render(
      <Renderer profile="huminic" config={config} params={{}} />,
    )
    expect(container.textContent).toContain('Unified Widget')
    expect(container.textContent).toContain('All-in-one launcher')
    expect(container.textContent).toContain('Web Chat')
  })

  it('data renderer mounts the native reports view (fetches /api/customer/reports)', () => {
    // The real DataRenderer fetches reports on mount; first paint is the
    // loading state. (Report content is covered by customer-reports.test.ts.)
    const config = defaultStudioConfig('huminic')
    const Renderer = consoleRenderers['customer-console.data']
    const { container } = render(
      <Renderer profile="huminic" config={config} params={{}} />,
    )
    expect(container.textContent).toContain('Loading your dashboard')
  })

  it('performance renderer surfaces dashboard builder and PDF export controls', async () => {
    const performance = {
      generated_at: Date.now(),
      threads: {
        total: 8,
        by_channel: { sms: 3, chat: 5 },
        by_domain: { sales: 5, service: 3 },
      },
      messages: {
        total: 12,
        by_channel: { sms: 7, chat: 5 },
        by_domain: { sales: 7, service: 5 },
      },
    }
    const reports = {
      profile: 'huminic',
      generated_at: Date.now(),
      comms: {
        window_days: 30,
        messages: {
          total: 12,
          inbound: 7,
          outbound: 5,
          by_channel: {
            sms: { inbound: 2, outbound: 5 },
            chat: { inbound: 5, outbound: 0 },
          },
        },
        threads: { total: 8, open: 6, closed: 2, by_domain: { sales: 5, service: 3 } },
        calls_in: 4,
        texts_out: 5,
      },
      followups: {
        immediate_triggers: 2,
        checkin_triggers: 1,
        last_fire: Date.now(),
        sends: { total: 3, outbound: 3, by_channel: { sms: 3 } },
      },
      campaigns: {
        campaigns: 2,
        by_status: { draft: 1, active: 1 },
        deliveries_sent: 11,
        deliveries_failed: 0,
      },
      lead_funnel: {
        available: true,
        source: 'vin-live',
        total: 9,
        by_status: { hot: 4, warm: 5 },
      },
    }
    const dashboard = {
      profile: 'huminic',
      generated_at: Date.now(),
      window_days: 30,
      comparison_window_days: 30,
      funnel: {
        lead_performance: {
          stages: [
            { key: 'leads', label: 'Leads', now: 150, comparison: 100, conversion: null, status: 'sourced', trend: { current: 150, prior: 100, delta: 50, direction: 'up', good: true } },
            { key: 'contacted', label: 'Contacted', now: 120, comparison: 90, conversion: 0.8, status: 'sourced', trend: { current: 120, prior: 90, delta: 30, direction: 'up', good: true } },
            { key: 'appt_set', label: 'Appointments Set', now: 40, comparison: 30, conversion: 0.33, status: 'sourced', trend: { current: 40, prior: 30, delta: 10, direction: 'up', good: true } },
            { key: 'appt_shown', label: 'Appointments Shown', now: 24, comparison: 20, conversion: 0.6, status: 'sourced', trend: { current: 24, prior: 20, delta: 4, direction: 'up', good: true } },
            { key: 'sold', label: 'Sold', now: 24, comparison: 20, conversion: 1.0, status: 'sourced', trend: { current: 24, prior: 20, delta: 4, direction: 'up', good: true } },
          ],
          timings: [
            { key: 'time_to_first_contact', label: 'Time to First Contact', unit: 'days', value: null, polarity: 'down', status: 'pending', source: 'data source pending' },
            { key: 'time_to_appt_set', label: 'Time to Appointment Set', unit: 'days', value: 6, polarity: 'down', status: 'sourced', source: 'report', trend: { current: 6, prior: null, delta: null, direction: null, good: null } },
            { key: 'time_to_sale', label: 'Time to Sale', unit: 'days', value: 5, polarity: 'down', status: 'sourced', source: 'report', trend: { current: 5, prior: 7, delta: -2, direction: 'down', good: true } },
          ],
          comparison_label: 'prior import',
        },
        pipeline_performance: {
          stages: [
            { key: 'leads', label: 'Leads', now: 150, comparison: 100, conversion: null, status: 'sourced', trend: { current: 150, prior: 100, delta: 50, direction: 'up', good: true } },
            { key: 'opportunities', label: 'Opportunities', now: 110, comparison: 80, conversion: 0.73, status: 'sourced', trend: { current: 110, prior: 80, delta: 30, direction: 'up', good: true } },
            { key: 'appointments', label: 'Appointments', now: 40, comparison: 30, conversion: 0.36, status: 'sourced', trend: { current: 40, prior: 30, delta: 10, direction: 'up', good: true } },
            { key: 'sales', label: 'Sales', now: 24, comparison: 20, conversion: 0.6, status: 'sourced', trend: { current: 24, prior: 20, delta: 4, direction: 'up', good: true } },
          ],
          comparison_label: 'prior import',
        },
        lead_sources: [
          { lead_source: 'Repeat Customer', total_leads: 100, good_leads: 80, appts_set: 30, sold_from_leads: 20, sold_from_leads_pct: 0.2, total_gross: 30000, rating: 'good', trend: { current: 100, prior: 90, delta: 10, direction: 'up', good: true } },
        ],
      },
      leads: {
        statuses: { new: { count: 4, names: [] }, active: { count: 5, names: [] }, abandoned: { count: 0, names: [] } },
        by_source: [{ lead_source: 'Repeat Customer', total_leads: 100 }],
        source: 'vin-live',
      },
      pipeline: {
        rows: [{ salesperson: 'Brandon Donald', leads: 30, opportunities: 27, appointments: 6, sales: 4 }],
        status: 'sourced',
        comparison_label: 'prior import',
      },
      ai_activity: {
        metrics: [
          { key: 'conversations', label: 'Conversations', unit: 'count', value: 8, polarity: 'up', status: 'sourced', source: 'live', trend: { current: 8, prior: 5, delta: 3, direction: 'up', good: true } },
          { key: 'calls_received', label: 'Calls Received', unit: 'count', value: 4, polarity: 'up', status: 'sourced', source: 'live' },
          { key: 'video_sessions', label: 'Video Sessions', unit: 'count', value: 0, polarity: 'up', status: 'sourced', source: 'live' },
          { key: 'web_chats', label: 'Web Chats', unit: 'count', value: 5, polarity: 'up', status: 'sourced', source: 'live' },
          { key: 'emails_sent', label: 'Emails Sent', unit: 'count', value: 0, polarity: 'up', status: 'sourced', source: 'live' },
          { key: 'texts_sent', label: 'Texts Sent', unit: 'count', value: 5, polarity: 'up', status: 'sourced', source: 'live' },
          { key: 'calls_made', label: 'Calls Made', unit: 'count', value: 2, polarity: 'up', status: 'sourced', source: 'live' },
          { key: 'hunches', label: 'Hunches', unit: 'count', value: 1, polarity: 'up', status: 'sourced', source: 'live' },
          { key: 'infostore_updates', label: 'InfoStore Updates', unit: 'count', value: 3, polarity: 'up', status: 'sourced', source: 'live' },
        ],
        observation: { overview: 'Activity looks steady. These are observations, not conclusions.', what_is_good: ['Texts Sent rose.'], opportunities: ['It might be worth reviewing hunches.'] },
      },
    }
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('/api/customer/dashboard?')) {
        return new Response(JSON.stringify({ ok: true, dashboard }), { status: 200 })
      }
      if (u.includes('/api/customer/dashboard-queries')) {
        return new Response(JSON.stringify({ ok: true, queries: [] }), { status: 200 })
      }
      if (u.includes('/api/customer/performance')) {
        return new Response(JSON.stringify({ ok: true, performance }), { status: 200 })
      }
      if (u.includes('/api/customer/reports')) {
        return new Response(JSON.stringify({ ok: true, reports }), { status: 200 })
      }
      if (u.includes('/api/customer/dashboards')) {
        return new Response(
          JSON.stringify({
            ok: true,
            dashboards: [],
            sources: ['calls', 'sms', 'leads', 'campaigns', 'federated'],
          }),
          { status: 200 },
        )
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    try {
      const config = defaultStudioConfig('huminic')
      const Renderer = consoleRenderers['customer-console.performance']
      const { container, findByText, getByText, getAllByText } = render(
        <Renderer profile="huminic" config={config} params={{}} />,
      )
      // Funnel tab is default; global controls + tabs present.
      await findByText('Lead Performance')
      const txt = container.textContent ?? ''
      expect(txt).toContain('Export PDF')
      expect(txt).toContain('Funnel')
      expect(txt).toContain('Leads')
      expect(txt).toContain('Pipeline')
      expect(txt).toContain('AI Activity')
      expect(txt).toContain('Custom')
      expect(txt).toContain('Sold') // lead conversion funnel final stage
      expect(txt).toContain('Data source pending') // honest pending timing

      // Custom tab: Ask AI + Saved + retained Add card builder.
      fireEvent.click(getByText('Custom'))
      expect(container.textContent).toContain('Ask AI')
      expect(container.textContent).toContain('Saved')
      fireEvent.click(getAllByText('+ Add card')[0])
      expect(container.textContent).toContain('Combined sources')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('data renderer surfaces the Data Store (database snapshots, not dashboard metrics)', async () => {
    const reports = {
      profile: 'huminic',
      generated_at: Date.now(),
      comms: {
        window_days: 30,
        messages: {
          total: 3,
          inbound: 2,
          outbound: 1,
          by_channel: {
            voice: { inbound: 2, outbound: 0 },
            sms: { inbound: 0, outbound: 1 },
          },
        },
        threads: { total: 1, open: 1, closed: 0, by_domain: { sales: 1 } },
        calls_in: 2,
        texts_out: 1,
      },
      followups: {
        immediate_triggers: 4,
        checkin_triggers: 2,
        last_fire: Date.now(),
        sends: { total: 5, outbound: 5, by_channel: { sms: 5 } },
      },
      campaigns: {
        campaigns: 1,
        by_status: { sent: 1 },
        deliveries_sent: 10,
        deliveries_failed: 1,
      },
      lead_funnel: {
        available: true,
        source: 'vin-live',
        total: 7,
        by_status: { hot: 7 },
      },
    }
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('/api/customer/data-uploads')) {
        return new Response(
          JSON.stringify({
            ok: true,
            uploads: [
              {
                id: 'upload-1',
                ts: Date.now(),
                filename: 'service-report.csv',
                classification: 'data',
                size_bytes: 42,
                checksum: 'abc',
                embedded: 0,
              },
            ],
          }),
          { status: 200 },
        )
      }
      return new Response(JSON.stringify({ ok: true, reports }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    try {
      const config = defaultStudioConfig('huminic')
      const Renderer = consoleRenderers['customer-console.data']
      const { container, findByText } = render(
        <Renderer profile="huminic" config={config} params={{}} />,
      )
      await findByText('Data Store')
      const txt = container.textContent ?? ''
      // Major data categories (database stats, not dashboard metrics):
      expect(txt).toContain('Contacts')
      expect(txt).toContain('Threads')
      expect(txt).toContain('Campaigns')
      expect(txt).toContain('Follow-ups')
      expect(txt).toContain('Uploaded reports')
      expect(txt).toContain('Data uploads')
      expect(txt).toContain('Upload data')
      expect(txt).toContain('service-report.csv')
      // Explanatory note pointing to Dashboard tab for metrics:
      expect(txt).toContain('Dashboard')
      expect(txt).toContain('not live activity')
      // No backend internals leak to the customer:
      expect(txt).not.toMatch(/central-mcp/i)
      expect(txt).not.toMatch(/metabase/i)
      expect(txt).not.toMatch(/duckdb/i)
      expect(txt).not.toMatch(/pending operator/i)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('comms renderer shows the sales/service segment structure', () => {
    const config = defaultStudioConfig('huminic')
    const Renderer = consoleRenderers['customer-console.comms']
    const { container } = render(
      <Renderer profile="huminic" config={config} params={{}} />,
    )
    // C.7 segment switcher labels (capitalize via CSS; text content
    // matches the lowercase source). Both terms must appear.
    expect(container.textContent).toMatch(/sales/i)
    expect(container.textContent).toMatch(/service/i)
    expect(container.querySelectorAll('[data-role="segment"]')).toHaveLength(2)
    expect(container.querySelector('[data-role="comms-sort"]')).not.toBeNull()
  })

  it('comms renderer shows visible takeover and gates manual replies without the old side panel', async () => {
    // WS-8: with a selected thread loaded, the renderer must keep the
    // channel filter, handling badge, and takeover control in the main
    // conversation. The old customer-info side panel must stay removed.
    const thread = {
      id: 't1',
      profile: 'huminic',
      domain: 'sales',
      channel: 'sms',
      subject: 'sms · +15555550100',
      contact_handle: '+15555550100',
      assigned_agent_id: 'caroline',
      status: 'open' as const,
      created_at: Date.now(),
      updated_at: Date.now(),
      message_count: 1,
      last_message_preview: 'hi there',
    }
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes('/api/messaging/threads/')) {
        return new Response(
          JSON.stringify({
            ok: true,
            thread: {
              ...thread,
              human_assigned: false,
              messages: [
                {
                  id: 'm1',
                  direction: 'inbound',
                  role: 'user',
                  channel: 'sms',
                  content: 'hi there',
                  author: 'lead',
                  created_at: Date.now(),
                  metadata: {},
                },
              ],
            },
          }),
          { status: 200 },
        )
      }
      if (u.includes('/api/messaging/threads')) {
        return new Response(JSON.stringify({ ok: true, threads: [thread] }), {
          status: 200,
        })
      }
      if (u.includes('/api/messaging/contacts')) {
        return new Response(
          JSON.stringify({
            ok: true,
            contacts: [
              {
                id: 'c1',
                display_name: 'Pat Buyer',
                identifiers: { sms: '+15555550100', email: 'pat@example.com' },
                channels: ['sms', 'email'],
              },
            ],
          }),
          { status: 200 },
        )
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    // jsdom has no EventSource; the renderer guards on its absence.
    try {
      const config = defaultStudioConfig('huminic')
      const Renderer = consoleRenderers['customer-console.comms']
      const { container, findAllByText } = render(
        <Renderer profile="huminic" config={config} params={{}} />,
      )
      const named = await findAllByText(/Pat Buyer/)
      expect(named.length).toBeGreaterThan(0)
      const root = container as HTMLElement
      expect(
        root.querySelector('[data-role="customer-info-panel"]'),
      ).toBeNull()
      // Channel filter tabs (req #4 as a filter).
      expect(
        root.querySelector('[data-role="comms-channel-filter"]'),
      ).not.toBeNull()
      // Handling badge defaults to the AI agent (req #5).
      const badge = root.querySelector('[data-role="handling-badge"]')
      expect(badge?.getAttribute('data-handler')).toBe('agent')
      // Take-over control present (req #5).
      expect(root.querySelector('[data-role="take-over"]')).not.toBeNull()
      expect(
        root.querySelector('[data-role="delete-conversation"]'),
      ).not.toBeNull()
      const composer = root.querySelector<HTMLTextAreaElement>(
        '[data-role="comms-composer"]',
      )
      expect(composer?.disabled).toBe(true)
      const txt = root.textContent ?? ''
      expect(txt).not.toContain('pat@example.com')
      expect(txt).toContain('Take over to reply manually')
      expect(txt).toMatch(/take over/i)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('campaigns renderer surfaces the customer-facing campaigns page', () => {
    const config = defaultStudioConfig('huminic')
    const Renderer = consoleRenderers['customer-console.campaigns']
    const { container } = render(
      <Renderer profile="huminic" config={config} params={{}} />,
    )
    // Clean customer copy — the internal Service-domain scoping is no longer
    // surfaced as a raw label (campaigns remain service-scoped in code).
    expect(container.textContent).toContain('Campaigns')
    expect(container.textContent).toContain('Reach your customers')
    expect(container.textContent).toContain('Triggers')
    expect(container.textContent).toContain('Upload list')
    expect(container.textContent).not.toContain('Follow-up')
    expect(container.textContent).not.toContain('“Send now” sends any ready campaign')
  })

  it('notifications renderer surfaces matching add/save controls', async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          ok: true,
          routing: [
            {
              event: 'new_lead',
              to: 'manager@example.com',
              channel: 'email',
              label: 'Manager',
              enabled: true,
            },
          ],
          known_events: ['new_lead', 'inbound_sms'],
          lead_recipient: null,
        }),
        { status: 200 },
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    try {
      const config = defaultStudioConfig('huminic')
      const Renderer = consoleRenderers['customer-console.notifications']
      const { findByText, getByText } = render(
        <Renderer profile="huminic" config={config} params={{}} />,
      )
      await findByText('Notifications')
      const add = getByText('+ Add rule')
      const save = getByText('Save')
      expect(add.className).toBe(save.className)
      expect(add.getAttribute('style')).toBe(save.getAttribute('style'))
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('assistant-pane renderer surfaces persona_name', () => {
    const config = defaultStudioConfig('huminic')
    config.branding.persona_name = 'Nexus'
    const Renderer = consoleRenderers['customer-console.assistant-pane']
    const { container } = render(
      <Renderer profile="huminic" config={config} params={{}} />,
    )
    expect(container.textContent).toContain('Nexus')
  })

  it('widget-public renderer surfaces slug from params', () => {
    const config = defaultStudioConfig('default')
    const Renderer = consoleRenderers['customer-console.widget-public']
    const { container } = render(
      <Renderer
        profile="default"
        config={config}
        params={{ slug: 'huminic-hero' }}
      />,
    )
    expect(container.textContent).toContain('huminic-hero')
  })

  it('all customer-console renderer keys are plugin-namespaced', () => {
    for (const key of listRendererKeys()) {
      expect(key.startsWith('customer-console.')).toBe(true)
    }
  })
})
