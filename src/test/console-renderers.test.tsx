// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import {
  consoleRenderers,
  getRenderer,
  listRendererKeys,
} from '@/lib/console-renderers'
import { defaultStudioConfig } from '@/lib/studio-config'

// Phase C 6-page IA. 9 renderer keys total: 6 page renderers + tools-widget
// sub-page + widget-public (public unauthenticated /w/$slug) + assistant-pane
// (right-pane slot).
const EXPECTED_KEYS = [
  'customer-console.chat',
  'customer-console.knowledge',
  'customer-console.tools',
  'customer-console.tools-widget',
  'customer-console.data',
  'customer-console.comms',
  'customer-console.campaigns',
  'customer-console.widget-public',
  'customer-console.assistant-pane',
]

describe('console-renderers registry', () => {
  it('contains all 9 expected renderer keys', () => {
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
    expect(container.textContent).toContain('Loading agents')
    expect(container.textContent).toContain('strukture')
  })

  it('knowledge renderer references the profile-scoped knowledge path', () => {
    const config = defaultStudioConfig('cedar-ridge')
    const Renderer = consoleRenderers['customer-console.knowledge']
    const { container } = render(
      <Renderer profile="cedar-ridge" config={config} params={{}} />,
    )
    expect(container.textContent).toContain('cedar-ridge')
  })

  it('tools-widget renderer shows empty state when no widgets configured', () => {
    const config = defaultStudioConfig('huminic')
    const Renderer = consoleRenderers['customer-console.tools-widget']
    const { container } = render(
      <Renderer profile="huminic" config={config} params={{}} />,
    )
    expect(container.textContent).toContain('No widgets declared')
  })

  it('data renderer surfaces federation read_scopes', () => {
    const config = defaultStudioConfig('huminic')
    config.federation.read_scopes = ['serra:knowledge/reports/published/*']
    const Renderer = consoleRenderers['customer-console.data']
    const { container } = render(
      <Renderer profile="huminic" config={config} params={{}} />,
    )
    expect(container.textContent).toContain('serra:')
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

  it('campaigns renderer surfaces the Service-only decision', () => {
    const config = defaultStudioConfig('huminic')
    const Renderer = consoleRenderers['customer-console.campaigns']
    const { container } = render(
      <Renderer profile="huminic" config={config} params={{}} />,
    )
    expect(container.textContent).toContain('Service')
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
