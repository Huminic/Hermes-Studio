/**
 * CommGate — fail-closed outbound gate, mirrors Nexxus `checkCommGate`.
 *
 * Layered, in order, before ANY outbound send:
 *   1. GLOBAL kill switch — env OUTBOUND_LIVE_ENABLED must be exactly "true".
 *   2. Per-profile outbound_enabled (studio.yaml comms).
 *   3. Per-channel enable flag (studio.yaml comms.channels).
 *   4. TCPA business-hours window (sms + voice), profile tz; bypassable.
 *   5. Blacklist (STOP / opt-out), per-profile Brain.
 *   6. LIVE VinSolutions lead-status check (sms + voice) via central-mcp
 *      vin_query_leads — when the profile declares a VIN federation scope and
 *      comms.vin_check is on. VIN is queried live; it is never synced.
 *   7. Rate limit (per profile+channel) via comms-rate-limiter.
 *
 * A failure returns {ok:false, rule, reason}; the caller records a blocked
 * outbound (local record) instead of sending. Never throws.
 */

import { readStudioConfig } from './studio-config'
import { checkAndRecord } from './comms-rate-limiter'
import { isBlacklisted } from './comms-blacklist'
import { callCentralMcpTool } from './central-mcp'
import { resolveVinOrgId } from './vin-client'
import type { StudioConfig } from '../lib/studio-config'

export type GateChannel = 'sms' | 'voice' | 'video' | 'email'

export type CommGateResult = { ok: true } | { ok: false; rule: string; reason: string }

export type CommGateInput = {
  profile: string
  channel: GateChannel
  /** Recipient handle (E.164 phone / email). */
  to: string
  options?: {
    profileRoot?: string
    bypassBusinessHours?: boolean
    /** Override "now" for deterministic tests. */
    nowMs?: number
    /** Inject the studio config (tests); otherwise read from disk. */
    config?: StudioConfig
    /** Record the send against the rate limiter when the gate passes (default true). */
    recordRate?: boolean
  }
}

/** Channels subject to the TCPA business-hours window + live VIN check. */
const REGULATED: ReadonlySet<GateChannel> = new Set(['sms', 'voice'])

function hasVinScope(config: StudioConfig): boolean {
  return (config.federation?.read_scopes ?? []).some((s) =>
    s.toLowerCase().includes('vin'),
  )
}

/** Minutes-since-midnight for "HH:MM". */
function hm(s: string): number {
  const [h, m] = s.split(':').map((x) => parseInt(x, 10))
  return h * 60 + m
}

export function withinBusinessHours(
  bh: { tz: string; start: string; end: string },
  nowMs: number,
): boolean {
  // Current wall-clock H:M in the profile timezone.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: bh.tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(nowMs))
  const hh = parts.find((p) => p.type === 'hour')?.value ?? '00'
  const mm = parts.find((p) => p.type === 'minute')?.value ?? '00'
  // Intl can emit "24" for midnight hour in hour12:false — normalise.
  const cur = (parseInt(hh, 10) % 24) * 60 + parseInt(mm, 10)
  const start = hm(bh.start)
  const end = hm(bh.end)
  return start <= end ? cur >= start && cur < end : cur >= start || cur < end
}

/**
 * Heuristic opt-out detection over a VIN lead-query response. VinSolutions marks
 * do-not-contact via flags/status; we look for the common shapes. Conservative:
 * only blocks on a clear opt-out signal, never on absence of data.
 */
export function leadOptedOut(data: unknown): boolean {
  if (data == null) return false
  const leads: Array<Record<string, unknown>> = Array.isArray(data)
    ? (data as Array<Record<string, unknown>>)
    : Array.isArray((data as { leads?: unknown }).leads)
      ? ((data as { leads: Array<Record<string, unknown>> }).leads)
      : Array.isArray((data as { rows?: unknown }).rows)
        ? ((data as { rows: Array<Record<string, unknown>> }).rows)
        : [data as Record<string, unknown>]
  const truthy = (v: unknown) =>
    v === true ||
    v === 1 ||
    (typeof v === 'string' && /^(true|yes|y|1|dnc|opt[-_ ]?out|do[-_ ]?not)/i.test(v.trim()))
  return leads.some((lead) => {
    for (const [k, v] of Object.entries(lead)) {
      const key = k.toLowerCase()
      if (
        (key.includes('donotcall') ||
          key.includes('do_not_call') ||
          key.includes('donotcontact') ||
          key.includes('do_not_contact') ||
          key.includes('dnc') ||
          key.includes('optout') ||
          key.includes('opt_out') ||
          key.includes('unsubscrib')) &&
        truthy(v)
      ) {
        return true
      }
      if (key === 'status' && typeof v === 'string' && /dnc|opt[-_ ]?out|do[-_ ]?not/i.test(v)) {
        return true
      }
    }
    return false
  })
}

