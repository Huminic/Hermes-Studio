import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { extractFrontmatter } from '../lib/frontmatter'

export type CustomerAgent = {
  id: string
  name: string
  summary: string
  scope: string | null
  source: 'governance/agents' | 'profile-SOUL'
  soulPath: string
  hasChatPersona: boolean
}

export type AgentRoster = {
  profile: string
  agents: Array<CustomerAgent>
}

function profilesRoot(): string {
  return path.join(os.homedir(), '.hermes', 'profiles')
}

function profileDir(profile: string): string {
  return path.join(profilesRoot(), profile)
}

function safeRead(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
}

function summarize(body: string): { summary: string; scope: string | null } {
  const lines = body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  let summary = ''
  for (const line of lines) {
    if (line.startsWith('#')) continue
    summary = line
    break
  }
  if (summary.length > 240) summary = summary.slice(0, 237) + '…'
  let scope: string | null = null
  const match = body.match(/scope[: ]+([^\n]+)/i)
  if (match) scope = match[1].trim().slice(0, 240)
  return { summary, scope: scope ?? null }
}

function chatPersonaPath(profile: string, agentId: string): string {
  return path.join(
    profileDir(profile),
    'governance',
    'agents',
    agentId,
    'personas',
    'chat.md',
  )
}

export function hasChannelPersona(
  profile: string,
  agentId: string,
  channel: string,
): boolean {
  const p = path.join(
    profileDir(profile),
    'governance',
    'agents',
    agentId,
    'personas',
    `${channel}.md`,
  )
  return fs.existsSync(p)
}

export function readChannelPersona(
  profile: string,
  agentId: string,
  channel: string,
): string | null {
  const p = path.join(
    profileDir(profile),
    'governance',
    'agents',
    agentId,
    'personas',
    `${channel}.md`,
  )
  return safeRead(p)
}

/**
 * List the agent roster for a customer profile.
 *
 * Lookup order:
 *   1. `governance/agents/<agentId>.md` SOUL fragments (one per agent)
 *   2. fallback: single profile-level `SOUL.md` exposed as a single
 *      agent with id matching the profile slug
 */
export function listAgentsForProfile(profile: string): AgentRoster {
  const dir = profileDir(profile)
  if (!fs.existsSync(dir)) return { profile, agents: [] }

  const agents: Array<CustomerAgent> = []
  const agentsDir = path.join(dir, 'governance', 'agents')
  if (fs.existsSync(agentsDir)) {
    const entries = fs.readdirSync(agentsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile()) continue
      if (!entry.name.endsWith('.md')) continue
      const id = entry.name.replace(/\.md$/, '')
      // Skip noise files like README.md, INDEX.md
      if (/^(readme|index)$/i.test(id)) continue
      const soulPath = path.join(agentsDir, entry.name)
      const raw = safeRead(soulPath) ?? ''
      const { frontmatter, body } = extractFrontmatter(raw)
      const fm = frontmatter ?? {}
      const name =
        (typeof fm.name === 'string' && fm.name) ||
        (typeof fm.title === 'string' && fm.title) ||
        id
      const { summary, scope } = summarize(body)
      agents.push({
        id,
        name,
        summary: typeof fm.summary === 'string' ? fm.summary : summary,
        scope: typeof fm.scope === 'string' ? fm.scope : scope,
        source: 'governance/agents',
        soulPath,
        hasChatPersona: fs.existsSync(chatPersonaPath(profile, id)),
      })
    }
  }

  if (agents.length === 0) {
    const profileSoul = path.join(dir, 'SOUL.md')
    if (fs.existsSync(profileSoul)) {
      const raw = safeRead(profileSoul) ?? ''
      const { frontmatter, body } = extractFrontmatter(raw)
      const fm = frontmatter ?? {}
      const { summary, scope } = summarize(body)
      const id = profile
      agents.push({
        id,
        name:
          (typeof fm.name === 'string' && fm.name) ||
          (typeof fm.title === 'string' && fm.title) ||
          profile,
        summary: typeof fm.summary === 'string' ? fm.summary : summary,
        scope: typeof fm.scope === 'string' ? fm.scope : scope,
        source: 'profile-SOUL',
        soulPath: profileSoul,
        hasChatPersona: fs.existsSync(chatPersonaPath(profile, id)),
      })
    }
  }

  agents.sort((a, b) => a.name.localeCompare(b.name))
  return { profile, agents }
}

/**
 * Read the raw SOUL text for an agent id on a profile, honoring the
 * same lookup order as listAgentsForProfile.
 */
export function readAgentSoulForProfile(
  profile: string,
  agentId: string,
): string | null {
  const fragmentPath = path.join(
    profileDir(profile),
    'governance',
    'agents',
    `${agentId}.md`,
  )
  const fragment = safeRead(fragmentPath)
  if (fragment) return fragment
  if (agentId === profile) {
    return safeRead(path.join(profileDir(profile), 'SOUL.md'))
  }
  return null
}

/**
 * Filter a roster by a studio.yaml agent_picker.visible_agents allowlist.
 * Empty allowlist means "all profile agents".
 */
export function filterByVisibleAgents(
  roster: AgentRoster,
  visible: ReadonlyArray<string>,
): AgentRoster {
  if (visible.length === 0) return roster
  return {
    profile: roster.profile,
    agents: roster.agents.filter((a) => visible.includes(a.id)),
  }
}
