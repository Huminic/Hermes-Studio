/**
 * Customer-wiki server helpers — SERRA-UI-5.
 *
 * The customer-facing Knowledge panel is a CLEAN, customer-facing wiki. It
 * exposes ONLY a single curated subtree — `company-wiki/` at the profile
 * root — and nothing else. Everything else in the profile (brain/, vectors/,
 * backups/, uploads/, data/, campaigns/, widgets/, knowledge/, canon/,
 * governance/, sessions/, SOUL.md, studio.yaml, config.yaml, auth.yaml,
 * persona.md, *.db, ...) is BACKEND PLUMBING and is invisible to the customer.
 *
 * Model: serve ONLY the `company-wiki/` root, NOT "profile-root-minus-excludes".
 * The API lists / reads / writes / moves strictly within that subtree, with
 * path-traversal guards retained.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type CustomerWikiNode = {
  name: string
  /** Path relative to the profile root, always under `company-wiki/`. */
  path: string
  type: 'dir' | 'file'
  size?: number
  modified?: number
  children?: Array<CustomerWikiNode>
}

/**
 * The single curated subtree the customer wiki is allowed to see. This is the
 * inversion of the old "profile-root-minus-excludes" model: instead of
 * blacklisting backend folders, we whitelist exactly one wiki root and treat
 * everything else as invisible.
 */
export const WIKI_ROOT = 'company-wiki'

function profileRoot(profile: string): string {
  return path.join(os.homedir(), '.hermes', 'profiles', profile)
}

function wikiRoot(profile: string): string {
  return path.join(profileRoot(profile), WIKI_ROOT)
}

function safeReadDir(dir: string): Array<fs.Dirent> {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

/**
 * Walk a directory under the wiki root. `base` is the profile root; `rel` is
 * the path relative to the profile root (so it always begins with
 * `company-wiki/...`). Only directories and Markdown files are surfaced;
 * dotfiles (incl. .gitkeep) are hidden.
 */
function walk(base: string, rel: string, depth = 0): Array<CustomerWikiNode> {
  const here = path.join(base, rel)
  const entries = safeReadDir(here)
  const out: Array<CustomerWikiNode> = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const relChild = path.posix.join(rel, entry.name)
    const fullChild = path.join(base, relChild)
    if (entry.isDirectory()) {
      out.push({
        name: entry.name,
        path: relChild,
        type: 'dir',
        children: depth < 6 ? walk(base, relChild, depth + 1) : [],
      })
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      let stat: fs.Stats | null = null
      try {
        stat = fs.statSync(fullChild)
      } catch {
        // skip
      }
      out.push({
        name: entry.name,
        path: relChild,
        type: 'file',
        size: stat?.size ?? 0,
        modified: stat?.mtimeMs ?? 0,
      })
    }
  }
  return out.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export function listCustomerWikiTree(profile: string): {
  ok: boolean
  tree: Array<CustomerWikiNode>
  root_exists: boolean
} {
  const root = wikiRoot(profile)
  if (!fs.existsSync(root)) {
    // The profile may exist but have no company wiki yet. Report no root so
    // the UI shows a plain-language empty state — never the profile root.
    return { ok: true, tree: [], root_exists: false }
  }
  // Walk from the profile root but starting at `company-wiki/`, so every
  // returned path is anchored under the wiki root and nothing above it can
  // ever be enumerated.
  return {
    ok: true,
    tree: walk(profileRoot(profile), WIKI_ROOT),
    root_exists: true,
  }
}

/**
 * Resolve a customer-supplied path to an absolute file path, enforcing that:
 *  - it is a Markdown file,
 *  - it does not traverse (`..`),
 *  - it resolves strictly inside `company-wiki/` (never the profile root or
 *    any sibling backend folder).
 */
function ensureSafePath(profile: string, relPath: string): string {
  const norm = relPath.replace(/\\/g, '/').replace(/^\/+/, '')
  if (norm.includes('..')) {
    throw new Error('Path traversal is not allowed.')
  }
  if (!norm.endsWith('.md')) {
    throw new Error('Only Markdown files are allowed.')
  }
  const top = norm.split('/').filter(Boolean)[0] ?? ''
  if (top !== WIKI_ROOT) {
    // Anything not anchored at the wiki root is backend plumbing.
    throw new Error('Path is outside the company wiki.')
  }
  const root = path.resolve(wikiRoot(profile))
  // Resolve relative to the PROFILE root because `norm` includes the
  // `company-wiki/` segment, then confirm the result stays inside the wiki
  // root specifically.
  const full = path.resolve(profileRoot(profile), norm)
  const rel = path.relative(root, full)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Resolved path escapes the company wiki.')
  }
  return full
}

export function readCustomerWikiFile(
  profile: string,
  relPath: string,
): { ok: boolean; content?: string; error?: string } {
  let full: string
  try {
    full = ensureSafePath(profile, relPath)
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
  if (!fs.existsSync(full)) {
    return { ok: false, error: 'Not found' }
  }
  return { ok: true, content: fs.readFileSync(full, 'utf8') }
}

export function writeCustomerWikiFile(
  profile: string,
  relPath: string,
  content: string,
): { ok: boolean; error?: string; previous?: string | null } {
  let full: string
  try {
    full = ensureSafePath(profile, relPath)
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
  let previous: string | null = null
  if (fs.existsSync(full)) {
    previous = fs.readFileSync(full, 'utf8')
  }
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content, 'utf8')
  return { ok: true, previous }
}

export function moveCustomerWikiFile(
  profile: string,
  fromRel: string,
  toRel: string,
): { ok: boolean; error?: string } {
  let from: string
  let to: string
  try {
    from = ensureSafePath(profile, fromRel)
    to = ensureSafePath(profile, toRel)
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
  if (!fs.existsSync(from)) {
    return { ok: false, error: 'Source not found.' }
  }
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.renameSync(from, to)
  return { ok: true }
}

/**
 * The knowledge-authoring tree (`knowledge/inbox|drafts|published`) is a
 * SEPARATE concern from the customer-facing `company-wiki/` view. It is never
 * enumerated in the customer wiki tree, but the promote API still moves files
 * through it (inbox → drafts → published). This guarded helper resolves paths
 * strictly inside `knowledge/`, with the same traversal protections.
 */
const KNOWLEDGE_ROOT = 'knowledge'

function ensureSafeKnowledgePath(profile: string, relPath: string): string {
  const norm = relPath.replace(/\\/g, '/').replace(/^\/+/, '')
  if (norm.includes('..')) {
    throw new Error('Path traversal is not allowed.')
  }
  if (!norm.endsWith('.md')) {
    throw new Error('Only Markdown files are allowed.')
  }
  const top = norm.split('/').filter(Boolean)[0] ?? ''
  if (top !== KNOWLEDGE_ROOT) {
    throw new Error('Path is outside the knowledge tree.')
  }
  const root = path.resolve(profileRoot(profile), KNOWLEDGE_ROOT)
  const full = path.resolve(profileRoot(profile), norm)
  const rel = path.relative(root, full)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Resolved path escapes the knowledge tree.')
  }
  return full
}

export function moveKnowledgeFile(
  profile: string,
  fromRel: string,
  toRel: string,
): { ok: boolean; error?: string } {
  let from: string
  let to: string
  try {
    from = ensureSafeKnowledgePath(profile, fromRel)
    to = ensureSafeKnowledgePath(profile, toRel)
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
  if (!fs.existsSync(from)) {
    return { ok: false, error: 'Source not found.' }
  }
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.renameSync(from, to)
  return { ok: true }
}
