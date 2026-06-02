import { describe, it, expect } from 'vitest'
import {
  parseStudioConfig,
  defaultStudioConfig,
  credentialModeFor,
} from '@/lib/studio-config'

describe('credentialModeFor (shared/own channel credential selection)', () => {
  it('defaults every channel to shared when no config given', () => {
    const cfg = defaultStudioConfig('huminic')
    for (const ch of ['sms', 'vapi', 'tavus', 'email'] as const) {
      expect(credentialModeFor(cfg, ch)).toBe('shared')
    }
  })

  it('honors an explicit per-channel own override', () => {
    const r = parseStudioConfig(`
branding:
  persona_name: Test
channel_credentials:
  default: shared
  vapi: own
`)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(credentialModeFor(r.config, 'vapi')).toBe('own')
      expect(credentialModeFor(r.config, 'sms')).toBe('shared') // falls to default
      expect(credentialModeFor(r.config, 'tavus')).toBe('shared')
    }
  })

  it('honors a profile-wide default of own', () => {
    const r = parseStudioConfig(`
branding:
  persona_name: Test
channel_credentials:
  default: own
  sms: shared
`)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(credentialModeFor(r.config, 'sms')).toBe('shared') // explicit wins
      expect(credentialModeFor(r.config, 'vapi')).toBe('own') // default
      expect(credentialModeFor(r.config, 'tavus')).toBe('own')
      expect(credentialModeFor(r.config, 'email')).toBe('own')
    }
  })

  it('rejects an invalid credential mode', () => {
    const r = parseStudioConfig(`
branding:
  persona_name: Test
channel_credentials:
  sms: borrowed
`)
    expect(r.ok).toBe(false)
  })
})

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
      expect(result.config.menu.knowledge).toBe(true)
      expect(result.config.menu.tools).toBe(true)
      expect(result.config.menu.data).toBe(true)
      expect(result.config.menu.comms).toBe(true)
      expect(result.config.menu.campaigns).toBe(true)
      expect(result.config.widgets).toEqual([])
      expect(result.config.federation.read_scopes).toEqual([])
      expect(result.config.autonomous_reply_defaults.enabled).toBe(false)
      expect(result.config.autonomous_reply_defaults.max_agent_turns).toBe(3)
    }
  })

  it('rejects when branding.persona_name is missing', () => {
    const result = parseStudioConfig(`branding: {}\n`)
    expect(result.ok).toBe(false)
  })

  it('parses a full config with menu, widgets, agent_picker, autonomous_reply, federation', () => {
    const result = parseStudioConfig(`
branding:
  persona_name: Automa
  accent_color: "#1e40af"
  logo_path: branding/huminic-logo.svg
menu:
  comms: false
agent_picker:
  visible_agents:
    - caroline
    - lead-followup-agent
  default_agent: caroline
tools_widget:
  show_embed_snippet: true
  show_live_demo: false
widgets:
  - slug: huminic-hero
    mode: chat
    agent: huminic-lead-response
autonomous_reply_defaults:
  enabled: true
  business_hours_only: true
  max_agent_turns: 5
  channels:
    - sms
    - email
federation:
  read_scopes:
    - "serra-automotive:knowledge/reports/published/*"
`)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.config.branding.accent_color).toBe('#1e40af')
      expect(result.config.menu.comms).toBe(false)
      expect(result.config.menu.chat).toBe(true)
      expect(result.config.agent_picker.visible_agents).toEqual([
        'caroline',
        'lead-followup-agent',
      ])
      expect(result.config.agent_picker.default_agent).toBe('caroline')
      expect(result.config.tools_widget.show_live_demo).toBe(false)
      expect(result.config.widgets).toHaveLength(1)
      expect(result.config.widgets[0].mode).toBe('chat')
      expect(result.config.autonomous_reply_defaults.enabled).toBe(true)
      expect(result.config.autonomous_reply_defaults.max_agent_turns).toBe(5)
      expect(result.config.autonomous_reply_defaults.channels).toEqual([
        'sms',
        'email',
      ])
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

  it('rejects invalid autonomous_reply channel', () => {
    const result = parseStudioConfig(`
branding:
  persona_name: x
autonomous_reply_defaults:
  channels:
    - bogus-channel
`)
    expect(result.ok).toBe(false)
  })
})

describe('defaultStudioConfig', () => {
  it('returns a config with the profile name as persona_name', () => {
    const config = defaultStudioConfig('strukture')
    expect(config.branding.persona_name).toBe('strukture')
    expect(config.menu.chat).toBe(true)
    expect(config.menu.knowledge).toBe(true)
    expect(config.menu.tools).toBe(true)
    expect(config.menu.data).toBe(true)
    expect(config.menu.comms).toBe(true)
    expect(config.menu.campaigns).toBe(true)
    expect(config.widgets).toEqual([])
    expect(config.autonomous_reply_defaults.enabled).toBe(false)
  })

  it('produces a config with no old IA menu flags', () => {
    const config = defaultStudioConfig('huminic') as unknown as Record<
      string,
      unknown
    >
    expect((config.menu as Record<string, unknown>).dashboard).toBeUndefined()
    expect((config.menu as Record<string, unknown>).widget).toBeUndefined()
    expect((config.menu as Record<string, unknown>).service).toBeUndefined()
  })
})
