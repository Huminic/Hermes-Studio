import { describe, it, expect } from 'vitest'
import { defaultStudioConfig, parseStudioConfig } from '@/lib/studio-config'
import {
  renderTriggerTemplate,
  renderTrigger1,
  renderTrigger2,
  shouldFireTrigger1,
  shouldFireTrigger2,
  isThirdParty,
  resolveDomain,
  type TriggerLead,
} from '@/server/sms-triggers'

// The approved verbatim copy (operator spec, 2026-06). Tests assert the
// defaults are EXACTLY this so a silent copy drift fails CI.
const APPROVED = {
  t1_sales:
    "Hi {{first_name}}, I'm Caroline with Serra Honda. I saw you were looking at{{ the <vehicle>}} — we'd love to get you in for a test drive, but I need a couple quick details first so we set it up right. What's the best day for you to come by? Reply STOP to opt out.",
  t1_service:
    "Hi {{first_name}}, this is Nancy with Serra Service. I saw your service request{{ for your <vehicle>}}. I'd love to get you scheduled — just need a little more info first. What's going on with the vehicle, and when works to bring it in? Reply STOP to opt out.",
  t2_sales:
    "Hi {{first_name}}, it's Caroline at Serra Honda. Just making sure someone got in touch with you{{ about the <vehicle>}}. Is everything okay with your experience? If something's off I can make sure our manager knows — or let me know how else I can help.",
  t2_service:
    "Hi {{first_name}}, it's Nancy at Serra Service. Just checking that someone followed up{{ on your <vehicle>}}. Is everything okay with your experience so far? If anything's off I'll flag it for our service manager — or tell me what else I can help with.",
}

describe('sms_triggers config defaults — backward-compatible, OFF by default', () => {
  it('default config has both triggers DISABLED', () => {
    const cfg = defaultStudioConfig('serra-honda').sms_triggers
    expect(cfg.trigger1.enabled).toBe(false)
    expect(cfg.trigger2.enabled).toBe(false)
  })

  it('an empty YAML (no sms_triggers key) parses with both triggers OFF', () => {
    const r = parseStudioConfig('branding:\n  persona_name: Serra Honda\n')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.config.sms_triggers.trigger1.enabled).toBe(false)
      expect(r.config.sms_triggers.trigger2.enabled).toBe(false)
      // trigger1 third-party gate defaults ON.
      expect(r.config.sms_triggers.trigger1.third_party_only).toBe(true)
      // trigger2 window defaults to 24h.
      expect(r.config.sms_triggers.trigger2.window_min).toBe(1440)
    }
  })

  it('default templates are EXACTLY the approved verbatim copy', () => {
    const cfg = defaultStudioConfig('serra-honda').sms_triggers
    expect(cfg.trigger1.template_sales).toBe(APPROVED.t1_sales)
    expect(cfg.trigger1.template_service).toBe(APPROVED.t1_service)
    expect(cfg.trigger2.template_sales).toBe(APPROVED.t2_sales)
    expect(cfg.trigger2.template_service).toBe(APPROVED.t2_service)
  })

  it('parses an explicit enabled+domain block without dropping other keys', () => {
    const r = parseStudioConfig(`
branding:
  persona_name: Serra Service
sms_triggers:
  domain: service
  trigger1:
    enabled: true
  trigger2:
    enabled: true
    window_min: 720
`)
    expect(r.ok).toBe(true)
    if (r.ok) {
      const st = r.config.sms_triggers
      expect(st.domain).toBe('service')
      expect(st.trigger1.enabled).toBe(true)
      expect(st.trigger1.third_party_only).toBe(true) // default preserved
      expect(st.trigger2.enabled).toBe(true)
      expect(st.trigger2.window_min).toBe(720)
      // Templates fall back to approved defaults when not overridden.
      expect(st.trigger1.template_service).toBe(APPROVED.t1_service)
    }
  })
})

describe('renderTriggerTemplate — placeholder substitution', () => {
  it('fills {{first_name}} and the optional vehicle clause when vehicle is known', () => {
    const out = renderTriggerTemplate(APPROVED.t1_sales, {
      first_name: 'Marcus',
      vehicle: '2024 Honda Accord',
    })
    expect(out).toBe(
      "Hi Marcus, I'm Caroline with Serra Honda. I saw you were looking at the 2024 Honda Accord — we'd love to get you in for a test drive, but I need a couple quick details first so we set it up right. What's the best day for you to come by? Reply STOP to opt out.",
    )
  })

  it('OMITS the optional vehicle clause (and its leading space) when vehicle is absent', () => {
    const out = renderTriggerTemplate(APPROVED.t1_sales, { first_name: 'Priya', vehicle: null })
    expect(out).toBe(
      "Hi Priya, I'm Caroline with Serra Honda. I saw you were looking at — we'd love to get you in for a test drive, but I need a couple quick details first so we set it up right. What's the best day for you to come by? Reply STOP to opt out.",
    )
    // No leftover braces, no double space introduced by the omission.
    expect(out).not.toContain('{{')
    expect(out).not.toContain('}}')
  })

  it('treats empty-string vehicle as absent', () => {
    const out = renderTriggerTemplate(APPROVED.t2_service, { first_name: 'Dana', vehicle: '   ' })
    expect(out).not.toContain('on your')
    expect(out).toContain('Just checking that someone followed up.')
  })

  it('falls back to "there" when first name is null', () => {
    const out = renderTriggerTemplate(APPROVED.t1_service, { first_name: null, vehicle: null })
    expect(out.startsWith('Hi there, this is Nancy')).toBe(true)
  })
})

