/**
 * SMS FAST-FOLLOW TRIGGERS — config-driven rendering + gating helpers (operator
 * spec, 2026-06). This module is PURE: it renders the approved trigger copy from
 * the per-profile `sms_triggers` config and reports whether a trigger SHOULD
 * fire. It does NOT send, does NOT touch CommGate, TextMagic, or central-mcp.
 * The actual dispatch path stays in vin-watcher / lead-flow (gated by CommGate +
 * the pre-launch allowlist); this module is the config + copy layer feeding it.
 *
 * Two triggers (see SmsTriggersSchema in lib/studio-config.ts):
 *   Trigger 1 (immediate) — third-party leads only. Caroline/Nancy outreach.
 *   Trigger 2 (24h)       — all leads. Check-in / insurance follow-up.
 *
 * SAFETY POSTURE: both triggers DEFAULT enabled:false. Nothing here enables an
 * outbound path; `shouldFire*` returning true only means "config + window say
 * eligible" — the send still has to clear every CommGate layer downstream.
 */

import type { SmsTriggersConfig } from '../lib/studio-config'

export type TriggerDomain = 'sales' | 'service'

/** A lead's shape as far as the trigger layer cares (name + optional vehicle). */
export type TriggerLead = {
  first_name: string | null
  vehicle?: string | null
  /**
   * Lead source classification. UNKNOWN by default — the live field that marks a
   * third-party source is a Duane decision and is NOT yet wired (see
   * isThirdParty). Once confirmed, the watcher/flow caller sets this.
   */
  source?: LeadSource
}

/**
 * Lead-source classification for the Trigger-1 third-party gate.
 *   'third_party' — came from an external marketplace/aggregator (Cars.com,
 *     AutoTrader, CarGurus, an OEM lead, etc.). Trigger 1 is FOR these.
 *   'first_party' — our own widget/chat/form/system lead. Trigger 1 SKIPS these.
 *   'unknown'     — not yet classified (default until the source field is wired).
 */
export type LeadSource = 'third_party' | 'first_party' | 'unknown'

/**
 * Render a trigger template against a lead.
 *
 * Placeholders:
 *   {{first_name}}            → the lead's first name (falls back to "there").
 *   {{ <text with <vehicle>> }} → an OPTIONAL clause. Rendered (with <vehicle>
 *      substituted) only when a non-empty vehicle is known; otherwise the entire
 *      clause is dropped. The clause's own leading space lives INSIDE the braces
 *      in the approved copy, so omission leaves no double space.
 *
 * Pure string transform — no I/O, no side effects.
 */
export function renderTriggerTemplate(
  template: string,
  lead: Pick<TriggerLead, 'first_name' | 'vehicle'>,
): string {
  const firstName = lead.first_name?.trim() || 'there'
  const vehicle = lead.vehicle?.trim() || null

  // Resolve the optional vehicle clause(s): {{ ...<vehicle>... }}.
  let out = template.replace(/\{\{([^}]*<vehicle>[^}]*)\}\}/g, (_m, inner: string) => {
    if (!vehicle) return ''
    return inner.replace(/<vehicle>/g, vehicle)
  })

  // First-name placeholder.
  out = out.replace(/\{\{\s*first_name\s*\}\}/g, firstName)

  return out
}

/** Resolve the copy variant for a trigger from the config domain (default sales). */
export function resolveDomain(config: SmsTriggersConfig): TriggerDomain {
  return config.domain ?? 'sales'
}

/** Pick the Trigger-1 template for the resolved domain. */
export function trigger1Template(config: SmsTriggersConfig): string {
  const t1 = config.trigger1
  return resolveDomain(config) === 'service' ? t1.template_service : t1.template_sales
}

/** Pick the Trigger-2 template for the resolved domain. */
export function trigger2Template(config: SmsTriggersConfig): string {
  const t2 = config.trigger2
  return resolveDomain(config) === 'service' ? t2.template_service : t2.template_sales
}

/** Render the filled Trigger-1 (immediate) text for a lead. */
export function renderTrigger1(config: SmsTriggersConfig, lead: TriggerLead): string {
  return renderTriggerTemplate(trigger1Template(config), lead)
}

/** Render the filled Trigger-2 (24h check-in) text for a lead. */
export function renderTrigger2(config: SmsTriggersConfig, lead: TriggerLead): string {
  return renderTriggerTemplate(trigger2Template(config), lead)
}

/**
 * THIRD-PARTY SOURCE GATE (Trigger 1) — SCAFFOLD, not yet wired live.
 *
 * Duane-gated: the authoritative lead-source field for Studio leads has not been
 * confirmed (which VIN/lead attribute marks a third-party vs. our-own-widget
 * source). Until then this returns:
 *   - true  for an explicit 'third_party' source,
 *   - false for an explicit 'first_party' source,
 *   - false for 'unknown' (default) — FAIL-CLOSED: we do NOT fire Trigger 1 on a
 *     lead we cannot prove is third-party, so an unconfigured source never
 *     mistakenly texts our own widget leads.
 *
 * WIRE-UP POINT: the watcher/flow caller must classify the VIN lead row into a
 * LeadSource (e.g. from a `leadSource` / `provider` field) and pass it on
 * TriggerLead.source. That mapping is the Duane decision.
 */
export function isThirdParty(lead: Pick<TriggerLead, 'source'>): boolean {
  return lead.source === 'third_party'
}

/**
 * Should Trigger 1 (immediate) fire for this lead, per CONFIG only?
 * - trigger1.enabled must be true (DEFAULT false → never fires).
 * - when third_party_only (DEFAULT true), the lead must classify third-party.
 * Window/dedup/business-hours and the CommGate layers are enforced elsewhere;
 * this is the config + source eligibility check only.
 */
export function shouldFireTrigger1(
  config: SmsTriggersConfig,
  lead: Pick<TriggerLead, 'source'>,
): { fire: boolean; reason: string } {
  if (!config.trigger1.enabled) {
    return { fire: false, reason: 'trigger1 disabled (default off)' }
  }
  if (config.trigger1.third_party_only && !isThirdParty(lead)) {
    return {
      fire: false,
      reason:
        lead.source === 'first_party'
          ? 'trigger1 third-party-only: lead is first-party (our widget/system)'
          : 'trigger1 third-party-only: lead source unknown (fail-closed — source field is Duane-gated)',
    }
  }
  return { fire: true, reason: 'trigger1 eligible' }
}

/**
 * Should Trigger 2 (24h check-in) fire for this lead, per CONFIG + window only?
 * Trigger 2 applies to ALL leads (no source gate), so the only config gate is
 * trigger2.enabled. `sinceFirstContactMin` is checked against window_min when
 * provided. Fully implementable now (no Duane dependency).
 */
export function shouldFireTrigger2(
  config: SmsTriggersConfig,
  opts?: { sinceFirstContactMin?: number },
): { fire: boolean; reason: string } {
  if (!config.trigger2.enabled) {
    return { fire: false, reason: 'trigger2 disabled (default off)' }
  }
  const since = opts?.sinceFirstContactMin
  if (typeof since === 'number' && since < config.trigger2.window_min) {
    return {
      fire: false,
      reason: `trigger2 window not reached (${Math.round(since)}m < ${config.trigger2.window_min}m)`,
    }
  }
  return { fire: true, reason: 'trigger2 eligible' }
}
