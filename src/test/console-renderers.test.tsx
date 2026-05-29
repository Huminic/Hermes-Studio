// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import {
  consoleRenderers,
  getRenderer,
  listRendererKeys,
} from '@/lib/console-renderers'
import { defaultStudioConfig } from '@/lib/studio-config'

const EXPECTED_KEYS = [
  'customer-console.chat',
  'customer-console.dashboard-grid',
  'customer-console.widget-editor',
  'customer-console.service-kanban',
  'customer-console.widget-public',
  'customer-console.assistant-pane',
]

describe('console-renderers registry', () => {
  it('contains all 6 expected renderer keys', () => {
    const keys = listRendererKeys()
    for (const key of EXPECTED_KEYS) {
      expect(keys).toContain(key)
    }
    expect(keys).toHaveLength(EXPECTED_KEYS.length)
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

  it('dashboard-grid renderer shows empty state when no dashboards configured', () => {
    const config = defaultStudioConfig('huminic')
    const Renderer = consoleRenderers['customer-console.dashboard-grid']
    const { container } = render(
      <Renderer profile="huminic" config={config} params={{}} />,
    )
    expect(container.textContent).toContain('No dashboards declared')
  })

  it('widget-editor renderer shows empty state when no widgets configured', () => {
    const config = defaultStudioConfig('huminic')
    const Renderer = consoleRenderers['customer-console.widget-editor']
    const { container } = render(
      <Renderer profile="huminic" config={config} params={{}} />,
    )
    expect(container.textContent).toContain('No widgets declared')
  })

  it('chat renderer surfaces the persona_name from config', () => {
    const config = defaultStudioConfig('strukture')
    config.branding.persona_name = 'Automa'
    const Renderer = consoleRenderers['customer-console.chat']
    const { container } = render(
      <Renderer profile="strukture" config={config} params={{}} />,
    )
    expect(container.textContent).toContain('Automa')
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
})
