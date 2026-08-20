/**
 * Semantic Watchdog — core types. A first-class, cross-customer anomaly +
 * opportunity engine driven by the rule catalog (uploads/semantic-watchdog-catalog.md).
 *
 * Invariant #1: every rule declares `requiredInputs`; a rule whose inputs are
 * absent for a store is SKIPPED silently (never an error / blank / fabrication).
 * Baselines are per-dealer (each store vs its own history).
 */
import type { CockpitHubInputs } from '../messaging-hub-store'

/** The Issues-tab category field. */
export type WatchdogCategory =
  | 'Pipeline'
  | 'Leads'
  | 'Sales'
  | 'Marketing'
  | 'Finance'
  | 'General'

export type Priority = 'low' | 'medium' | 'high'
export type FindingStatus = 'open' | 'dismissed' | 'ignored' | 'resolved'

/** A single detected issue/opportunity — one row in the Issues manifest. */
export type WatchdogFinding = {
  /** Stable dedup identity (rule + entity). Same issue → same key across passes. */
  key: string
  profile: string
  rule_id: string
  category: WatchdogCategory
  priority: Priority
  /** "Issue" column — short title. */
  issue: string
  /** "Name" column — the entity/subject (rep, lead source, thread, contact…). */
  name: string
  /** "Details" column — plain-language explanation (also shown in the alert modal). */
  details: string
  /** Optional structured evidence: the baseline it deviated from, ids, counts. */
  evidence?: Record<string, unknown>
}

/** Data surfaces loaded once per store per pass. All optional + availability-gated. */
export type RuleContext = {
  profile: string
  now: number
  windowDays: number
  /** Teambox threads/messages/identities for the window (present when the store has comms). */
  hub: CockpitHubInputs | null
  /** Store business hours (for latency/after-hours rules). */
  businessHours: {
    tz: string
    openH: number
    closeH: number
    closedDays: Array<string>
  }
  /** Per-rule historical series for baselining (keyed by metric id). */
  history: Record<string, Array<number>>
}

/** A catalog rule. `run` returns zero+ findings; only called when `isAvailable`. */
export type WatchdogRule = {
  id: string
  category: WatchdogCategory
  /** Human title. */
  title: string
  /** Non-technical description of what the rule watches (shown in the alert modal). */
  description: string
  /** Named inputs the rule needs, e.g. ['teambox']. Documented for the catalog. */
  requiredInputs: Array<string>
  /** True only when every required input is present for this store. */
  isAvailable: (ctx: RuleContext) => boolean
  /** Evaluate the rule; MUST NOT throw (the engine wraps it, but be defensive). */
  run: (ctx: RuleContext) => Array<WatchdogFinding>
}
