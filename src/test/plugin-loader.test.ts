import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  loadPlugins,
  registerPlugins,
  satisfiesRange,
  validateProfileStudioConfig,
  PluginManifestSchema,
} from '@/lib/plugin-loader'

function makeTmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-loader-test-'))
}

function writePlugin(root: string, id: string, yaml: string): string {
  const dir = path.join(root, id)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'plugin.yaml'), yaml, 'utf8')
  return dir
}

const VALID_MANIFEST = `
id: customer-console
version: 0.1.0
display_name: Customer Console
requires_studio_version: ">=1.20.0"
routes:
  - path: /console/$profile/chat
    renderer: customer-console.chat
    profile_scoped: true
    auth: required
right_pane_slots:
  - slot_id: console-assistant
    renderer: customer-console.assistant-pane
    applies_to_routes:
      - /console/$profile/chat
studio_config_schema:
  type: object
  properties:
    branding:
      type: object
  required:
    - branding
skill_dependencies:
  - web-artifact
mcp_dependencies: []
`

describe('plugin-loader', () => {
  let root: string

  beforeEach(() => {
    root = makeTmpRoot()
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('returns empty plugin set when plugins root does not exist', () => {
    const result = loadPlugins({
      pluginsRoot: path.join(root, 'nonexistent'),
      studioVersion: '1.20.0',
    })
    expect(result.plugins).toEqual([])
    expect(result.issues).toEqual([])
  })

  it('loads a valid plugin manifest', () => {
    writePlugin(root, 'customer-console', VALID_MANIFEST)
    const result = loadPlugins({
      pluginsRoot: root,
      studioVersion: '1.20.0',
    })
    expect(result.issues).toEqual([])
    expect(result.plugins).toHaveLength(1)
    expect(result.plugins[0].manifest.id).toBe('customer-console')
    expect(result.plugins[0].manifest.routes).toHaveLength(1)
    expect(result.plugins[0].manifest.routes[0].renderer).toBe(
      'customer-console.chat',
    )
  })

  it('rejects a manifest missing a required field', () => {
    writePlugin(
      root,
      'broken-plugin',
      `
id: broken-plugin
version: 0.1.0
requires_studio_version: ">=1.0.0"
`,
    )
    const result = loadPlugins({
      pluginsRoot: root,
      studioVersion: '1.20.0',
    })
    expect(result.plugins).toEqual([])
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.issues.some((i) => i.field === 'display_name')).toBe(true)
  })

  it('rejects a manifest whose id does not match its directory', () => {
    writePlugin(
      root,
      'foo-dir',
      `
id: not-foo-dir
version: 0.1.0
display_name: Mismatched
requires_studio_version: ">=1.0.0"
`,
    )
    const result = loadPlugins({
      pluginsRoot: root,
      studioVersion: '1.20.0',
    })
    expect(result.plugins).toEqual([])
    expect(
      result.issues.some(
        (i) => i.field === 'id' && i.message.includes('does not match'),
      ),
    ).toBe(true)
  })

  it('rejects a plugin whose Studio version requirement is not satisfied', () => {
    writePlugin(
      root,
      'future-plugin',
      `
id: future-plugin
version: 0.1.0
display_name: Future
requires_studio_version: ">=2.0.0"
`,
    )
    const result = loadPlugins({
      pluginsRoot: root,
      studioVersion: '1.20.0',
    })
    expect(result.plugins).toEqual([])
    expect(
      result.issues.some((i) => i.field === 'requires_studio_version'),
    ).toBe(true)
  })

  it('flags profile_scoped routes that omit $profile in the path', () => {
    writePlugin(
      root,
      'bad-path-plugin',
      `
id: bad-path-plugin
version: 0.1.0
display_name: Bad Path
requires_studio_version: ">=1.0.0"
routes:
  - path: /console/chat
    renderer: anything
    profile_scoped: true
    auth: required
`,
    )
    const result = loadPlugins({
      pluginsRoot: root,
      studioVersion: '1.20.0',
    })
    expect(result.plugins).toHaveLength(1)
    expect(
      result.issues.some((i) => i.message.includes('must contain $profile')),
    ).toBe(true)
  })

  it('rejects plugin routes that reference an unknown renderer when registry is provided', () => {
    writePlugin(root, 'customer-console', VALID_MANIFEST)
    const result = loadPlugins({
      pluginsRoot: root,
      studioVersion: '1.20.0',
      rendererRegistry: new Set(['customer-console.chat']),
    })
    expect(result.plugins).toHaveLength(1)
    expect(
      result.issues.some((i) =>
        i.message.includes('unknown renderer "customer-console.assistant-pane"'),
      ),
    ).toBe(true)
  })

  it('accepts plugin routes when all renderers exist in the registry', () => {
    writePlugin(root, 'customer-console', VALID_MANIFEST)
    const result = loadPlugins({
      pluginsRoot: root,
      studioVersion: '1.20.0',
      rendererRegistry: new Set([
        'customer-console.chat',
        'customer-console.assistant-pane',
      ]),
    })
    expect(result.plugins).toHaveLength(1)
    expect(result.issues).toEqual([])
  })
})

describe('hosted bundles', () => {
  let root: string
  beforeEach(() => {
    root = makeTmpRoot()
  })
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('accepts a plugin with valid hosted_bundles', () => {
    writePlugin(
      root,
      'customer-console',
      `
id: customer-console
version: 0.1.0
display_name: Customer Console
requires_studio_version: ">=1.20.0"
hosted_bundles:
  - path: /customer-console/embed.js
    entry: src/embed/customer-console/widget-loader.ts
    cors: "*"
    cache_control: "public, max-age=300"
`,
    )
    const result = loadPlugins({
      pluginsRoot: root,
      studioVersion: '1.20.0',
    })
    expect(result.issues).toEqual([])
    expect(result.plugins[0].manifest.hosted_bundles).toHaveLength(1)
  })

  it('rejects a hosted bundle path that does not start with /<plugin-id>/', () => {
    writePlugin(
      root,
      'customer-console',
      `
id: customer-console
version: 0.1.0
display_name: Customer Console
requires_studio_version: ">=1.20.0"
hosted_bundles:
  - path: /wrong-prefix/embed.js
    entry: src/embed/customer-console/widget-loader.ts
    cors: "*"
    cache_control: "public, max-age=300"
`,
    )
    const result = loadPlugins({
      pluginsRoot: root,
      studioVersion: '1.20.0',
    })
    expect(
      result.issues.some((i) => i.message.includes('plugin collisions')),
    ).toBe(true)
  })
})

describe('satisfiesRange', () => {
  it('handles >= comparisons', () => {
    expect(satisfiesRange('1.20.0', '>=1.20.0')).toBe(true)
    expect(satisfiesRange('1.20.1', '>=1.20.0')).toBe(true)
    expect(satisfiesRange('1.19.0', '>=1.20.0')).toBe(false)
  })

  it('handles > and < and =', () => {
    expect(satisfiesRange('1.20.0', '>1.19.0')).toBe(true)
    expect(satisfiesRange('1.20.0', '>1.20.0')).toBe(false)
    expect(satisfiesRange('1.0.0', '<2.0.0')).toBe(true)
    expect(satisfiesRange('1.20.0', '=1.20.0')).toBe(true)
    expect(satisfiesRange('1.20.1', '=1.20.0')).toBe(false)
  })

  it('treats a bare version as >=', () => {
    expect(satisfiesRange('1.20.0', '1.20.0')).toBe(true)
    expect(satisfiesRange('1.20.1', '1.20.0')).toBe(true)
  })
})

describe('PluginManifestSchema', () => {
  it('enforces kebab-case ids', () => {
    expect(
      PluginManifestSchema.safeParse({
        id: 'NotKebab',
        version: '0.1.0',
        display_name: 'x',
        requires_studio_version: '>=1.0.0',
      }).success,
    ).toBe(false)
    expect(
      PluginManifestSchema.safeParse({
        id: 'good-id',
        version: '0.1.0',
        display_name: 'x',
        requires_studio_version: '>=1.0.0',
      }).success,
    ).toBe(true)
  })
})

describe('registerPlugins', () => {
  let root: string
  beforeEach(() => {
    root = makeTmpRoot()
  })
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('returns same shape as loadPlugins', () => {
    writePlugin(root, 'customer-console', VALID_MANIFEST)
    const result = registerPlugins({
      pluginsRoot: root,
      studioVersion: '1.20.0',
    })
    expect(result.plugins).toHaveLength(1)
    expect(result.plugins[0].manifest.id).toBe('customer-console')
  })
})

describe('validateProfileStudioConfig', () => {
  it('returns an error when a required key is missing', () => {
    const manifest = {
      id: 'p',
      version: '0.1.0',
      display_name: 'x',
      requires_studio_version: '>=1.0.0',
      routes: [],
      right_pane_slots: [],
      skill_dependencies: [],
      mcp_dependencies: [],
      studio_config_schema: {
        type: 'object',
        required: ['branding'],
        properties: { branding: { type: 'object' } },
      },
    } as const
    const errors = validateProfileStudioConfig(manifest, {})
    expect(errors).toContain('missing required key "branding"')
  })

  it('returns no errors when required keys are present', () => {
    const manifest = {
      id: 'p',
      version: '0.1.0',
      display_name: 'x',
      requires_studio_version: '>=1.0.0',
      routes: [],
      right_pane_slots: [],
      skill_dependencies: [],
      mcp_dependencies: [],
      studio_config_schema: {
        type: 'object',
        required: ['branding'],
        properties: { branding: { type: 'object' } },
      },
    } as const
    const errors = validateProfileStudioConfig(manifest, {
      branding: { persona_name: 'Automa' },
    })
    expect(errors).toEqual([])
  })

  it('returns no errors when manifest has no schema', () => {
    const manifest = {
      id: 'p',
      version: '0.1.0',
      display_name: 'x',
      requires_studio_version: '>=1.0.0',
      routes: [],
      right_pane_slots: [],
      skill_dependencies: [],
      mcp_dependencies: [],
    } as const
    const errors = validateProfileStudioConfig(manifest, { anything: 1 })
    expect(errors).toEqual([])
  })
})
