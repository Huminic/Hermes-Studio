import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome: string

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'customer-agents-test-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

function seedProfile(name: string) {
  const dir = path.join(tmpHome, '.hermes', 'profiles', name)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

describe('listAgentsForProfile', () => {
  it('returns empty roster for an unknown profile', async () => {
    const { listAgentsForProfile } = await import('@/server/customer-agents')
    expect(listAgentsForProfile('does-not-exist')).toEqual({
      profile: 'does-not-exist',
      agents: [],
    })
  })

  it('falls back to profile SOUL.md when no governance/agents fragments exist', async () => {
    const dir = seedProfile('huminic')
    fs.writeFileSync(
      path.join(dir, 'SOUL.md'),
      `# Huminic build-time intelligence\n\nYou are the internal consultative layer for governed business intelligence.\n`,
    )
    const { listAgentsForProfile } = await import('@/server/customer-agents')
    const roster = listAgentsForProfile('huminic')
    expect(roster.agents).toHaveLength(1)
    expect(roster.agents[0]).toMatchObject({
      id: 'huminic',
      source: 'profile-SOUL',
    })
    expect(roster.agents[0].summary).toContain('consultative')
  })

  it('lists per-agent SOUL fragments when governance/agents/<id>.md exists', async () => {
    const dir = seedProfile('serra-automotive')
    const agentsDir = path.join(dir, 'governance', 'agents')
    fs.mkdirSync(agentsDir, { recursive: true })
    fs.writeFileSync(
      path.join(agentsDir, 'caroline.md'),
      `---\nname: Caroline\nscope: customer follow-up\n---\n\nCaroline handles post-visit follow-up.\n`,
    )
    fs.writeFileSync(
      path.join(agentsDir, 'mason.md'),
      `---\nname: Mason\n---\n\nMason runs lead response.\n`,
    )
    // README files inside governance/agents must NOT appear as agents.
    fs.writeFileSync(path.join(agentsDir, 'README.md'), '# README')
    const { listAgentsForProfile } = await import('@/server/customer-agents')
    const roster = listAgentsForProfile('serra-automotive')
    const ids = roster.agents.map((a) => a.id)
    expect(ids).toContain('caroline')
    expect(ids).toContain('mason')
    expect(ids).not.toContain('README')
    const caroline = roster.agents.find((a) => a.id === 'caroline')
    expect(caroline?.source).toBe('governance/agents')
    expect(caroline?.scope).toBe('customer follow-up')
  })

  it('detects per-agent chat persona files', async () => {
    const dir = seedProfile('strukture')
    const agentsDir = path.join(dir, 'governance', 'agents')
    fs.mkdirSync(agentsDir, { recursive: true })
    fs.writeFileSync(
      path.join(agentsDir, 'eve.md'),
      `---\nname: Eve\n---\nEve manages widget chats.\n`,
    )
    const personaDir = path.join(agentsDir, 'eve', 'personas')
    fs.mkdirSync(personaDir, { recursive: true })
    fs.writeFileSync(
      path.join(personaDir, 'chat.md'),
      'Keep replies under 80 words.',
    )
    const { listAgentsForProfile } = await import('@/server/customer-agents')
    const roster = listAgentsForProfile('strukture')
    const eve = roster.agents.find((a) => a.id === 'eve')
    expect(eve?.hasChatPersona).toBe(true)
  })
})

describe('filterByVisibleAgents', () => {
  const mk = (id: string, enabled = true) => ({
    id,
    name: id.toUpperCase(),
    summary: '',
    scope: null,
    source: 'governance/agents' as const,
    soulPath: '/x',
    hasChatPersona: false,
    enabled,
  })

  it('returns full enabled roster when visible list is empty', async () => {
    const { filterByVisibleAgents } = await import('@/server/customer-agents')
    const out = filterByVisibleAgents(
      { profile: 'x', agents: [mk('a'), mk('b')] },
      [],
    )
    expect(out.agents.map((a) => a.id)).toEqual(['a', 'b'])
  })

  it('filters out agents not in the allowlist', async () => {
    const { filterByVisibleAgents } = await import('@/server/customer-agents')
    const out = filterByVisibleAgents(
      { profile: 'x', agents: [mk('a'), mk('b')] },
      ['b'],
    )
    expect(out.agents.map((a) => a.id)).toEqual(['b'])
  })

  it('always drops agents whose SOUL is enabled: false', async () => {
    const { filterByVisibleAgents } = await import('@/server/customer-agents')
    const out = filterByVisibleAgents(
      { profile: 'x', agents: [mk('a'), mk('b', false), mk('c')] },
      [],
    )
    expect(out.agents.map((a) => a.id)).toEqual(['a', 'c'])
  })
})

describe('SOUL frontmatter enabled flag', () => {
  it('reads enabled: false from SOUL frontmatter', async () => {
    const dir = seedProfile('huminic')
    const agentsDir = path.join(dir, 'governance', 'agents')
    fs.mkdirSync(agentsDir, { recursive: true })
    fs.writeFileSync(
      path.join(agentsDir, 'caroline.md'),
      `---\nname: Caroline\nenabled: false\n---\nCaroline.\n`,
    )
    fs.writeFileSync(
      path.join(agentsDir, 'duane.md'),
      `---\nname: Duane\n---\nDuane.\n`,
    )
    const { listAgentsForProfile } = await import('@/server/customer-agents')
    const roster = listAgentsForProfile('huminic')
    const caroline = roster.agents.find((a) => a.id === 'caroline')
    const duane = roster.agents.find((a) => a.id === 'duane')
    expect(caroline?.enabled).toBe(false)
    expect(duane?.enabled).toBe(true)
  })
})

describe('readAgentSoulForProfile', () => {
  it('reads per-agent SOUL fragment when present', async () => {
    const dir = seedProfile('huminic')
    const agentsDir = path.join(dir, 'governance', 'agents')
    fs.mkdirSync(agentsDir, { recursive: true })
    fs.writeFileSync(path.join(agentsDir, 'caroline.md'), 'caroline-soul')
    const { readAgentSoulForProfile } = await import('@/server/customer-agents')
    expect(readAgentSoulForProfile('huminic', 'caroline')).toBe('caroline-soul')
  })

  it('falls back to profile SOUL.md when agentId matches profile slug', async () => {
    const dir = seedProfile('huminic')
    fs.writeFileSync(path.join(dir, 'SOUL.md'), 'profile-soul')
    const { readAgentSoulForProfile } = await import('@/server/customer-agents')
    expect(readAgentSoulForProfile('huminic', 'huminic')).toBe('profile-soul')
  })

  it('returns null when no SOUL is present at all', async () => {
    seedProfile('strukture')
    const { readAgentSoulForProfile } = await import('@/server/customer-agents')
    expect(readAgentSoulForProfile('strukture', 'nobody')).toBeNull()
  })
})
