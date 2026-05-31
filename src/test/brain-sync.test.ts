import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openBrain } from '@/server/brain-store'
import { syncProfileFromRuntime } from '@/server/brain-sync'

let tmpRoot: string

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-sync-test-'))
  process.env.BRAIN_PROFILES_ROOT = path.join(tmpRoot, '.hermes', 'profiles')
  const profileRoot = path.join(tmpRoot, '.hermes', 'profiles', 'fixture')
  fs.mkdirSync(profileRoot, { recursive: true })
  const handle = openBrain('fixture', { profileRoot })
  handle.close()
})

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
})

describe('brain-sync (SRS B.1 runtime mapping)', () => {
  it('syncs adjacent neighbors from engagement-state.yaml', () => {
    const profileRoot = path.join(tmpRoot, '.hermes', 'profiles', 'fixture')
    fs.writeFileSync(
      path.join(profileRoot, 'engagement-state.yaml'),
      `
schema_version: 1
customer: fixture
current_stage: draft
adjacent_data_neighbors:
  - name: VinSolutions
    source_type: crm
    likelihood: high
    notes: federate
  - name: Google Analytics
    source_type: analytics
    likelihood: medium
    notes: federate
`,
      'utf8',
    )
    const report = syncProfileFromRuntime('fixture')
    expect(report.adjacent_neighbors_synced).toBe(2)
  })

  it('handles missing messaging-hub.db gracefully', () => {
    const report = syncProfileFromRuntime('fixture')
    expect(report.threads_synced).toBe(0)
    expect(report.messages_synced).toBe(0)
    expect(report.contacts_synced).toBe(0)
    // No error from missing messaging-hub.db; engagement-state may or may not be present.
  })

  it('records an observation summarizing the sync pass', () => {
    syncProfileFromRuntime('fixture')
    const handle = openBrain('fixture')
    try {
      const obs = handle.all<{ observation: string }>(
        `SELECT observation FROM observations WHERE observer = 'brain-sync'`,
      )
      expect(obs.length).toBeGreaterThan(0)
      expect(obs[0].observation).toMatch(/sync pass/)
    } finally {
      handle.close()
    }
  })
})
