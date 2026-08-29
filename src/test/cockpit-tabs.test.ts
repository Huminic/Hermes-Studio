// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { defaultStudioConfig, type StudioConfig } from '@/lib/studio-config'
import { CORE_COCKPIT_TABS, isTabEnabled, isWorkspaceMenuEnabled } from '@/lib/cockpit-tabs'

/** A config whose legacy menu flags are ALL off, to prove core tabs ignore them. */
function allMenusOff(): StudioConfig {
  const cfg = defaultStudioConfig('serra-honda')
  const menu = cfg.menu as Record<string, boolean>
  for (const k of Object.keys(menu)) menu[k] = false
  return cfg
}

describe('cockpit sidebar tab enablement', () => {
  it('Marketing (campaigns) is a CORE tab and stays navigable even when menu.campaigns is false', () => {
    expect(CORE_COCKPIT_TABS.has('campaigns')).toBe(true)
    const cfg = defaultStudioConfig('serra-honda')
    ;(cfg.menu as Record<string, boolean>).campaigns = false
    // Regression: /campaigns renders, so the sidebar entry must NOT be disabled.
    expect(isTabEnabled(cfg, 'campaigns')).toBe(true)
  })

  it('every core dashboard tab is enabled even with all legacy menu flags off', () => {
    const cfg = allMenusOff()
    for (const id of [
      'cockpit',
      'issues',
      'ai-activity',
      'pipeline',
      'leads',
      'sales',
      'halo',
      'campaigns',
      'custom',
    ]) {
      expect(isTabEnabled(cfg, id)).toBe(true)
    }
  })

  it('retained workspace surfaces still honour the store menu config', () => {
    const cfg = defaultStudioConfig('serra-honda')
    // chat is NOT a core tab — it follows config.menu.chat.
    expect(CORE_COCKPIT_TABS.has('chat')).toBe(false)
    ;(cfg.menu as Record<string, boolean>).chat = false
    expect(isTabEnabled(cfg, 'chat')).toBe(false)
    ;(cfg.menu as Record<string, boolean>).chat = true
    expect(isTabEnabled(cfg, 'chat')).toBe(true)
  })

  it('isWorkspaceMenuEnabled resolves infostore via infostore→knowledge→data fallback', () => {
    const cfg = defaultStudioConfig('serra-honda')
    const menu = cfg.menu as Record<string, boolean | undefined>
    delete menu.infostore
    menu.knowledge = false
    menu.data = false
    expect(isWorkspaceMenuEnabled(cfg, 'infostore')).toBe(false)
    menu.knowledge = true
    expect(isWorkspaceMenuEnabled(cfg, 'infostore')).toBe(true)
  })
})
