/**
 * Extract YAML frontmatter from a markdown document.
 *
 * Used by the files-screen frontmatter panel (Phase 3 UI follow-up) and by the
 * engagement-tracker plugin renderer (Phase 5) for rendering structured
 * frontmatter above the body without parsing the whole document twice.
 */

import { parse as parseYaml } from 'yaml'

export type Frontmatter = Record<string, unknown>

export type ExtractResult = {
  /** Parsed frontmatter object, or null if no frontmatter block was found. */
  frontmatter: Frontmatter | null
  /** The markdown body (everything after the frontmatter), unchanged. */
  body: string
  /** True if a frontmatter delimiter pair was found and parsed. */
  hasFrontmatter: boolean
  /** Parser error if the YAML block was malformed; the whole content falls through as `body`. */
  parseError?: string
}

const DELIMITER = '---'

/**
 * Detect, parse, and split a markdown document.
 *
 * Recognized shape: the document starts with `---\n` (or `---\r\n`), contains
 * YAML, then a closing `---\n` on its own line, then the body. This is the
 * standard Jekyll / Hugo / Obsidian convention used throughout the consultative
 * agent wiki.
 */
export function extractFrontmatter(content: string): ExtractResult {
  const lines = content.split(/\r?\n/)
  if (lines.length < 2 || lines[0].trim() !== DELIMITER) {
    return { frontmatter: null, body: content, hasFrontmatter: false }
  }

  let closingIndex = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === DELIMITER) {
      closingIndex = i
      break
    }
  }
  if (closingIndex === -1) {
    return { frontmatter: null, body: content, hasFrontmatter: false }
  }

  const yamlBlock = lines.slice(1, closingIndex).join('\n')
  const body = lines.slice(closingIndex + 1).join('\n')

  let parsed: unknown
  try {
    parsed = parseYaml(yamlBlock)
  } catch (err) {
    return {
      frontmatter: null,
      body: content,
      hasFrontmatter: true,
      parseError: (err as Error).message,
    }
  }

  if (parsed === null || parsed === undefined) {
    return { frontmatter: {}, body, hasFrontmatter: true }
  }
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      frontmatter: null,
      body: content,
      hasFrontmatter: true,
      parseError: 'frontmatter must be a YAML mapping (key: value), not an array or scalar',
    }
  }

  return {
    frontmatter: parsed as Frontmatter,
    body,
    hasFrontmatter: true,
  }
}

/** Pull out specific fields the wiki spec cares about (Artifact B requires these). */
export type WikiFrontmatterFields = {
  id?: string
  type?: string
  title?: string
  status?: string
  domain?: string
  owner?: string
  edit_policy?: string
  review_required?: boolean
  authority?: string
  links?: Array<string>
  tags?: Array<string>
}

export function readWikiFields(fm: Frontmatter | null): WikiFrontmatterFields {
  if (!fm) return {}
  const out: WikiFrontmatterFields = {}
  if (typeof fm.id === 'string') out.id = fm.id
  if (typeof fm.type === 'string') out.type = fm.type
  if (typeof fm.title === 'string') out.title = fm.title
  if (typeof fm.status === 'string') out.status = fm.status
  if (typeof fm.domain === 'string') out.domain = fm.domain
  if (typeof fm.owner === 'string') out.owner = fm.owner
  if (typeof fm.edit_policy === 'string') out.edit_policy = fm.edit_policy
  if (typeof fm.review_required === 'boolean') out.review_required = fm.review_required
  if (typeof fm.authority === 'string') out.authority = fm.authority
  if (Array.isArray(fm.links)) {
    out.links = fm.links.filter((l): l is string => typeof l === 'string')
  }
  if (Array.isArray(fm.tags)) {
    out.tags = fm.tags.filter((t): t is string => typeof t === 'string')
  }
  return out
}
