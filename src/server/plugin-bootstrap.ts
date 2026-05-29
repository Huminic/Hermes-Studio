/**
 * Studio bootstrap entry for the plugin loader.
 *
 * Resolves and caches the set of plugins installed under ~/.hermes/studio-plugins.
 * Called by /api/plugins on first hit (memoized) so plugin discovery doesn't
 * happen on every request. Resolves Studio version from package.json so the
 * loader can validate requires_studio_version compatibility.
 *
 * In Phase 0 this layer existed only as a pure library; Phase 7 wires it into
 * the server so the customer-console plugin (installed by Phase 1's bootstrap
 * script) becomes live infrastructure.
 */

import fs from 'node:fs'
import path from 'node:path'
import {
  loadPlugins,
  type PluginLoadResult,
  type LoadPluginsOptions,
} from '../lib/plugin-loader'

let cached: PluginLoadResult | null = null
let cacheKey: string | null = null

function readStudioVersion(): string {
  try {
    const pkgPath = path.resolve(process.cwd(), 'package.json')
    if (!fs.existsSync(pkgPath)) return '0.0.0'
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as {
      version?: string
    }
    return pkg.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

export type GetLoadedPluginsOptions = {
  /** Override the plugins root. Used by tests. */
  pluginsRoot?: string
  /** Override the Studio version. Used by tests. */
  studioVersion?: string
  /** Force a fresh load even if cached. */
  fresh?: boolean
}

function logBootstrap(result: PluginLoadResult): void {
  console.log(
    `[plugin-bootstrap] loaded ${result.plugins.length} plugin(s); ${result.issues.length} issue(s)`,
  )
  for (const plugin of result.plugins) {
    const m = plugin.manifest
    console.log(
      `  - ${m.id}@${m.version}: ${m.routes.length} routes, ${m.right_pane_slots.length} slots, ${m.hosted_bundles.length} bundles`,
    )
  }
  for (const issue of result.issues) {
    console.error(
      `[plugin-bootstrap] issue: ${issue.pluginId ?? '?'} field=${issue.field ?? '?'} — ${issue.message}`,
    )
  }
}

export function getLoadedPlugins(
  opts: GetLoadedPluginsOptions = {},
): PluginLoadResult {
  const studioVersion = opts.studioVersion ?? readStudioVersion()
  const key = `${opts.pluginsRoot ?? '~'}::${studioVersion}`
  if (!opts.fresh && cached && cacheKey === key) return cached

  const loadOpts: LoadPluginsOptions = {
    studioVersion,
  }
  if (opts.pluginsRoot) loadOpts.pluginsRoot = opts.pluginsRoot

  const result = loadPlugins(loadOpts)
  cached = result
  cacheKey = key
  logBootstrap(result)
  return result
}

/** Test helper — clears the memoized result. */
export function __resetPluginBootstrapCache(): void {
  cached = null
  cacheKey = null
}

export type PluginSummary = {
  id: string
  version: string
  display_name: string
  routes_count: number
  slots_count: number
  bundles_count: number
  skill_dependencies: Array<string>
  mcp_dependencies: Array<string>
}

export function summarize(result: PluginLoadResult): {
  plugins: Array<PluginSummary>
  issues: PluginLoadResult['issues']
} {
  return {
    plugins: result.plugins.map((p) => ({
      id: p.manifest.id,
      version: p.manifest.version,
      display_name: p.manifest.display_name,
      routes_count: p.manifest.routes.length,
      slots_count: p.manifest.right_pane_slots.length,
      bundles_count: p.manifest.hosted_bundles.length,
      skill_dependencies: p.manifest.skill_dependencies,
      mcp_dependencies: p.manifest.mcp_dependencies,
    })),
    issues: result.issues,
  }
}
