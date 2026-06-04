/**
 * Customer-admin widget helpers — Phase C.4.
 *
 * Per-profile widget rows assembled from:
 *   - studio.yaml `widgets[]` declarations (slug/mode/agent metadata)
 *   - knowledge/widgets/<slug>.md frontmatter + body (the actual content
 *     the public /w/<slug> route renders)
 *
 * The studio.yaml entry is authoritative for "which widgets exist for
 * this profile"; the wiki file is the content. When the wiki file is
 * missing we surface a clear status so the customer-admin knows to
 * create it.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { extractFrontmatter } from '../lib/frontmatter'
import { readStudioConfig } from './studio-config'

export type CustomerWidget = {
  slug: string
  mode: 'chat' | 'voice' | 'video' | 'form'
  agent: string
  status: 'ready' | 'missing-file' | 'misconfigured'
  filePath: string | null
  greeting: string | null
  title: string | null
  body: string | null
  embed_snippet: string
  preview_url: string
}

function widgetFilePath(profile: string, slug: string): string {
  return path.join(
    os.homedir(),
    '.hermes',
    'profiles',
    profile,
    'knowledge',
    'widgets',
    `${slug}.md`,
  )
}

/**
 * Reject slugs that could traverse out of the widgets directory. Widget slugs
 * are simple identifiers (letters, digits, dashes, underscores).
 */
function isSafeSlug(slug: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(slug)
}

/**
 * Read a widget's stored markdown file (frontmatter + body). Widgets live under
 * `knowledge/widgets/`, which is intentionally OUTSIDE the customer wiki root,
 * so widget I/O has its own guarded helpers rather than reusing the wiki ones.
 */
export function readCustomerWidgetFile(
  profile: string,
  slug: string,
): { ok: boolean; content?: string; error?: string } {
  if (!isSafeSlug(slug)) {
    return { ok: false, error: 'Invalid widget id.' }
  }
  const file = widgetFilePath(profile, slug)
  if (!fs.existsSync(file)) {
    return { ok: false, error: 'Not found' }
  }
  return { ok: true, content: fs.readFileSync(file, 'utf8') }
}

/**
 * Write a widget's markdown file, creating the `knowledge/widgets/` directory
 * if needed. Returns the previous content (for audit/gating) when present.
 */
export function writeCustomerWidgetFile(
  profile: string,
  slug: string,
  content: string,
): { ok: boolean; error?: string; previous?: string | null } {
  if (!isSafeSlug(slug)) {
    return { ok: false, error: 'Invalid widget id.' }
  }
  const file = widgetFilePath(profile, slug)
  let previous: string | null = null
  if (fs.existsSync(file)) {
    previous = fs.readFileSync(file, 'utf8')
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content, 'utf8')
  return { ok: true, previous }
}

function originHint(): string {
  return process.env.STUDIO_PUBLIC_ORIGIN ?? 'https://studio.huminic.app'
}

function buildEmbedSnippet(slug: string): string {
  const origin = originHint()
  // Single-ID embed (WS-7): one snippet, one id. The id IS the slug. The
  // minified bundle reads ?id=<slug> and resolves all config from
  // /api/public/widget-config/<slug>. No domain key, no per-dealer script.
  return `<script async src="${origin}/nexxus-widget.min.js?id=${encodeURIComponent(slug)}"></script>`
}

function buildPreviewUrl(slug: string): string {
  // Same-origin (relative) so the in-app preview loads from wherever Studio is
  // served (localhost in dev, the live host in prod) and frames same-origin.
  // The EMBED snippet stays absolute — dealers paste it on their own site.
  return `/w/${encodeURIComponent(slug)}`
}

export function listCustomerWidgets(profile: string): {
  ok: boolean
  widgets: Array<CustomerWidget>
  source: 'file' | 'default'
} {
  const { config, source } = readStudioConfig(profile)
  const out: Array<CustomerWidget> = []
  for (const decl of config.widgets) {
    const file = widgetFilePath(profile, decl.slug)
    let status: CustomerWidget['status'] = 'ready'
    let greeting: string | null = null
    let title: string | null = null
    let body: string | null = null
    let filePath: string | null = null
    if (!fs.existsSync(file)) {
      status = 'missing-file'
    } else {
      filePath = file
      const raw = fs.readFileSync(file, 'utf8')
      const { frontmatter, body: extractedBody } = extractFrontmatter(raw)
      body = extractedBody
      if (frontmatter) {
        greeting =
          typeof frontmatter.greeting === 'string' ? frontmatter.greeting : null
        title = typeof frontmatter.title === 'string' ? frontmatter.title : null
        const declAgent = decl.agent ?? ''
        const fmAgent =
          typeof frontmatter.agent === 'string' ? frontmatter.agent : null
        if (declAgent && fmAgent && declAgent !== fmAgent) {
          status = 'misconfigured'
        }
      } else {
        status = 'misconfigured'
      }
    }
    out.push({
      slug: decl.slug,
      mode: decl.mode,
      agent: decl.agent,
      status,
      filePath,
      greeting,
      title,
      body,
      embed_snippet: buildEmbedSnippet(decl.slug),
      preview_url: buildPreviewUrl(decl.slug),
    })
  }
  return { ok: true, widgets: out, source }
}
