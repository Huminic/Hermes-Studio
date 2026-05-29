import { describe, it, expect } from 'vitest'
import {
  parseStudioConfig,
  defaultStudioConfig,
} from '@/lib/studio-config'

describe('parseStudioConfig', () => {
  it('parses minimum valid config', () => {
    const result = parseStudioConfig(`
branding:
  persona_name: Automa
`)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.config.branding.persona_name).toBe('Automa')
      expect(result.config.menu.chat).toBe(true)
      expect(result.config.dashboards).toEqual([])
      expect(result.config.federation.read_scopes).toEqual([])
    }
  })

  it('rejects when branding.persona_name is missing', () => {
    const result = parseStudioConfig(`branding: {}\n`)
    expect(result.ok).toBe(false)
  })

  it('parses a full config with dashboards, widgets, and federation', () => {
    const result = parseStudioConfig(`
branding:
  persona_name: Automa
  accent_color: "#1e40af"
  logo_path: branding/huminic-logo.svg
menu:
  service: false
dashboards:
  - slug: sales-overview
    title: Sales Overview
    artifact_path: knowledge/dashboards/sales-overview.md
widgets:
  - slug: huminic-hero
    mode: chat
    agent: huminic-lead-response
federation:
  read_scopes:
    - "serra-automotive:knowledge/reports/published/*"
`)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.config.branding.accent_color).toBe('#1e40af')
      expect(result.config.menu.service).toBe(false)
      expect(result.config.menu.chat).toBe(true)
      expect(result.config.dashboards).toHaveLength(1)
      expect(result.config.widgets[0].mode).toBe('chat')
      expect(result.config.federation.read_scopes).toHaveLength(1)
    }
  })

  it('rejects invalid accent_color', () => {
    const result = parseStudioConfig(`
branding:
  persona_name: x
  accent_color: not-a-hex
`)
    expect(result.ok).toBe(false)
  })

  it('rejects invalid widget mode', () => {
    const result = parseStudioConfig(`
branding:
  persona_name: x
widgets:
  - slug: w
    mode: invalid
    agent: a
`)
    expect(result.ok).toBe(false)
  })
})

describe('defaultStudioConfig', () => {
  it('returns a config with the profile name as persona_name', () => {
    const config = defaultStudioConfig('strukture')
    expect(config.branding.persona_name).toBe('strukture')
    expect(config.menu.chat).toBe(true)
    expect(config.dashboards).toEqual([])
  })
})
