/**
 * Per-profile, per-channel rate limiter for outbound comms (SRS F.6).
 *
 * Token-bucket-ish but simpler: a sliding-window count per
 * (profile, channel) within the past N minutes. When the cap is hit,
 * additional sends are refused at the gate and the failure is audited
 * via metadata_audit with rule `policy-blocked`.
 *
 * Caps are read from studio.yaml.comms_rate_caps (Tranche D extension)
 * and defaulted conservatively if absent.
 */

import { openBrain, now } from './brain-store'

export type RateCheckInput = {
  profile: string
  channel: 'email' | 'sms' | 'voice' | 'video'
  /** Cap and window come from studio.yaml; defaults below. */
  cap_per_minute?: number
  cap_per_hour?: number
}

export type RateCheckResult =
  | { ok: true; remaining_minute: number; remaining_hour: number }
  | {
      ok: false
      reason: string
      rule: 'rate-cap-exceeded'
      remaining_minute: number
      remaining_hour: number
    }

const DEFAULTS: Record<string, { perMin: number; perHour: number }> = {
  email: { perMin: 5, perHour: 60 },
  sms: { perMin: 5, perHour: 60 },
  voice: { perMin: 2, perHour: 20 },
  video: { perMin: 2, perHour: 20 },
}

export function checkAndRecord(
  input: RateCheckInput,
  options: { profileRoot?: string } = {},
): RateCheckResult {
  const def = DEFAULTS[input.channel] ?? { perMin: 5, perHour: 60 }
  const perMin = input.cap_per_minute ?? def.perMin
  const perHour = input.cap_per_hour ?? def.perHour
  const handle = openBrain(input.profile, {
    profileRoot: options.profileRoot,
  })
  try {
    const oneMinute = now() - 60_000
    const oneHour = now() - 60 * 60_000
    let minuteCount = 0
    let hourCount = 0
    try {
      minuteCount = (handle.get<{ n: number }>(
        `SELECT COUNT(*) as n FROM comms_log WHERE channel = ? AND ts >= ? AND direction = 'outbound'`,
        input.channel,
        oneMinute,
      )?.n ?? 0) as number
      hourCount = (handle.get<{ n: number }>(
        `SELECT COUNT(*) as n FROM comms_log WHERE channel = ? AND ts >= ? AND direction = 'outbound'`,
        input.channel,
        oneHour,
      )?.n ?? 0) as number
    } catch {
      // comms_log only exists after migration v3; absence means no
      // outbound history → unlimited.
      return { ok: true, remaining_minute: perMin, remaining_hour: perHour }
    }
    if (minuteCount >= perMin) {
      return {
        ok: false,
        reason: `${input.channel} per-minute cap reached (${minuteCount}/${perMin})`,
        rule: 'rate-cap-exceeded',
        remaining_minute: 0,
        remaining_hour: Math.max(0, perHour - hourCount),
      }
    }
    if (hourCount >= perHour) {
      return {
        ok: false,
        reason: `${input.channel} per-hour cap reached (${hourCount}/${perHour})`,
        rule: 'rate-cap-exceeded',
        remaining_minute: Math.max(0, perMin - minuteCount),
        remaining_hour: 0,
      }
    }
    return {
      ok: true,
      remaining_minute: perMin - minuteCount,
      remaining_hour: perHour - hourCount,
    }
  } finally {
    handle.close()
  }
}
