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

function originHint(): string {
  return process.env.STUDIO_PUBLIC_ORIGIN ?? 'https://studio.huminic.app'
}

function buildEmbedSnippet(slug: string): string {
  const origin = originHint()
  return `<script async src="${origin}/customer-console/embed.js" data-widget-slug="${slug}"></script>`
}

function buildPreviewUrl(slug: string): string {
  return `${originHint()}/w/${encodeURIComponent(slug)}`
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
