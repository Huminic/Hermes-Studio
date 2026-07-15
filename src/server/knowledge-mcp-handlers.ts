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
import { extractFrontmatter, readWikiFields } from '../lib/frontmatter'

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

export type RecallHit = { path: string; content: string; score: number }

/**
 * Addressing-based recall: the top WHOLE pages by query-term overlap against
 * path + headings + body. Not RAG — whole governed pages, ranked. Returns up to
 * `limit` hits with score > 0, best first.
 */
export function recallCompanyWikiTop(
  profile: string,
  query: string,
  limit = 3,
): Array<RecallHit> {
  const terms = query.toLowerCase().match(/[a-z0-9]+/g) ?? []
  if (terms.length === 0) return []
  const hits: Array<RecallHit> = []
  for (const f of flatten(listCustomerWikiTree(profile).tree)) {
    const read = readCustomerWikiFile(profile, f.path)
    if (!read.ok || !read.content) continue
    // Weight title/heading/path matches above body matches.
    const head = (f.path + '\n' + headings(read.content)).toLowerCase()
    const body = read.content.toLowerCase()
    const score = terms.reduce(
      (s, t) => s + (head.includes(t) ? 2 : 0) + (body.includes(t) ? 1 : 0),
      0,
    )
    if (score > 0) hits.push({ path: f.path, content: read.content, score })
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit)
}

/** Addressing-based recall: best WHOLE page by query-term overlap. */
export function recallCompanyWiki(profile: string, query: string): RecallHit | null {
  return recallCompanyWikiTop(profile, query, 1)[0] ?? null
}

/**
 * True when a visitor's question is about hours / address / phone / location —
 * the class of factual "where/when/how do I reach you" asks that MUST be
 * answered from the store's canonical dealership contact node, never invented.
 *
 * Keyword recall alone under-serves these: the single fact node is easily
 * out-ranked by verbose sales-play pages and dropped from the top-N, after
 * which the model fabricates a plausible address. Callers use this signal to
 * PIN the canonical contact node into grounding regardless of rank.
 */
// Tightened to genuine contact asks. Bare "where"/"open"/"call"/"number"/
// "reach" are deliberately NOT matched — they produced false positives like
// "where can I test drive", "open recalls on this VIN", "call me a price",
// "what number of miles", "reach a decision".
const CONTACT_INTENT_RE = new RegExp(
  [
    'address',
    'directions?',
    'locat(?:ed|ion)',
    '\\bhours\\b',
    'opening|closing',
    '\\bphone\\b',
    'call (?:you|your)',
    'reach (?:you|us|the (?:team|dealership|store))',
    'contact (?:you|us|info|information|number)',
    'get in touch',
    '(?:phone|contact) number',
    'number to call',
    'where (?:are|is) (?:you|your)',
    'where.{0,15}located',
    'what time.{0,20}(?:open|clos)',
    'when.{0,20}(?:open|clos)',
  ].join('|'),
  'i',
)

export function isContactIntent(query: string): boolean {
  return CONTACT_INTENT_RE.test(query)
}

/** Path of the canonical dealership contact fact node (seeded convention). */
const CONTACT_NODE_PATH_RE = /(^|\/)dealership\/hours-location-contact(\.md)?$/i

/** A wiki node is the dealership contact fact node by path convention or canonical_name. */
function looksLikeContactNode(path: string, frontmatter: Record<string, unknown>): boolean {
  if (CONTACT_NODE_PATH_RE.test(path)) return true
  const canonicalName = String(frontmatter.canonical_name ?? '')
  return canonicalName === 'dealership-hours-location-contact'
}

/**
 * Resolve a profile's CANONICAL dealership hours/location/contact fact node, if
 * one exists. Requires `status: canonical` — a `draft` fact node (unverified
 * dealer facts pending operator sign-off) is NEVER returned as fact, upholding
 * the anti-fabrication invariant. Returns null when no canonical contact node
 * exists (caller then must not let the model invent — offer a human handoff).
 */
export function findCanonicalContactNode(profile: string): RecallHit | null {
  for (const f of flatten(listCustomerWikiTree(profile).tree)) {
    // Cheap path prefilter before reading — the contact node lives under
    // dealership/ or carries "hours"/"location"/"contact" in its path.
    if (!/dealership|hours|location|contact/i.test(f.path)) continue
    const read = readCustomerWikiFile(profile, f.path)
    if (!read.ok || !read.content) continue
    const { frontmatter } = extractFrontmatter(read.content)
    if (!looksLikeContactNode(f.path, frontmatter ?? {})) continue
    const { status } = readWikiFields(frontmatter)
    if (status !== 'canonical') continue // draft never grounds as fact
    // Sentinel score above the recall threshold so it sorts ahead of keyword hits.
    return { path: f.path, content: read.content, score: 999 }
  }
  return null
}

export type WidgetGrounding = {
  /** Final pages to inject, best first; the pinned contact node (if any) leads. */
  hits: Array<RecallHit>
  /** True when a canonical contact node was force-pinned for a contact-intent ask. */
  contactPinned: boolean
  /** True when the ask was contact-intent but NO canonical node exists to ground on. */
  contactNoGround: boolean
}

/**
 * Grounding page set for the PUBLIC widget: the top keyword hits, PLUS a pinned
 * canonical dealership contact node whenever the visitor asks about
 * hours/address/phone/location (that fact node is otherwise out-ranked by
 * verbose play pages and dropped, causing the model to invent an address).
 * Shared so the pin behavior is unit-testable independent of the route + LLM.
 */
export function recallWidgetGrounding(
  profile: string,
  query: string,
  opts?: { minScore?: number; limit?: number },
): WidgetGrounding {
  const minScore = opts?.minScore ?? 3
  const limit = opts?.limit ?? 3
  let base = query
    ? recallCompanyWikiTop(profile, query, limit).filter((h) => h.score >= minScore)
    : []
  const contactIntent = query ? isContactIntent(query) : false
  // On a contact-intent ask, the ONLY contact node allowed to ground is the
  // canonical pin below — drop any contact node the keyword recall surfaced so a
  // DRAFT (unverified) contact node can never reach a customer as fact.
  if (contactIntent) base = base.filter((h) => !CONTACT_NODE_PATH_RE.test(h.path))
  const pin = contactIntent ? findCanonicalContactNode(profile) : null
  // Dedup by path (the pin can match by canonical_name at a path the base
  // filter did not catch) — pin first, so it always leads.
  const seen = new Set<string>()
  const hits: Array<RecallHit> = []
  for (const h of pin ? [pin, ...base] : base) {
    if (seen.has(h.path)) continue
    seen.add(h.path)
    hits.push(h)
  }
  return { hits, contactPinned: !!pin, contactNoGround: contactIntent && !pin }
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
