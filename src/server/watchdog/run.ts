/**
 * Semantic Watchdog pass runner. For each store: load its data surfaces, run
 * every AVAILABLE rule (availability-gated — missing inputs skip silently), upsert
 * findings (dedup/escalate), and auto-resolve findings that cleared. Rules never
 * throw (each is try-wrapped). Detection + persistence only; alert dispatch and
 * the hourly schedule are wired separately (sentinel-daemon-style).
 */
import { loadCockpitInputs } from '../messaging-hub-store'
import { readStudioConfig } from '../studio-config'
import { parseBusinessHours } from '../cockpit/cockpit-data'
import { resolveStale, upsertFinding } from './watchdog-store'
import type { RuleContext, WatchdogFinding, WatchdogRule } from './watchdog-types'
import { COMMS_CADENCE_RULES } from './rules/comms-cadence'

/** The full catalog of active rules. Grows as catalog rules are implemented. */
export const ALL_RULES: Array<WatchdogRule> = [...COMMS_CADENCE_RULES]

export type WatchdogPassResult = {
  profile: string
  evaluated: number
  skipped: number
  found: number
  created: number
  escalated: number
  resolved: number
  /** New/escalated findings this pass (candidates for alerting). */
  alerts: Array<WatchdogFinding>
}

export type RunOpts = {
  now?: number
  windowDays?: number
  rules?: Array<WatchdogRule>
  profileRoot?: string
}

export function runWatchdogForProfile(
  profile: string,
  opts: RunOpts = {},
): WatchdogPassResult {
  const now = opts.now ?? Date.now()
  const windowDays = opts.windowDays ?? 30
  const sinceMs = now - windowDays * 86_400_000

  let hub = null
  try {
    hub = loadCockpitInputs(profile, sinceMs, now)
  } catch {
    hub = null // availability-safe: no hub → comms rules just skip
  }

  let businessHours = { tz: 'America/New_York', openH: 8, closeH: 21, closedDays: [] as Array<string> }
  try {
    const { config } = readStudioConfig(profile)
    businessHours = parseBusinessHours((config.comms?.business_hours ?? {}) as never)
  } catch {
    /* default window */
  }

  const ctx: RuleContext = { profile, now, windowDays, hub, businessHours, history: {} }
  const rules = opts.rules ?? ALL_RULES

  const seen: Array<string> = []
  const alerts: Array<WatchdogFinding> = []
  let evaluated = 0
  let skipped = 0
  let created = 0
  let escalated = 0

  for (const rule of rules) {
    if (!rule.isAvailable(ctx)) {
      skipped++
      continue // availability gate — never errors, never a blank tile
    }
    evaluated++
    let findings: Array<WatchdogFinding> = []
    try {
      findings = rule.run(ctx)
    } catch {
      findings = [] // a rule failure never breaks the pass
    }
    for (const f of findings) {
      seen.push(f.key)
      const r = upsertFinding(f, now, { profileRoot: opts.profileRoot })
      if (r.isNew) created++
      if (r.escalated) escalated++
      if (r.isNew || r.escalated) alerts.push(f)
    }
  }

  const resolved = resolveStale(profile, seen, now, { profileRoot: opts.profileRoot })
  return { profile, evaluated, skipped, found: seen.length, created, escalated, resolved, alerts }
}

export function runWatchdogPass(
  profiles: Array<string>,
  opts: RunOpts = {},
): Array<WatchdogPassResult> {
  return profiles.map((p) => runWatchdogForProfile(p, opts))
}
