/**
 * Domain-scoped knowledge grounding for autonomous agent replies.
 *
 * Mirrors the public widget's grounding (widget-chat.ts) — same addressing
 * recall (recallCompanyWikiTop), same score threshold and page cap — but adds
 * two guards the widget does not apply:
 *
 *   1. STATUS: only `status: canonical` wiki nodes are quoted as fact. `draft`
 *      nodes (which carry unverified dealer facts pending operator sign-off) are
 *      NEVER grounded. This is the anti-fabrication invariant — a placeholder
 *      price/inventory/hours page can never reach a customer as truth.
 *   2. DOMAIN: only nodes whose `domain` matches the agent's domain (or nodes
 *      with no domain) are used, so a sales agent does not answer from service
 *      knowledge.
 *
 * When nothing clears both guards, `grounded` is false — the Semantic Guardian
 * uses that signal to HOLD (route to a human) rather than let the model invent.
 */
import { extractFrontmatter, readWikiFields } from '../lib/frontmatter'
import { recallCompanyWikiTop, type RecallHit } from './knowledge-mcp-handlers'

// Mirror the widget's proven constants so in-app and public grounding agree.
export const AUTO_MIN_RECALL_SCORE = 3
export const AUTO_WIKI_PAGE_CHAR_CAP = 1200
export const AUTO_RECALL_LIMIT = 3

export type GroundingResult = {
  /** true iff ≥1 canonical, domain-matched node cleared the score threshold. */
  grounded: boolean
  hits: Array<RecallHit>
  /** Prompt-ready markdown blocks (`## source: <path>` + capped body). */
  blocks: Array<string>
  sources: Array<string>
  topScore: number
}

function nodeFields(content: string): { status?: string; domain?: string } {
  const fm = readWikiFields(extractFrontmatter(content).frontmatter)
  return { status: fm.status, domain: fm.domain }
}

/**
 * Recall canonical, domain-matched wiki nodes for an agent's query.
 * @param domain the agent's domain (e.g. 'sales'); null = no domain filter.
 */
export function recallForAgent(
  profile: string,
  query: string,
  domain: string | null,
  opts?: { limit?: number; minScore?: number },
): GroundingResult {
  const limit = opts?.limit ?? AUTO_RECALL_LIMIT
  const minScore = opts?.minScore ?? AUTO_MIN_RECALL_SCORE
  // Pull extra candidates so status/domain filtering still yields up to `limit`.
  const raw = recallCompanyWikiTop(profile, query, Math.max(limit * 4, limit))
  const hits: Array<RecallHit> = []
  for (const h of raw) {
    if (h.score < minScore) continue
    const { status, domain: nodeDomain } = nodeFields(h.content)
    if (status !== 'canonical') continue // anti-fabrication: draft never grounds
    if (domain && nodeDomain && nodeDomain !== domain) continue // domain scope
    hits.push(h)
    if (hits.length >= limit) break
  }
  const blocks = hits.flatMap((h) => {
    const body =
      h.content.length > AUTO_WIKI_PAGE_CHAR_CAP
        ? h.content.slice(0, AUTO_WIKI_PAGE_CHAR_CAP) + '\n…(truncated)'
        : h.content
    return ['', `## source: ${h.path}`, '', body]
  })
  return {
    grounded: hits.length > 0,
    hits,
    blocks,
    sources: hits.map((h) => h.path),
    topScore: hits.length ? hits[0].score : 0,
  }
}

/**
 * The grounding section appended to the reply system prompt when grounded.
 * Mirrors widget-chat.ts:182-199 — answer from this, and if it does not cover
 * the question, do not invent (a person follows up).
 */
export function groundingPromptSection(g: GroundingResult): Array<string> {
  if (!g.grounded) return []
  return [
    '',
    '# Dealership knowledge (answer ONLY from what is below; if it does not cover the question, do NOT invent — say a teammate will follow up)',
    ...g.blocks,
  ]
}
