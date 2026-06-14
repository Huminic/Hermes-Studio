// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import {
  consoleRenderers,
  getRenderer,
  listRendererKeys,
} from '@/lib/console-renderers'
import { defaultStudioConfig } from '@/lib/studio-config'

// 7-page IA. 10 renderer keys total: 7 page renderers (incl. notifications) +
// tools-widget sub-page + widget-public (public unauthenticated /w/$slug) +
// assistant-pane (right-pane slot).
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

  it('tools-widget renderer shows empty state when no widgets configured', () => {
    const config = defaultStudioConfig('huminic')
    const Renderer = consoleRenderers['customer-console.tools-widget']
    const { container } = render(
      <Renderer profile="huminic" config={config} params={{}} />,
    )
    expect(container.textContent).toContain('No widgets are set up yet')
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

  it('data renderer surfaces the customer metric groups + the build affordance', async () => {
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
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true, reports }), { status: 200 }),
      )
    vi.stubGlobal('fetch', fetchMock)
    try {
      const config = defaultStudioConfig('huminic')
      const Renderer = consoleRenderers['customer-console.data']
      const { container, findByText } = render(
        <Renderer profile="huminic" config={config} params={{}} />,
      )
      await findByText('Dashboard')
      const txt = container.textContent ?? ''
      // Customer-language headline metrics:
      expect(txt).toContain('Calls received')
      expect(txt).toContain('Texts sent')
      expect(txt).toContain('Leads')
      // Follow-up performance group:
      expect(txt).toContain('Follow-up performance')
      expect(txt).toContain('Immediate')
      expect(txt).toContain('24h check-in')
      // Campaigns group:
      expect(txt).toContain('Campaigns')
      // Build-your-own builder, friendly (no backend strings):
      expect(txt).toContain('Build your own dashboard')
      expect(txt).toMatch(/Add card/i)
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
  })

  it('comms renderer shows the take-over control + customer-info panel + handling badge', async () => {
    // WS-8: with a selected thread loaded, the renderer must surface the
    // customer-info panel (req #2), the channel filter (req #4), the
    // who-is-handling badge and the take-over control (req #5).
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
      // Customer-info panel + conversation header populated from the contact
      // (req #2). The display name now appears in both the panel and the
      // conversation header, so assert "at least one".
      const named = await findAllByText('Pat Buyer')
      expect(named.length).toBeGreaterThan(0)
      const root = container as HTMLElement
      expect(
        root.querySelector('[data-role="customer-info-panel"]'),
      ).not.toBeNull()
      // Channel filter tabs (req #4 as a filter).
      expect(
        root.querySelector('[data-role="comms-channel-filter"]'),
      ).not.toBeNull()
      // Handling badge defaults to the AI agent (req #5).
      const badge = root.querySelector('[data-role="handling-badge"]')
      expect(badge?.getAttribute('data-handler')).toBe('agent')
      // Take-over control present (req #5).
      expect(root.querySelector('[data-role="take-over"]')).not.toBeNull()
      const txt = root.textContent ?? ''
      expect(txt).toContain('pat@example.com')
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
