/**
 * Engagement state schema + parser for ~/.hermes/profiles/<customer>/engagement-state.yaml.
 *
 * The schema is documented at consultative-agent/governance/engagement-state-schema.md
 * (installed into the consultative-agent profile in Phase 1 revised).
 *
 * This module:
 * - parses raw YAML text into a typed structure
 * - validates against the schema with friendly error messages
 * - exposes helpers the engagement-tracker plugin renderer (Phase 5) will use
 */

import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

export const ENGAGEMENT_STAGES = [
  'draft',
  'gathering_data',
  'solution_discovery',
  'creation',
  'submission',
  'feedback',
  'ready_to_run',
] as const
export type EngagementStage = (typeof ENGAGEMENT_STAGES)[number]

export const GATE_STATUS = ['pending', 'approved', 'rejected'] as const
export type GateStatus = (typeof GATE_STATUS)[number]

export const TOPOLOGY_DECISIONS = [
  'we-host',
  'hybrid',
  'external-consumes-projections',
] as const
export type TopologyDecision = (typeof TOPOLOGY_DECISIONS)[number]

const StageHistoryEntrySchema = z.object({
  stage: z.enum(ENGAGEMENT_STAGES),
  entered_at: z.string(),
  exited_at: z.string().nullable(),
  notes: z.string(),
  skipped: z.boolean(),
})

const CrewMemberSchema = z.object({
  role: z.string().min(1),
  profile: z.string().min(1),
})

const DeploymentNoteSchema = z.object({
  area: z.string().min(1),
  status: z.enum(['unknown', 'partial', 'confirmed']),
  impact_if_missing: z.string(),
  surfaced_at: z.string(),
  resolved_at: z.string().nullable(),
})

const ReadinessGateSchema = z.object({
  status: z.enum(GATE_STATUS),
  approved_by: z.string().nullable(),
  approved_at: z.string().nullable(),
  notes: z.string(),
})

const TopologyGateSchema = ReadinessGateSchema.extend({
  decision: z.enum(TOPOLOGY_DECISIONS).nullable(),
}).omit({ notes: true })

const OpenDecisionSchema = z.object({
  id: z.string().min(1),
  description: z.string(),
  options_presented: z.array(z.string()),
  blocking_stage: z.string().nullable(),
  surfaced_at: z.string(),
  resolved_at: z.string().nullable(),
  resolution: z.string().nullable(),
})

const AdjacentDataNeighborSchema = z.object({
  name: z.string().min(1),
  source_type: z.enum(['crm', 'survey', 'doc-store', 'other']),
  likelihood: z.enum(['low', 'medium', 'high']),
  notes: z.string(),
})

export const EngagementStateSchema = z.object({
  schema_version: z.literal(1),
  customer: z.string().min(1),
  current_stage: z.enum(ENGAGEMENT_STAGES),
  stage_entered_at: z.string(),
  stage_history: z.array(StageHistoryEntrySchema),
  assigned_consultative_agent: z.string().min(1),
  build_time_crew: z.array(CrewMemberSchema),
  run_time_crew: z.array(CrewMemberSchema),
  deployment_notes: z.array(DeploymentNoteSchema),
  readiness_gates: z.object({
    ready_to_blueprint: ReadinessGateSchema,
    ready_to_instantiate_runtime: ReadinessGateSchema,
    ready_to_publish_mcp_projections: ReadinessGateSchema,
    ready_to_hand_off_externally: ReadinessGateSchema,
    topology_decided: TopologyGateSchema,
  }),
  open_decisions: z.array(OpenDecisionSchema),
  adjacent_data_neighbors: z.array(AdjacentDataNeighborSchema),
})

export type EngagementState = z.infer<typeof EngagementStateSchema>

export type ParseResult =
  | { ok: true; state: EngagementState }
  | { ok: false; errors: Array<string> }

export function parseEngagementState(yamlText: string): ParseResult {
  let raw: unknown
  try {
    raw = parseYaml(yamlText)
  } catch (err) {
    return {
      ok: false,
      errors: [`YAML parse error: ${(err as Error).message}`],
    }
  }

  const parsed = EngagementStateSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(
        (i) => `${i.path.join('.') || '(root)'}: ${i.message}`,
      ),
    }
  }
  return { ok: true, state: parsed.data }
}

/** Find the next unresolved deployment note. Used by the engagement-tracker UI to highlight what needs operator attention. */
export function nextOpenDeploymentNote(
  state: EngagementState,
): EngagementState['deployment_notes'][number] | null {
  return state.deployment_notes.find((n) => n.resolved_at === null) ?? null
}

/** Count readiness gates by status. Used by the tracker UI for the progress strip. */
export function gateProgress(state: EngagementState): {
  approved: number
  pending: number
  rejected: number
  total: number
} {
  const gates = Object.values(state.readiness_gates)
  let approved = 0
  let pending = 0
  let rejected = 0
  for (const gate of gates) {
    if (gate.status === 'approved') approved++
    else if (gate.status === 'rejected') rejected++
    else pending++
  }
  return { approved, pending, rejected, total: gates.length }
}

/** Return the current stage's index (0-based) for progress bar rendering. */
export function stageIndex(state: EngagementState): number {
  return ENGAGEMENT_STAGES.indexOf(state.current_stage)
}
