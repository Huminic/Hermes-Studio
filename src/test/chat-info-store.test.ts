import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome: string
const PROFILE = 'serra-honda'

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-infostore-test-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  const dir = path.join(tmpHome, '.hermes', 'profiles', PROFILE, 'company-wiki', 'policies')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'time-off.md'),
    '---\ntitle: Time Off Policy\ntype: policy\nstatus: published\n---\n# Time Off Policy\n\n- Paid time off must be requested at least 3 days in advance.',
  )
  fs.writeFileSync(
    path.join(dir, 'trade-in.md'),
    '---\ntitle: Trade-In Process\ntype: policy\nstatus: published\n---\n# Trade-In Process\n\nWe appraise every trade within 30 minutes using the in-store tool.',
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('chat agent grounded in the Info-Store (wiki)', () => {
  it('recalls the relevant whole page for a question', async () => {
    const { recallCompanyWikiTop } = await import('@/server/knowledge-mcp-handlers')
    const hits = recallCompanyWikiTop(PROFILE, 'what is our time off policy', 3)
    expect(hits[0]?.path).toBe('company-wiki/policies/time-off.md')
    expect(hits[0]?.content).toContain('3 days in advance')
  })

  it('builds a system prompt that grounds the agent in the recalled wiki', async () => {
    const { recallCompanyWikiTop } = await import('@/server/knowledge-mcp-handlers')
    const { buildSystemPrompt } = await import('@/routes/api/customer/chat')
    const wikiContext = recallCompanyWikiTop(PROFILE, 'how do trade-ins work', 3)
    const prompt = buildSystemPrompt({
      profile: PROFILE,
      agentName: 'Caroline',
      soul: 'You are Caroline, a sales agent.',
      chatPersona: null,
      wikiContext,
    })
    // The wiki is in the prompt as the source of truth.
    expect(prompt).toContain('Company wiki (Info-Store')
    expect(prompt).toContain('Trade-In Process')
    expect(prompt).toContain('30 minutes')
    // And it's instructed not to invent beyond the wiki/SOUL.
    expect(prompt.toLowerCase()).toContain('do not invent')
  })

  it('omits the wiki section cleanly when nothing matches', async () => {
    const { recallCompanyWikiTop } = await import('@/server/knowledge-mcp-handlers')
    const { buildSystemPrompt } = await import('@/routes/api/customer/chat')
    const wikiContext = recallCompanyWikiTop(PROFILE, 'zzzznomatch', 3)
    const prompt = buildSystemPrompt({ profile: PROFILE, agentName: 'Caroline', soul: null, chatPersona: null, wikiContext })
    expect(wikiContext.length).toBe(0)
    expect(prompt).not.toContain('Company wiki (Info-Store')
  })
})
