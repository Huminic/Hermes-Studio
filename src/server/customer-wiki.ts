/**
 * Customer-wiki server helpers — AC.3.1+.
 *
 * Exposes only the customer-editable portion of the profile wiki to the
 * /api/customer/wiki/* endpoints. Excludes the protected trees
 * (canon/, governance/) that are operator-only.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type CustomerWikiNode = {
  name: string
  path: string
  type: 'dir' | 'file'
  size?: number
  modified?: number
  children?: Array<CustomerWikiNode>
}

const EXCLUDED_TOP_LEVEL = new Set([
  'canon',
  'governance',
  'sessions',
  'state.db',
  'state.db-shm',
  'state.db-wal',
  'messaging-hub.db',
  'messaging-hub.db-shm',
  'messaging-hub.db-wal',
  '.git',
  'archive',
])

function profileRoot(profile: string): string {
  return path.join(os.homedir(), '.hermes', 'profiles', profile)
}

function safeReadDir(dir: string): Array<fs.Dirent> {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

function walk(
  base: string,
  rel: string,
  depth = 0,
): Array<CustomerWikiNode> {
  const here = path.join(base, rel)
  const entries = safeReadDir(here)
  const out: Array<CustomerWikiNode> = []
  for (const entry of entries) {
    if (rel === '' && EXCLUDED_TOP_LEVEL.has(entry.name)) continue
    if (entry.name.startsWith('.')) continue
    const relChild = path.posix.join(rel, entry.name)
    const fullChild = path.join(base, relChild)
    if (entry.isDirectory()) {
      out.push({
        name: entry.name,
        path: relChild,
        type: 'dir',
        children: depth < 4 ? walk(base, relChild, depth + 1) : [],
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
  const base = profileRoot(profile)
  if (!fs.existsSync(base)) {
    return { ok: true, tree: [], root_exists: false }
  }
  return { ok: true, tree: walk(base, ''), root_exists: true }
}

function ensureSafePath(profile: string, relPath: string): string {
  const norm = relPath.replace(/\\/g, '/').replace(/^\/+/, '')
  if (norm.includes('..')) {
    throw new Error('Path traversal is not allowed.')
  }
  if (!norm.endsWith('.md')) {
    throw new Error('Only Markdown files are allowed.')
  }
  const top = norm.split('/')[0] ?? ''
  if (EXCLUDED_TOP_LEVEL.has(top)) {
    throw new Error(`Path '${top}/' is read-only for customer-admin.`)
  }
  const base = path.resolve(profileRoot(profile))
  const full = path.resolve(base, norm)
  const rel = path.relative(base, full)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Resolved path escapes the profile root.')
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
