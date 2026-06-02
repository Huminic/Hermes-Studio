/**
 * Custom agent definition types.
 *
 * Built-in agents come from AGENT_PERSONAS (agent-personas.ts).
 * Custom agents are user-created and stored in .runtime/agent-definitions.json.
 */

/**
 * Where an agent definition originates.
 * - `builtin`  — derived from AGENT_PERSONAS (Roger/Sally/...).
 * - `custom`   — user-created, stored in .runtime/agent-definitions.json.
 * - `profile`  — a profile-distributed SOUL (`<profile>/SOUL.md` or
 *                `<profile>/governance/agents/*.md`). Read-only in the library.
 * Optional for back-compat: when absent, infer from `isBuiltIn`.
 */
export type AgentSource = 'builtin' | 'custom' | 'profile'

export interface AgentDefinition {
  id: string
  name: string
  emoji: string
  /** Tailwind text-color class, e.g. "text-blue-400" */
  color: string
  roleLabel: string
  systemPrompt: string
  model: string | null
  tags: string[]
  isBuiltIn: boolean
  /** Origin of this definition; drives the library's source column/filter. */
  source?: AgentSource
  /** For `profile` agents: the profile slug the SOUL belongs to. */
  profile?: string
  createdAt: number
  updatedAt: number
}

export type CreateAgentInput = {
  name: string
  emoji: string
  color: string
  roleLabel: string
  systemPrompt: string
  model?: string | null
  tags?: string[]
}

export type UpdateAgentInput = Partial<CreateAgentInput>
