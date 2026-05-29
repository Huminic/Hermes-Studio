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
 *
 * Returns null if no profile has a widget with that slug.
 */
export function findPublicWidget(slug: string): PublicWidget | null {
  if (!fs.existsSync(PROFILES_ROOT)) return null
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
      const fmSlug = String(fm.frontmatter.slug ?? '')
      if (fmSlug === slug) {
        return {
          profile,
          slug,
          filePath,
          frontmatter: fm.frontmatter,
          body: fm.body,
        }
      }
    }
  }
  return null
}