async function vinDnc(
  profile: string,
  to: string,
  config: StudioConfig,
): Promise<{ optedOut: boolean; errored: boolean }> {
  // Live VIN query. We distinguish a clean answer from a lookup error so the
  // caller can decide the fail mode (fail-closed by default — see checkCommGate).
  // The broker keys VIN by the Nexxus org UUID, not the profile slug; an
  // unconfigured orgId is treated as an error so we fail CLOSED (we cannot prove
  // the recipient hasn't opted out).
  const org = resolveVinOrgId(profile, config)
  if (!org.ok) return { optedOut: false, errored: true }
  const r = await callCentralMcpTool('vin_query_leads', { orgId: org.orgId, phone: to })
  if (!r.ok) return { optedOut: false, errored: true }
  return { optedOut: leadOptedOut(r.data), errored: false }
}

export async function checkCommGate(input: CommGateInput): Promise<CommGateResult> {
  const o = input.options ?? {}
  const nowMs = o.nowMs ?? Date.now()

  // 1. Global kill switch (fail-closed: nothing sends unless explicitly enabled).
  if (process.env.OUTBOUND_LIVE_ENABLED !== 'true') {
    return {
      ok: false,
      rule: 'outbound-disabled-global',
      reason: 'OUTBOUND_LIVE_ENABLED is not "true" — global outbound kill switch is engaged',
    }
  }

  const config = o.config ?? readStudioConfig(input.profile).config
  const comms = config.comms

  // 2. Per-profile master switch.
  if (comms.outbound_enabled === false) {
    return { ok: false, rule: 'outbound-disabled-profile', reason: `outbound disabled for profile ${input.profile}` }
  }

  // 3. Per-channel switch.
  if (comms.channels && comms.channels[input.channel] === false) {
    return { ok: false, rule: 'channel-disabled', reason: `channel ${input.channel} disabled for ${input.profile}` }
  }

  // 4. TCPA business hours (sms + voice).
  if (REGULATED.has(input.channel) && !o.bypassBusinessHours) {
    if (!withinBusinessHours(comms.business_hours, nowMs)) {
      return {
        ok: false,
        rule: 'outside-business-hours',
        reason: `outside business hours (${comms.business_hours.start}-${comms.business_hours.end} ${comms.business_hours.tz}) for ${input.channel}`,
      }
    }
  }

  // 5. Blacklist / opt-out.
  if (isBlacklisted(input.profile, input.to, { profileRoot: o.profileRoot })) {
    return { ok: false, rule: 'blacklisted', reason: `recipient ${input.to} is opted out (blacklist)` }
  }

  // 6. Live VIN lead-status check (sms + voice), when scoped + enabled.
  if (REGULATED.has(input.channel) && comms.vin_check && hasVinScope(config)) {
    const vin = await vinDnc(input.profile, input.to, config)
    if (vin.optedOut) {
      return { ok: false, rule: 'vin-dnc', reason: `VinSolutions marks ${input.to} do-not-contact` }
    }
    // Lookup errored (VIN outage / not wired). Fail CLOSED by default — we
    // can't prove the recipient hasn't opted out — unless explicitly allowed.
    if (vin.errored && comms.vin_check_fail_open !== true) {
      return {
        ok: false,
        rule: 'vin-unavailable',
        reason: `VinSolutions DNC check unavailable for ${input.to}; blocking (set comms.vin_check_fail_open to send anyway)`,
      }
    }
  }

  // 7. Rate limit (and record this send when passing, unless told not to).
  const rateChannel =
    input.channel === 'voice' ? 'voice' : input.channel === 'video' ? 'video' : input.channel
  const caps = comms.rate_caps?.[input.channel]
  const rc = checkAndRecord(
    {
      profile: input.profile,
      channel: rateChannel,
      cap_per_minute: caps?.per_minute,
      cap_per_hour: caps?.per_hour,
    },
    { profileRoot: o.profileRoot },
  )
  if (!rc.ok) {
    return { ok: false, rule: rc.rule, reason: rc.reason }
  }

  return { ok: true }
}
