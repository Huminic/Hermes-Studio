import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome: string

beforeEach(async () => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'wmcp-test-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  fs.mkdirSync(
    path.join(tmpHome, '.hermes', 'profiles', 'huminic', 'knowledge', 'published'),
    { recursive: true },
  )
  fs.writeFileSync(
    path.join(
      tmpHome,
      '.hermes/profiles/huminic/knowledge/published/method.md',
    ),
    '---\ntitle: Method\ntype: ref\nstatus: published\n---\nThe consultative method audits gaps.',
  )
  fs.writeFileSync(
    path.join(
      tmpHome,
      '.hermes/profiles/huminic/knowledge/published/scope.md',
    ),
    '---\ntitle: Scope\ntype: ref\nstatus: published\n---\nScope contract details.',
  )
  // Reset token registry
  const mod = await import('@/server/mcp-tokens')
  mod._resetForTests()
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

async function jsonRpc(secret: string, method: string, params: Record<string, unknown>) {
  const { dispatchWikiMcp } = await import('@/server/wiki-mcp')
  const req = new Request('http://localhost/api/mcp/wiki', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  return dispatchWikiMcp(req)
}

describe('wiki MCP — auth', () => {
  it('rejects requests with no bearer token', async () => {
    const res = await jsonRpc('', 'tools/list', {})
    expect(res.error?.code).toBe(-32001)
  })

  it('rejects requests with an unknown token', async () => {
    const res = await jsonRpc('not-a-real-token', 'tools/list', {})
    expect(res.error?.code).toBe(-32001)
  })

  it('accepts a valid token issued via issueToken', async () => {
    const { issueToken } = await import('@/server/mcp-tokens')
    const issue = issueToken({
      label: 'test-token',
      allowed_profiles: ['huminic'],
      allowed_tools: ['*'],
      created_by: 'test',
    })
    const res = await jsonRpc(issue.secret!, 'tools/list', {})
    expect(res.error).toBeUndefined()
    const result = res.result as { tools: Array<{ name: string }> }
    expect(result.tools.length).toBeGreaterThan(0)
  })
})

describe('wiki MCP — scope enforcement', () => {
  it('blocks wiki_read for a profile not in allowed_profiles', async () => {
    const { issueToken } = await import('@/server/mcp-tokens')
    const issue = issueToken({
      label: 'serra-only',
      allowed_profiles: ['serra-honda'],
      allowed_tools: ['*'],
      created_by: 'test',
    })
    const res = await jsonRpc(issue.secret!, 'tools/call', {
      name: 'wiki_read',
      arguments: { profile: 'huminic', path: 'published/method.md' },
    })
    expect(res.error?.code).toBe(-32003)
  })

  it('blocks tools not in allowed_tools', async () => {
    const { issueToken } = await import('@/server/mcp-tokens')
    const issue = issueToken({
      label: 'read-only',
      allowed_profiles: ['huminic'],
      allowed_tools: ['wiki_read', 'wiki_list'],
      created_by: 'test',
    })
    const res = await jsonRpc(issue.secret!, 'tools/call', {
      name: 'wiki_propose',
      arguments: {
        profile: 'huminic',
        path: 'idea.md',
        content: '---\ntitle: x\ntype: y\nstatus: draft\n---\nbody',
      },
    })
    expect(res.error?.code).toBe(-32003)
  })

  it('admin tools require token.admin = true', async () => {
    const { issueToken } = await import('@/server/mcp-tokens')
    const nonAdmin = issueToken({
      label: 'plain',
      allowed_profiles: ['*'],
      allowed_tools: ['*'],
      created_by: 'test',
    })
    const res = await jsonRpc(nonAdmin.secret!, 'tools/call', {
      name: 'mcp__issue_token',
      arguments: {
        label: 'child',
        allowed_profiles: ['x'],
        allowed_tools: ['*'],
      },
    })
    expect(res.error?.code).toBe(-32002)
  })
})

describe('wiki MCP — tool behavior', () => {
  it('wiki_list returns published files', async () => {
    const { issueToken } = await import('@/server/mcp-tokens')
    const issue = issueToken({
      label: 'all',
      allowed_profiles: ['*'],
      allowed_tools: ['*'],
      created_by: 'test',
    })
    const res = await jsonRpc(issue.secret!, 'tools/call', {
      name: 'wiki_list',
      arguments: { profile: 'huminic', path: 'published' },
    })
    const text = (res.result as { content: Array<{ text: string }> }).content[0]
      .text
    const parsed = JSON.parse(text) as Array<{ name: string }>
    const names = parsed.map((p) => p.name)
    expect(names).toContain('method.md')
    expect(names).toContain('scope.md')
  })

  it('wiki_read returns content + frontmatter', async () => {
    const { issueToken } = await import('@/server/mcp-tokens')
    const issue = issueToken({
      label: 'all2',
      allowed_profiles: ['*'],
      allowed_tools: ['*'],
      created_by: 'test',
    })
    const res = await jsonRpc(issue.secret!, 'tools/call', {
      name: 'wiki_read',
      arguments: { profile: 'huminic', path: 'published/method.md' },
    })
    const text = (res.result as { content: Array<{ text: string }> }).content[0]
      .text
    const parsed = JSON.parse(text) as {
      content: string
      frontmatter: { title: string }
    }
    expect(parsed.frontmatter.title).toBe('Method')
    expect(parsed.content).toContain('consultative method')
  })

  it('wiki_search ranks title matches higher', async () => {
    const { issueToken } = await import('@/server/mcp-tokens')
    const issue = issueToken({
      label: 'all3',
      allowed_profiles: ['*'],
      allowed_tools: ['*'],
      created_by: 'test',
    })
    const res = await jsonRpc(issue.secret!, 'tools/call', {
      name: 'wiki_search',
      arguments: { profile: 'huminic', query: 'scope' },
    })
    const text = (res.result as { content: Array<{ text: string }> }).content[0]
      .text
    const parsed = JSON.parse(text) as Array<{ title: string; path: string }>
    expect(parsed.length).toBeGreaterThan(0)
    expect(parsed[0].title).toBe('Scope')
  })

  it('wiki_propose writes to knowledge/inbox/ when KSG approves', async () => {
    const { issueToken } = await import('@/server/mcp-tokens')
    const issue = issueToken({
      label: 'all4',
      allowed_profiles: ['*'],
      allowed_tools: ['*'],
      created_by: 'test',
    })
    const res = await jsonRpc(issue.secret!, 'tools/call', {
      name: 'wiki_propose',
      arguments: {
        profile: 'huminic',
        path: 'agent-proposal.md',
        content: '---\ntitle: Idea\ntype: note\nstatus: draft\n---\nbody',
      },
    })
    const text = (res.result as { content: Array<{ text: string }> }).content[0]
      .text
    const parsed = JSON.parse(text) as { ok: boolean; path: string }
    expect(parsed.ok).toBe(true)
    expect(parsed.path).toBe('knowledge/inbox/agent-proposal.md')
    expect(
      fs.existsSync(
        path.join(
          tmpHome,
          '.hermes/profiles/huminic/knowledge/inbox/agent-proposal.md',
        ),
      ),
    ).toBe(true)
  })

  it('wiki_propose with no frontmatter is blocked by KSG', async () => {
    const { issueToken } = await import('@/server/mcp-tokens')
    const issue = issueToken({
      label: 'all5',
      allowed_profiles: ['*'],
      allowed_tools: ['*'],
      created_by: 'test',
    })
    const res = await jsonRpc(issue.secret!, 'tools/call', {
      name: 'wiki_propose',
      arguments: {
        profile: 'huminic',
        path: 'bad.md',
        content: 'no frontmatter',
      },
    })
    const text = (res.result as { content: Array<{ text: string }> }).content[0]
      .text
    const parsed = JSON.parse(text) as { ok: boolean; error: string }
    expect(parsed.ok).toBe(false)
    expect(parsed.error).toMatch(/frontmatter/i)
  })
})

describe('wiki MCP — admin tools', () => {
  it('mcp__create_profile creates a new profile dir', async () => {
    const { issueToken } = await import('@/server/mcp-tokens')
    const admin = issueToken({
      label: 'consultative',
      allowed_profiles: ['*'],
      allowed_tools: ['*'],
      admin: true,
      created_by: 'operator',
    })
    const res = await jsonRpc(admin.secret!, 'tools/call', {
      name: 'mcp__create_profile',
      arguments: { slug: 'new-customer', label: 'New Customer' },
    })
    const text = (res.result as { content: Array<{ text: string }> }).content[0]
      .text
    const parsed = JSON.parse(text) as { ok: boolean; profile: string }
    expect(parsed.ok).toBe(true)
    expect(
      fs.existsSync(
        path.join(tmpHome, '.hermes/profiles/new-customer/studio.yaml'),
      ),
    ).toBe(true)
  })

  it('mcp__issue_token issues + mcp__revoke_token revokes', async () => {
    const { issueToken: bootstrap, listTokens } = await import('@/server/mcp-tokens')
    const admin = bootstrap({
      label: 'consult2',
      allowed_profiles: ['*'],
      allowed_tools: ['*'],
      admin: true,
      created_by: 'operator',
    })
    const issueRes = await jsonRpc(admin.secret!, 'tools/call', {
      name: 'mcp__issue_token',
      arguments: {
        label: 'caroline-runtime',
        allowed_profiles: ['serra-honda'],
        allowed_tools: ['wiki_read', 'wiki_search'],
      },
    })
    const issueText = (
      issueRes.result as { content: Array<{ text: string }> }
    ).content[0].text
    const issued = JSON.parse(issueText) as {
      ok: boolean
      secret?: string
    }
    expect(issued.ok).toBe(true)
    expect(issued.secret).toBeTruthy()
    expect(listTokens().some((t) => t.label === 'caroline-runtime')).toBe(true)
    const revokeRes = await jsonRpc(admin.secret!, 'tools/call', {
      name: 'mcp__revoke_token',
      arguments: { label: 'caroline-runtime' },
    })
    const revokeText = (
      revokeRes.result as { content: Array<{ text: string }> }
    ).content[0].text
    const revoked = JSON.parse(revokeText) as { ok: boolean }
    expect(revoked.ok).toBe(true)
    expect(listTokens().some((t) => t.label === 'caroline-runtime')).toBe(false)
  })
})
