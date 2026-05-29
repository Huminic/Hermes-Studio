import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  getLoadedPlugins,
  __resetPluginBootstrapCache,
  summarize,
} from '@/server/plugin-bootstrap'

let tmpRoot: string

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-bootstrap-test-'))
  __resetPluginBootstrapCache()
})

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
  __resetPluginBootstrapCache()
})

function writePlugin(id: string, yaml: string): void {
  const dir = path.join(tmpRoot, id)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'plugin.yaml'), yaml)
}

const VALID_PLUGIN = `
id: customer-console
version: 0.1.0
display_name: Customer Console
requires_studio_version: ">=1.0.0"
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
hosted_bundles:
  - path: /customer-console/embed.js
    entry: src/embed/customer-console/widget-loader.ts
    cors: "*"
    cache_control: "public, max-age=300"
skill_dependencies:
  - web-artifact
mcp_dependencies: []
`

describe('getLoadedPlugins', () => {
  it('returns an empty list when the plugins root does not exist', () => {
    const result = getLoadedPlugins({
      pluginsRoot: path.join(tmpRoot, 'nonexistent'),
      studioVersion: '1.20.0',
    })
    expect(result.plugins).toEqual([])
    expect(result.issues).toEqual([])
  })

  it('loads a valid plugin from the bootstrap root', () => {
    writePlugin('customer-console', VALID_PLUGIN)
    const result = getLoadedPlugins({
      pluginsRoot: tmpRoot,
      studioVersion: '1.20.0',
    })
    expect(result.plugins).toHaveLength(1)
    expect(result.plugins[0].manifest.id).toBe('customer-console')
  })

  it('memoizes the result and returns the cached value on subsequent calls', () => {
    writePlugin('customer-console', VALID_PLUGIN)
    const first = getLoadedPlugins({
      pluginsRoot: tmpRoot,
      studioVersion: '1.20.0',
    })
    // Delete the plugin after first load
    fs.rmSync(path.join(tmpRoot, 'customer-console'), {
      recursive: true,
      force: true,
    })
    const second = getLoadedPlugins({
      pluginsRoot: tmpRoot,
      studioVersion: '1.20.0',
    })
    expect(second).toBe(first)
  })

  it('reloads when fresh: true is set', () => {
    writePlugin('customer-console', VALID_PLUGIN)
    getLoadedPlugins({
      pluginsRoot: tmpRoot,
      studioVersion: '1.20.0',
    })
    fs.rmSync(path.join(tmpRoot, 'customer-console'), {
      recursive: true,
      force: true,
    })
    const fresh = getLoadedPlugins({
      pluginsRoot: tmpRoot,
      studioVersion: '1.20.0',
      fresh: true,
    })
    expect(fresh.plugins).toEqual([])
  })

  it('reloads when the cache key changes (different pluginsRoot)', () => {
    writePlugin('customer-console', VALID_PLUGIN)
    const first = getLoadedPlugins({
      pluginsRoot: tmpRoot,
      studioVersion: '1.20.0',
    })
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-bootstrap-other-'))
    const second = getLoadedPlugins({
      pluginsRoot: other,
      studioVersion: '1.20.0',
    })
    expect(second).not.toBe(first)
    expect(second.plugins).toEqual([])
    fs.rmSync(other, { recursive: true, force: true })
  })
})

describe('summarize', () => {
  it('flattens plugin manifests into summary entries', () => {
    writePlugin('customer-console', VALID_PLUGIN)
    const result = getLoadedPlugins({
      pluginsRoot: tmpRoot,
      studioVersion: '1.20.0',
    })
    const summary = summarize(result)
    expect(summary.plugins).toHaveLength(1)
    expect(summary.plugins[0]).toMatchObject({
      id: 'customer-console',
      version: '0.1.0',
      display_name: 'Customer Console',
      routes_count: 1,
      slots_count: 1,
      bundles_count: 1,
      skill_dependencies: ['web-artifact'],
      mcp_dependencies: [],
    })
    expect(summary.issues).toEqual([])
  })

  it('surfaces issues from the load result', () => {
    writePlugin(
      'broken-plugin',
      `
id: broken-plugin
version: 0.1.0
requires_studio_version: ">=1.0.0"
`,
    )
    const result = getLoadedPlugins({
      pluginsRoot: tmpRoot,
      studioVersion: '1.20.0',
    })
    const summary = summarize(result)
    expect(summary.plugins).toEqual([])
    expect(summary.issues.length).toBeGreaterThan(0)
  })
})
