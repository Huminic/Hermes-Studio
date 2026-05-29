import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

export const PluginRouteSchema = z.object({
  path: z.string().min(1),
  renderer: z.string().min(1),
  profile_scoped: z.boolean(),
  auth: z.enum(['required', 'public']),
})

export const PluginSlotSchema = z.object({
  slot_id: z.string().min(1),
  renderer: z.string().min(1),
  applies_to_routes: z.array(z.string().min(1)).min(1),
})

export const PluginHostedBundleSchema = z.object({
  path: z.string().regex(/^\/[a-z0-9-]+\//, 'path must start with /<plugin-id>/'),
  entry: z.string().min(1),
  cors: z.string().min(1),
  cache_control: z.string().min(1),
})

export const PluginManifestSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'id must be kebab-case'),
  version: z.string().regex(/^\d+\.\d+\.\d+/, 'version must be semver'),
  display_name: z.string().min(1),
  requires_studio_version: z.string().min(1),
  routes: z.array(PluginRouteSchema).optional().default([]),
  right_pane_slots: z.array(PluginSlotSchema).optional().default([]),
  hosted_bundles: z.array(PluginHostedBundleSchema).optional().default([]),
  studio_config_schema: z.record(z.string(), z.unknown()).optional(),
  skill_dependencies: z.array(z.string()).optional().default([]),
  mcp_dependencies: z.array(z.string()).optional().default([]),
})

export type PluginManifest = z.infer<typeof PluginManifestSchema>

export type LoadedPlugin = {
  manifest: PluginManifest
  pluginDir: string
}

export type PluginLoadIssue = {
  pluginId: string | null
  pluginDir: string
  field: string | null
  message: string
}

export type PluginLoadResult = {
  plugins: Array<LoadedPlugin>
  issues: Array<PluginLoadIssue>
}

export type LoadPluginsOptions = {
  pluginsRoot?: string
  studioVersion: string
  rendererRegistry?: Set<string>
}

export function defaultPluginsRoot(): string {
  return path.join(os.homedir(), '.hermes', 'studio-plugins')
}

export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((s) => parseInt(s, 10))
  const pb = b.split('.').map((s) => parseInt(s, 10))
  for (let i = 0; i < 3; i++) {
    const ai = pa[i] ?? 0
    const bi = pb[i] ?? 0
    if (ai !== bi) return ai - bi
  }
  return 0
}

export function satisfiesRange(version: string, range: string): boolean {
  const trimmed = range.trim()
  const match = trimmed.match(/^(>=|<=|>|<|=)?\s*(\d+\.\d+\.\d+)$/)
  if (!match) return false
  const op = match[1] || '>='
  const target = match[2]
  const cmp = compareSemver(version, target)
  switch (op) {
    case '>=':
      return cmp >= 0
    case '<=':
      return cmp <= 0
    case '>':
      return cmp > 0
    case '<':
      return cmp < 0
    case '=':
      return cmp === 0
    default:
      return false
  }
}

export function loadPlugins(opts: LoadPluginsOptions): PluginLoadResult {
  const root = opts.pluginsRoot ?? defaultPluginsRoot()
  const plugins: Array<LoadedPlugin> = []
  const issues: Array<PluginLoadIssue> = []

  if (!fs.existsSync(root)) {
    return { plugins, issues }
  }

  const entries = fs.readdirSync(root, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const pluginDir = path.join(root, entry.name)
    const manifestPath = path.join(pluginDir, 'plugin.yaml')
    if (!fs.existsSync(manifestPath)) continue

    let raw: unknown
    try {
      const text = fs.readFileSync(manifestPath, 'utf8')
      raw = parseYaml(text)
    } catch (err) {
      issues.push({
        pluginId: null,
        pluginDir,
        field: null,
        message: `failed to parse plugin.yaml: ${(err as Error).message}`,
      })
      continue
    }

    const parsed = PluginManifestSchema.safeParse(raw)
    if (!parsed.success) {
      const idGuess =
        raw && typeof raw === 'object' && 'id' in raw
          ? String((raw as { id?: unknown }).id ?? '')
          : null
      for (const issue of parsed.error.issues) {
        issues.push({
          pluginId: idGuess,
          pluginDir,
          field: issue.path.join('.') || null,
          message: issue.message,
        })
      }
      continue
    }
    const manifest = parsed.data

    if (manifest.id !== entry.name) {
      issues.push({
        pluginId: manifest.id,
        pluginDir,
        field: 'id',
        message: `id "${manifest.id}" does not match directory name "${entry.name}"`,
      })
      continue
    }

    if (!satisfiesRange(opts.studioVersion, manifest.requires_studio_version)) {
      issues.push({
        pluginId: manifest.id,
        pluginDir,
        field: 'requires_studio_version',
        message: `Studio ${opts.studioVersion} does not satisfy ${manifest.requires_studio_version}`,
      })
      continue
    }

    for (const route of manifest.routes) {
      if (route.profile_scoped && !route.path.includes('$profile')) {
        issues.push({
          pluginId: manifest.id,
          pluginDir,
          field: `routes.${route.path}`,
          message: 'profile_scoped routes must contain $profile in path',
        })
      }
    }

    for (const bundle of manifest.hosted_bundles) {
      const expectedPrefix = `/${manifest.id}/`
      if (!bundle.path.startsWith(expectedPrefix)) {
        issues.push({
          pluginId: manifest.id,
          pluginDir,
          field: `hosted_bundles.${bundle.path}`,
          message: `hosted bundle path must start with "${expectedPrefix}" to avoid plugin collisions`,
        })
      }
    }

    if (opts.rendererRegistry) {
      for (const route of manifest.routes) {
        if (!opts.rendererRegistry.has(route.renderer)) {
          issues.push({
            pluginId: manifest.id,
            pluginDir,
            field: `routes.${route.path}.renderer`,
            message: `unknown renderer "${route.renderer}"`,
          })
        }
      }
      for (const slot of manifest.right_pane_slots) {
        if (!opts.rendererRegistry.has(slot.renderer)) {
          issues.push({
            pluginId: manifest.id,
            pluginDir,
            field: `right_pane_slots.${slot.slot_id}.renderer`,
            message: `unknown renderer "${slot.renderer}"`,
          })
        }
      }
    }

    plugins.push({ manifest, pluginDir })
  }

  return { plugins, issues }
}

export function registerPlugins(
  opts: LoadPluginsOptions,
): PluginLoadResult {
  const result = loadPlugins(opts)
  for (const issue of result.issues) {
    const where = issue.field ? `${issue.pluginId ?? '?'}.${issue.field}` : issue.pluginId ?? issue.pluginDir
    console.error(`[plugin-loader] ${where}: ${issue.message}`)
  }
  return result
}

export function validateProfileStudioConfig(
  plugin: PluginManifest,
  studioConfig: unknown,
): Array<string> {
  if (!plugin.studio_config_schema) return []
  const schema = plugin.studio_config_schema as Record<string, unknown>
  if (schema.type !== 'object') return []
  const errors: Array<string> = []
  const required = Array.isArray(schema.required)
    ? (schema.required as Array<string>)
    : []
  const config =
    studioConfig && typeof studioConfig === 'object'
      ? (studioConfig as Record<string, unknown>)
      : {}
  for (const key of required) {
    if (!(key in config)) {
      errors.push(`missing required key "${key}"`)
    }
  }
  return errors
}
