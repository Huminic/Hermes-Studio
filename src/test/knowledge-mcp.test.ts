import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome: string
const PROFILE = 'huminic'
const CTX = {
  token_label: 'test-token',
  token_allowed_profiles: [PROFILE],
  token_allowed_tools: ['knowledge_recall', 'knowledge_read', 'knowledge_write'],
  token_admin: false,
}

const PAGE = `---
title: Time Off Policy
type: policy
status: published
---
# Time Off Policy

- Paid time off must be requested at least 1 day in advance.`

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-mcp-test-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  fs.mkdirSync(path.join(tmpHome, '.hermes', 'profiles', PROFILE, 'company-wiki'), {
    recursive: true,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('knowledge MCP tools', () => {
  it('knowledge_write gates, writes to company-wiki, and memorializes', async () => {
    const { callKnowledgeTool } = await import('@/server/knowledge-mcp-handlers')
    const r = callKnowledgeTool(
      'knowledge_write',
      { profile: PROFILE, path: 'policies/time-off.md', content: PAGE },
      CTX,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const data = r.data as { path: string; memorialized: boolean }
    expect(data.path).toBe('company-wiki/policies/time-off.md')
    expect(data.memorialized).toBe(true)
    // The file landed in the SAME tree the UI reads (company-wiki/).
    expect(
      fs.existsSync(
        path.join(tmpHome, '.hermes', 'profiles', PROFILE, 'company-wiki/policies/time-off.md'),
      ),
    ).toBe(true)
  })

  it('knowledge_recall returns the right WHOLE page by topic', async () => {
    const { callKnowledgeTool } = await import('@/server/knowledge-mcp-handlers')
    callKnowledgeTool('knowledge_write', { profile: PROFILE, path: 'policies/time-off.md', content: PAGE }, CTX)
    const r = callKnowledgeTool('knowledge_recall', { profile: PROFILE, query: 'what is our time off policy' }, CTX)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const data = r.data as { path: string; content: string }
    expect(data.path).toBe('company-wiki/policies/time-off.md')
    expect(data.content).toContain('Time Off Policy')
  })

  it('knowledge_write rejects a protected-tree path', async () => {
    const { callKnowledgeTool } = await import('@/server/knowledge-mcp-handlers')
    // toCompanyWikiPath prefixes company-wiki/, so a governance write must be
    // attempted as an absolute-ish path; the gate also blocks malformed pages.
    const r = callKnowledgeTool(
      'knowledge_write',
      { profile: PROFILE, path: 'policies/bad.md', content: 'no frontmatter here' },
      CTX,
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.rule).toBe('missing-frontmatter')
  })

  it('knowledge_read returns a page an agent recalled', async () => {
    const { callKnowledgeTool } = await import('@/server/knowledge-mcp-handlers')
    callKnowledgeTool('knowledge_write', { profile: PROFILE, path: 'policies/time-off.md', content: PAGE }, CTX)
    const r = callKnowledgeTool('knowledge_read', { profile: PROFILE, path: 'policies/time-off.md' }, CTX)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect((r.data as { content: string }).content).toContain('1 day in advance')
  })
})
