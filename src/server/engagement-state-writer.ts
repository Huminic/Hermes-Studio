/**
 * Engagement-state.yaml writeback for the consultative engine.
 *
 * Closes P-SRS-C1 / AC-CA-004. The consultative engine reads
 * engagement-state.yaml but historically did not write it back. The
 * /engagements/$customer UI therefore showed stale stage info after a run.
 *
 * Now: at each phase boundary, the engine calls advanceEngagementStage()
 * which:
 *  - reads + validates the current state
 *  - marks the prior stage's exited_at + appends notes
 *  - sets current_stage + stage_entered_at + appends a stage_history entry
 *  - writes the YAML atomically (temp + rename)
 *
 * Operator-facing readiness gates are still signed by humans via
 * approveReadinessGate().
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import YAML from 'yaml'
import {
  EngagementStateSchema,
  type EngagementStage,
  type EngagementState,
} from '../lib/engagement-state'

function getProfilesRoot(): string {
  const override = process.env.BRAIN_PROFILES_ROOT
  if (override) return override
  return path.join(os.homedir(), '.hermes', 'profiles')
}

function engagementStatePath(profile: string): string {
  return path.join(getProfilesRoot(), profile, 'engagement-state.yaml')
}

export function readEngagementState(profile: string): EngagementState | null {
  const p = engagementStatePath(profile)
  if (!fs.existsSync(p)) return null
  const raw = fs.readFileSync(p, 'utf8')
  const parsed = YAML.parse(raw)
  const result = EngagementStateSchema.safeParse(parsed)
  if (!result.success) return null
  return result.data
}

/**
 * Atomic write: temp file + rename. Preserves the YAML key order via
 * sequential reassignment.
 */
export function writeEngagementState(
  profile: string,
  state: EngagementState,
): void {
  // Re-validate before writing to catch shape regressions.
  EngagementStateSchema.parse(state)
  const target = engagementStatePath(profile)
  const dir = path.dirname(target)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(tmp, YAML.stringify(state), 'utf8')
  fs.renameSync(tmp, target)
}

/**
 * Advance to a new stage. Updates stage_entered_at, marks prior history
 * entry as exited, appends a new history entry. No-op if the new stage
 * equals the current stage.
 *
 * Returns the updated state, or null if no engagement-state.yaml exists
 * (e.g. for non-customer profiles like the consultative-agent itself).
 */
export function advanceEngagementStage(
  profile: string,
  newStage: EngagementStage,
  opts: { notes: string; skipped?: boolean } = { notes: '' },
): EngagementState | null {
  const current = readEngagementState(profile)
  if (!current) return null
  if (current.current_stage === newStage) return current

  const now = new Date().toISOString()

  // Close out the previous history entry.
  const history = [...current.stage_history]
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].exited_at === null) {
      history[i] = { ...history[i], exited_at: now }
      break
    }
  }

  // Append the new entry.
  history.push({
    stage: newStage,
    entered_at: now,
    exited_at: null,
    notes: opts.notes,
    skipped: opts.skipped ?? false,
  })

  const updated: EngagementState = {
    ...current,
    current_stage: newStage,
    stage_entered_at: now,
    stage_history: history,
  }
  writeEngagementState(profile, updated)
  return updated
}

export type ReadinessGateName =
  | 'ready_to_blueprint'
  | 'ready_to_instantiate_runtime'
  | 'ready_to_publish_mcp_projections'
  | 'ready_to_hand_off_externally'
  | 'topology_decided'

/**
 * Sign a readiness gate as approved or rejected. Persists the approver +
 * timestamp into engagement-state.yaml.
 *
 * For topology_decided, the optional `decision` argument is required to
 * record which topology was chosen.
 */
export function approveReadinessGate(
  profile: string,
  gate: ReadinessGateName,
  opts: {
    status: 'approved' | 'rejected' | 'pending'
    approved_by: string | null
    notes?: string
    decision?: 'we-host' | 'hybrid' | 'external-consumes-projections' | null
  },
): EngagementState | null {
  const current = readEngagementState(profile)
  if (!current) return null
  const now = new Date().toISOString()

  const gates = { ...current.readiness_gates }

  if (gate === 'topology_decided') {
    gates.topology_decided = {
      status: opts.status,
      approved_by: opts.approved_by,
      approved_at: opts.status === 'pending' ? null : now,
      decision: opts.decision ?? gates.topology_decided.decision,
    }
  } else {
    gates[gate] = {
      status: opts.status,
      approved_by: opts.approved_by,
      approved_at: opts.status === 'pending' ? null : now,
      notes: opts.notes ?? gates[gate].notes,
    }
  }

  const updated: EngagementState = { ...current, readiness_gates: gates }
  writeEngagementState(profile, updated)
  return updated
}

/**
 * Map a consultative-engine phase (orient/audit/design/author/validate/package)
 * to the engagement stage that should be active when the phase has just
 * completed. The mapping is documented in
 * docs/consulting_package/.../scaffold/profiles/consultative-agent/
 * governance/engagement-state-schema.md.
 *
 * orient → gathering_data (still gathering after orient)
 * audit → gathering_data
 * design → solution_discovery
 * author → creation
 * validate → submission
 * package → ready_to_run
 */
export function phaseToStage(
  phase: 'orient' | 'audit' | 'design' | 'author' | 'validate' | 'package',
): EngagementStage {
  switch (phase) {
    case 'orient':
      return 'gathering_data'
    case 'audit':
      return 'gathering_data'
    case 'design':
      return 'solution_discovery'
    case 'author':
      return 'creation'
    case 'validate':
      return 'submission'
    case 'package':
      return 'ready_to_run'
  }
}
