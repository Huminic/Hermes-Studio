/**
 * Knowledge MCP tool handlers — Knowledge Core v1.0.
 *
 * These tools operate on the CUSTOMER CANON (`company-wiki/`) — the same tree
 * the customer-admin UI reads and edits — so an agent (via MCP) and a human
 * (via the UI) act on ONE tree. Writes go through `guardedWikiWrite`, the single
 * structural gate (rule gate → write → memorialize to Brain), so the Knowledge
 * Semantic Guardian can never be bypassed.
 *
 * (The existing `wiki_*` tools in wiki-mcp.ts operate on the `knowledge/`
 * authoring tree — inbox/drafts/published + the consultative pipeline. These
 * `knowledge_*` tools are the customer-canon surface. Both coexist.)
 *
 * Recall is ADDRESSING, not RAG: return the right whole page by topic match.
 * Vectors stay on the data side (federation) and are not used here.
 */

import {
  listCustomerWikiTree,
  readCustomerWikiFile,
  type CustomerWikiNode,
} from './customer-wiki'
import { guardedWikiWrite } from './guarded-wiki'

export type KnowledgeToolContext = {
  token_label: string
  token_allowed_profiles: Array<string>
  token_allowed_tools: Array<string>
  token_admin: boolean
}

export type KnowledgeResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string; rule?: string }

export const KNOWLEDGE_TOOLS = [
  {
    name: 'knowledge_recall',
    description:
      "Recall the most relevant WHOLE page from a profile's company wiki by topic. Addressing, not fuzzy chunks — returns the page an agent should read to act consistently.",
    inputSchema: {
      type: 'object',
      properties: {
        profile: { type: 'string' },
        query: { type: 'string' },
      },
      required: ['profile', 'query'],
    },
  },
  {
    name: 'knowledge_read',
    description: 'Read a single company-wiki page (raw markdown) by path.',
    inputSchema: {
      type: 'object',
      properties: {
        profile: { type: 'string' },
        path: { type: 'string' },
      },
      required: ['profile', 'path'],
    },
  },
  {
    name: 'knowledge_write',
    description:
      'Create/update a company-wiki page. Routes through the Knowledge Semantic Guardian gate (rule gate + memorialize to Brain). Protected trees and malformed pages are rejected.',
    inputSchema: {
      type: 'object',
      properties: {
        profile: { type: 'string' },
        path: { type: 'string', description: 'Path under company-wiki/…' },
        content: { type: 'string' },
      },
      required: ['profile', 'path', 'content'],
    },
  },
] as const

function flatten(nodes: Array<CustomerWikiNode>): Array<CustomerWikiNode> {
  const out: Array<CustomerWikiNode> = []
  for (const n of nodes) {
    if (n.type === 'file') out.push(n)
    if (n.children) out.push(...flatten(n.children))
  }
  return out
}

function headings(md: string): string {
  return md
    .split('\n')
    .filter((l) => l.startsWith('#') || /^title:/.test(l.trim()))
    .join(' ')
}

/** Addressing-based recall: best WHOLE page by query-term overlap. */
export function recallCompanyWiki(
  profile: string,
  query: string,
): { path: string; content: string; score: number } | null {
  const terms = query.toLowerCase().match(/[a-z0-9]+/g) ?? []
  if (terms.length === 0) return null
  let best: { path: string; content: string; score: number } | null = null
  for (const f of flatten(listCustomerWikiTree(profile).tree)) {
    const read = readCustomerWikiFile(profile, f.path)
    if (!read.ok || !read.content) continue
    const hay = (f.path + '\n' + headings(read.content)).toLowerCase()
    const score = terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0)
    if (score > 0 && (!best || score > best.score)) {
      best = { path: f.path, content: read.content, score }
    }
  }
  return best
}

/** Normalize a caller path to the company-wiki tree (so agents can omit the prefix). */
function toCompanyWikiPath(p: string): string {
  const norm = p.replace(/\\/g, '/').replace(/^\/+/, '')
  return norm.startsWith('company-wiki/') ? norm : `company-wiki/${norm}`
}

export function callKnowledgeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: KnowledgeToolContext,
): KnowledgeResult {
  const profile = typeof args.profile === 'string' ? args.profile : ''
  if (!profile) return { ok: false, error: 'profile required' }

  if (name === 'knowledge_recall') {
    const query = typeof args.query === 'string' ? args.query : ''
    if (!query) return { ok: false, error: 'query required' }
    const hit = recallCompanyWiki(profile, query)
    return { ok: true, data: hit ?? { match: null } }
  }

  if (name === 'knowledge_read') {
    const p = typeof args.path === 'string' ? toCompanyWikiPath(args.path) : ''
    if (!p) return { ok: false, error: 'path required' }
    const r = readCustomerWikiFile(profile, p)
    return r.ok ? { ok: true, data: { path: p, content: r.content } } : { ok: false, error: r.error ?? 'not found' }
  }

  if (name === 'knowledge_write') {
    const p = typeof args.path === 'string' ? toCompanyWikiPath(args.path) : ''
    const content = typeof args.content === 'string' ? args.content : ''
    if (!p || !content) return { ok: false, error: 'path and content required' }
    // The actor IS the calling token — a recognized identity form the Brain accepts.
    const res = guardedWikiWrite({
      profile,
      relPath: p,
      content,
      actor: `token:${ctx.token_label}`,
    })
    return res.ok
      ? { ok: true, data: { path: res.path, action: res.action, memorialized: res.memorialized, warnings: res.warnings } }
      : { ok: false, error: res.reason, rule: res.rule }
  }

  return { ok: false, error: `unknown knowledge tool: ${name}` }
}
