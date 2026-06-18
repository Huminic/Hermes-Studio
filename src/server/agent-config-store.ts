/**
 * Per-agent contextual instructions for the Workspace "Agents" page
 * (Configuration modal → Contextual Instructions tab).
 *
 * Per-profile, lazily-created Brain table (tenant-scoped). These instructions
 * are intended to ultimately be sourced from the company wiki, but the wiki
 * backend may not be complete for this surface yet. We therefore store them in
 * a clean local schema NOW, with an explicit, documented integration point:
 *
 *   WIKI INTEGRATION POINT
 *   ----------------------
 *   `source` distinguishes 'local' (typed here, the current default) from
 *   'wiki' (mirrored/owned by a wiki page). `wiki_ref` holds the wiki page path
 *   when source='wiki'. When the wiki backend is ready, a sync step should:
 *     1. read the canonical page via the existing wiki read API
 *        (/api/customer/wiki/read), 2. upsert here with source='wiki' +
 *        wiki_ref set, 3. writes from this modal then flow back through
 *        /api/customer/wiki/save instead of staying local.
 *   No mocking, no silent no-op: until then instructions live locally and are
 *   real, editable, and persisted. The Uploads tab reuses the existing
 *   upload-surface (Brain `uploads`) and is not stored here.
 */

import { openBrain, now as brainNow } from './brain-store'
import type { BrainHandle } from './brain-store'

export type InstructionSource = 'local' | 'wiki'

export type AgentInstructions = {
  agent_id: string
  instructions: string
  source: InstructionSource
  /** Wiki page path when source='wiki'; null while local. The integration hook. */
  wiki_ref: string | null
  updated_at: number | null
}

function ensureTable(handle: BrainHandle): void {
  handle.exec(`CREATE TABLE IF NOT EXISTS agent_contextual_instructions (
    tenant TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    instructions TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'local',
    wiki_ref TEXT,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (tenant, agent_id)
  )`)
}

const MAX_LEN = 20000

export function getInstructions(
  profile: string,
  agentId: string,
  opts: { profileRoot?: string } = {},
): AgentInstructions {
  const handle = openBrain(profile, { profileRoot: opts.profileRoot })
  try {
    ensureTable(handle)
    const row = handle.get<{
      agent_id: string
      instructions: string
      source: string
      wiki_ref: string | null
      updated_at: number
    }>(
      `SELECT agent_id, instructions, source, wiki_ref, updated_at
       FROM agent_contextual_instructions WHERE tenant = ? AND agent_id = ?`,
      profile,
      agentId,
    )
    if (!row) {
      return {
        agent_id: agentId,
        instructions: '',
        source: 'local',
        wiki_ref: null,
        updated_at: null,
      }
    }
    return {
      agent_id: row.agent_id,
      instructions: row.instructions ?? '',
      source: row.source === 'wiki' ? 'wiki' : 'local',
      wiki_ref: row.wiki_ref ?? null,
      updated_at: row.updated_at ?? null,
    }
  } finally {
    handle.close()
  }
}

export function saveInstructions(
  profile: string,
  agentId: string,
  instructions: string,
  opts: { profileRoot?: string; source?: InstructionSource; wiki_ref?: string | null } = {},
): { ok: true; instructions: AgentInstructions } | { ok: false; error: string } {
  const id = agentId?.trim()
  if (!id) return { ok: false, error: 'agent_id required.' }
  if (instructions.length > MAX_LEN) {
    return { ok: false, error: 'Instructions are too long.' }
  }
  const handle = openBrain(profile, { profileRoot: opts.profileRoot })
  try {
    ensureTable(handle)
    handle.run(
      `INSERT INTO agent_contextual_instructions
       (tenant, agent_id, instructions, source, wiki_ref, updated_at)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(tenant, agent_id) DO UPDATE SET
         instructions = excluded.instructions,
         source = excluded.source,
         wiki_ref = excluded.wiki_ref,
         updated_at = excluded.updated_at`,
      profile,
      id,
      instructions,
      opts.source ?? 'local',
      opts.wiki_ref ?? null,
      brainNow(),
    )
    return { ok: true, instructions: getInstructions(profile, id, opts) }
  } finally {
    handle.close()
  }
}