describe('resolveDomain + render helpers', () => {
  it('defaults domain to sales when unset', () => {
    const cfg = defaultStudioConfig('x').sms_triggers
    expect(resolveDomain(cfg)).toBe('sales')
  })

  it('renderTrigger1/2 pick the service variant when domain=service', () => {
    const base = defaultStudioConfig('x').sms_triggers
    const cfg = { ...base, domain: 'service' as const }
    const lead: TriggerLead = { first_name: 'Marcus', vehicle: '2024 Accord', source: 'third_party' }
    expect(renderTrigger1(cfg, lead)).toContain('Nancy with Serra Service')
    expect(renderTrigger2(cfg, lead)).toContain('Nancy at Serra Service')
  })
})

describe('isThirdParty — Trigger-1 source gate (fail-closed scaffold)', () => {
  it('true only for explicit third_party', () => {
    expect(isThirdParty({ source: 'third_party' })).toBe(true)
    expect(isThirdParty({ source: 'first_party' })).toBe(false)
    expect(isThirdParty({ source: 'unknown' })).toBe(false)
    expect(isThirdParty({})).toBe(false)
  })
})

describe('shouldFireTrigger1 — config + source eligibility', () => {
  it('never fires when disabled (default)', () => {
    const cfg = defaultStudioConfig('x').sms_triggers
    expect(shouldFireTrigger1(cfg, { source: 'third_party' }).fire).toBe(false)
  })

  it('fires for a third-party lead when enabled', () => {
    const base = defaultStudioConfig('x').sms_triggers
    const cfg = { ...base, trigger1: { ...base.trigger1, enabled: true } }
    expect(shouldFireTrigger1(cfg, { source: 'third_party' }).fire).toBe(true)
  })

  it('blocks first-party leads when third_party_only is on', () => {
    const base = defaultStudioConfig('x').sms_triggers
    const cfg = { ...base, trigger1: { ...base.trigger1, enabled: true } }
    const r = shouldFireTrigger1(cfg, { source: 'first_party' })
    expect(r.fire).toBe(false)
    expect(r.reason).toContain('first-party')
  })

  it('blocks unknown-source leads (fail-closed) when third_party_only is on', () => {
    const base = defaultStudioConfig('x').sms_triggers
    const cfg = { ...base, trigger1: { ...base.trigger1, enabled: true } }
    const r = shouldFireTrigger1(cfg, { source: 'unknown' })
    expect(r.fire).toBe(false)
    expect(r.reason).toContain('unknown')
  })

  it('fires for any source when third_party_only is off', () => {
    const base = defaultStudioConfig('x').sms_triggers
    const cfg = {
      ...base,
      trigger1: { ...base.trigger1, enabled: true, third_party_only: false },
    }
    expect(shouldFireTrigger1(cfg, { source: 'first_party' }).fire).toBe(true)
    expect(shouldFireTrigger1(cfg, { source: 'unknown' }).fire).toBe(true)
  })
})

describe('shouldFireTrigger2 — all leads, window gate', () => {
  it('never fires when disabled (default)', () => {
    const cfg = defaultStudioConfig('x').sms_triggers
    expect(shouldFireTrigger2(cfg).fire).toBe(false)
  })

  it('fires for all leads once enabled and window reached', () => {
    const base = defaultStudioConfig('x').sms_triggers
    const cfg = { ...base, trigger2: { ...base.trigger2, enabled: true } }
    expect(shouldFireTrigger2(cfg, { sinceFirstContactMin: 1500 }).fire).toBe(true)
  })

  it('holds before the window is reached', () => {
    const base = defaultStudioConfig('x').sms_triggers
    const cfg = { ...base, trigger2: { ...base.trigger2, enabled: true } }
    const r = shouldFireTrigger2(cfg, { sinceFirstContactMin: 100 })
    expect(r.fire).toBe(false)
    expect(r.reason).toContain('window not reached')
  })

  it('fires when no window arg is provided (caller handles timing)', () => {
    const base = defaultStudioConfig('x').sms_triggers
    const cfg = { ...base, trigger2: { ...base.trigger2, enabled: true } }
    expect(shouldFireTrigger2(cfg).fire).toBe(true)
  })
})

describe('dry-run renderer parity — produces the approved copy verbatim', () => {
  it('sales trigger-1 with vehicle matches the dry-run preview line', () => {
    const base = defaultStudioConfig('preview').sms_triggers
    const cfg = { ...base, domain: 'sales' as const }
    const out = renderTrigger1(cfg, {
      first_name: 'Marcus',
      vehicle: '2024 Honda Accord',
      source: 'third_party',
    })
    expect(out).toBe(
      "Hi Marcus, I'm Caroline with Serra Honda. I saw you were looking at the 2024 Honda Accord — we'd love to get you in for a test drive, but I need a couple quick details first so we set it up right. What's the best day for you to come by? Reply STOP to opt out.",
    )
  })

  it('service trigger-2 without vehicle matches the dry-run preview line', () => {
    const base = defaultStudioConfig('preview').sms_triggers
    const cfg = { ...base, domain: 'service' as const }
    const out = renderTrigger2(cfg, { first_name: 'Priya', vehicle: null, source: 'third_party' })
    expect(out).toBe(
      "Hi Priya, it's Nancy at Serra Service. Just checking that someone followed up. Is everything okay with your experience so far? If anything's off I'll flag it for our service manager — or tell me what else I can help with.",
    )
  })
})
