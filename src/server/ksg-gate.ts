/**
 * Knowledge Semantic Guardian (KSG) gate — Phase C.3.
 *
 * Enforces the customer-admin's authoring policy on every write into a
 * customer-scoped wiki. The full KSG agent lives as a data-governor
 * profile (one per customer); this gate is the synchronous Studio-side
 * pre-check that blocks the most common violations before the agent
 * gets involved.
 *
 * Rules enforced here:
 *   1. Files with `status: canonical` frontmatter cannot be rewritten by
 *      the customer-admin path. Operator-side promotion is the only way
 *      to update canon (matches the Authoring Governance Policy in each
 *      profile's governance/ tree).
 *   2. Files under `canon/` and `governance/` are read-only on this path.
 *      Customer-admin edits live in `knowledge/inbox/`, `knowledge/drafts/`,
 *      `knowledge/published/`, `knowledge/widgets/`, and the customer's
 *      own data + workflow folders.
 *   3. Frontmatter required on saves (the editor enforces a minimal shape:
 *      type, status, title).
 *   4. Promote moves must go inbox -> drafts -> published in order. Any
 *      reverse move or skip is rejected.
 *
 * This is intentionally conservative. The data-governor agent (run-time)
 * adds richer semantic checks (no contradictions, no orphaned wikilinks,
 * no policy violations); this gate just prevents the most common foot-gun
 * writes from sneaking past.
 */

import path from 'node:path'
import { extractFrontmatter, readWikiFields } from '../lib/frontmatter'

export type GateOutcome =
  | { ok: true; warnings: Array<string> }
  | { ok: false; reason: string; rule: string }

const PROTECTED_TOP_LEVELS = ['canon', 'governance']
const ALLOWED_PROMOTE_PATHS = ['inbox', 'drafts']

export function evaluateWikiSave(input: {
  relativePath: string
  previousContent: string | null
  newContent: string
}): GateOutcome {
  const rel = input.relativePath.replace(/\\/g, '/')
  const top = rel.split('/').filter(Boolean)[0] ?? ''

  // Rule 2: protected top-level dirs
  if (PROTECTED_TOP_LEVELS.includes(top)) {
    return {
      ok: false,
      rule: 'protected-tree',
      reason: `${top}/ is read-only on the customer-admin path. Edit via the operator console.`,
    }
  }

  // Rule 1: canonical files can't be rewritten
  if (input.previousContent) {
    const prev = extractFrontmatter(input.previousContent)
    const prevFm = readWikiFields(prev.frontmatter ?? {})
    if (prevFm.status === 'canonical') {
      return {
        ok: false,
        rule: 'canonical-frozen',
        reason:
          'Cannot rewrite a status: canonical page from the customer-admin path. Open an inbox proposal instead.',
      }
    }
  }

  // Rule 3: required frontmatter on saves
  const next = extractFrontmatter(input.newContent)
  if (!next.frontmatter) {
    return {
      ok: false,
      rule: 'missing-frontmatter',
      reason:
        'Frontmatter required. Add at least: title, type, status.',
    }
  }
  const nextFm = readWikiFields(next.frontmatter)
  const warnings: Array<string> = []
  if (!nextFm.title) warnings.push('No `title:` in frontmatter.')
  if (!nextFm.type) warnings.push('No `type:` in frontmatter.')
  if (!nextFm.status) warnings.push('No `status:` in frontmatter.')

  return { ok: true, warnings }
}

export type PromoteOutcome =
  | { ok: true; from: string; to: string }
  | { ok: false; reason: string; rule: string }

/**
 * Resolve the next promote destination for a wiki page.
 *  inbox/foo.md  -> drafts/foo.md
 *  drafts/foo.md -> published/foo.md
 *  anything else is rejected.
 */
export function evaluatePromote(input: {
  relativePath: string
}): PromoteOutcome {
  const rel = input.relativePath.replace(/\\/g, '/')
  const parts = rel.split('/').filter(Boolean)
  // Customer wiki promote paths live under `knowledge/<bucket>/...`. The
  // editor passes a path relative to the profile's knowledge root, so the
  // first segment is the bucket.
  const bucket = parts[0] ?? ''
  if (!ALLOWED_PROMOTE_PATHS.includes(bucket)) {
    return {
      ok: false,
      rule: 'invalid-promote-source',
      reason: `Promote only operates from inbox/ or drafts/. Source bucket: ${bucket || '(empty)'}`,
    }
  }
  const nextBucket = bucket === 'inbox' ? 'drafts' : 'published'
  const rest = parts.slice(1).join('/')
  const to = path.posix.join(nextBucket, rest)
  return { ok: true, from: rel, to }
}
