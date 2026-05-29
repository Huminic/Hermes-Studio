import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { extractFrontmatter } from '../lib/frontmatter'

export type PublicWidget = {
  profile: string
  slug: string
  filePath: string
  frontmatter: Record<string, unknown>
  body: string
}

const PROFILES_ROOT = path.join(os.homedir(), '.hermes', 'profiles')

/**
 * Resolve a public widget by slug across ALL profiles.
 * Widgets live at ~/.hermes/profiles/<profile>/knowledge/widgets/*.md and
 * declare a `slug:` field in frontmatter. The public URL /w/<slug> does
 * not carry profile context, so we scan every profile for a match.
 */
export function findPublicWidget(slug: string): PublicWidget | null {
  if (!fs.existsSync(PROFILES_ROOT)) return null
  for (const widget of listPublicWidgets()) {
    if (widget.slug === slug) return widget
  }
  return null
}

/** List every published widget across all profiles. */
export function listPublicWidgets(): Array<PublicWidget> {
  if (!fs.existsSync(PROFILES_ROOT)) return []
  const out: Array<PublicWidget> = []
  const profiles = fs
    .readdirSync(PROFILES_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
  for (const profile of profiles) {
    const widgetsDir = path.join(
      PROFILES_ROOT,
      profile,
      'knowledge',
      'widgets',
    )
    if (!fs.existsSync(widgetsDir)) continue
    const files = fs.readdirSync(widgetsDir).filter((f) => f.endsWith('.md'))
    for (const file of files) {
      const filePath = path.join(widgetsDir, file)
      const raw = fs.readFileSync(filePath, 'utf8')
      const fm = extractFrontmatter(raw)
      if (!fm.frontmatter) continue
      const slug = String(fm.frontmatter.slug ?? '')
      if (!slug) continue
      out.push({
        profile,
        slug,
        filePath,
        frontmatter: fm.frontmatter,
        body: fm.body,
      })
    }
  }
  return out
}

/**
 * Resolve the agent's SOUL fragment for a widget. Looks under the widget's
 * profile at governance/agents/<agentId>.md. Returns the file content or
 * null if no matching SOUL exists (then the caller falls back to the
 * widget greeting + body as context).
 */
export function readAgentSoul(
  profile: string,
  agentId: string,
): string | null {
  const file = path.join(
    PROFILES_ROOT,
    profile,
    'governance',
    'agents',
    `${agentId}.md`,
  )
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return null
  }
}
