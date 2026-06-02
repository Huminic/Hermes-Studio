import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getProfileSoulAgents } from '@/server/agent-definitions-store'

// GAP-VER-004 regression guard: the /agents library must surface
// profile-distributed SOULs (<profile>/SOUL.md + <profile>/governance/agents/*.md),
// tagged source: 'profile' and read-only (isBuiltIn: true).

let tmpHome: string

function seed(rel: string, content: string) {
  const full = path.join(tmpHome, '.hermes', 'profiles', rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content)
}

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'soul-agents-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('getProfileSoulAgents (GAP-VER-004)', () => {
  it('returns [] when the profiles root does not exist', () => {
    fs.rmSync(path.join(tmpHome, '.hermes'), { recursive: true, force: true })
    expect(getProfileSoulAgents()).toEqual([])
  })

  it('reads a SOUL.md WITH frontmatter', () => {
    seed(
      'huminic-data-governor/SOUL.md',
      `---\nid: huminic-data-governor\nrole: Knowledge + Data Semantic Guardian\nkanban_lane: governance\nenabled: true\n---\n\n# huminic-data-governor\n\nEnforces write-time gates.\n`,
    )
    const agents = getProfileSoulAgents()
    expect(agents).toHaveLength(1)
    const a = agents[0]
    expect(a.source).toBe('profile')
    expect(a.isBuiltIn).toBe(true)
    expect(a.profile).toBe('huminic-data-governor')
    expect(a.id).toBe('profile-huminic-data-governor-soul')
    expect(a.name).toBe('huminic-data-governor')
    expect(a.roleLabel).toContain('Semantic Guardian')
    expect(a.tags).toContain('huminic-data-governor')
    expect(a.tags).toContain('governance')
  })

  it('reads a bare SOUL.md (no frontmatter) using the first heading', () => {
    seed(
      'huminic/SOUL.md',
      `# HUMINIC — Build-Time Intelligence\n\nYou are the internal consultative layer for governed business intelligence.\n`,
    )
    const agents = getProfileSoulAgents()
    expect(agents).toHaveLength(1)
    expect(agents[0].name).toBe('HUMINIC — Build-Time Intelligence')
    expect(agents[0].source).toBe('profile')
    expect(agents[0].systemPrompt).toContain('consultative layer')
  })

  it('enumerates governance/agents/*.md alongside the SOUL', () => {
    seed('serra-honda/SOUL.md', `# Serra Honda\n\nDealer profile.\n`)
    seed(
      'serra-honda/governance/agents/caroline.md',
      `---\nid: caroline\nrole: Lead response agent\nenabled: false\n---\n\n# Caroline\n`,
    )
    seed(
      'serra-honda/governance/agents/elliott.md',
      `---\nid: elliott\nrole: Voice agent\n---\n\n# Elliott\n`,
    )
    const agents = getProfileSoulAgents()
    const ids = agents.map((a) => a.id).sort()
    expect(ids).toContain('profile-serra-honda-soul')
    expect(ids).toContain('profile-serra-honda-agent-caroline')
    expect(ids).toContain('profile-serra-honda-agent-elliott')
    const caroline = agents.find((a) => a.id === 'profile-serra-honda-agent-caroline')!
    expect(caroline.roleLabel).toBe('Lead response agent')
    expect(caroline.tags).toContain('disabled') // enabled: false surfaced
  })

  it('every returned agent is source=profile and read-only', () => {
    seed('a/SOUL.md', `# A\n`)
    seed('b/SOUL.md', `# B\n`)
    const agents = getProfileSoulAgents()
    expect(agents.length).toBeGreaterThanOrEqual(2)
    for (const a of agents) {
      expect(a.source).toBe('profile')
      expect(a.isBuiltIn).toBe(true)
    }
  })
})
