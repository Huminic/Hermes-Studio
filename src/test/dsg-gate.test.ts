import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openBrain } from '@/server/brain-store'
import { dsgGate, dsgReadGate, type DsgInput } from '@/server/dsg-gate'

let tmpRoot: string

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dsg-test-'))
  // Pre-open the Brain so dsgGate's metadata_audit write has a destination
  // when openBrain is called from inside the gate. Use HOMEDIR override.
  process.env.BRAIN_PROFILES_ROOT = path.join(tmpRoot, ".hermes", "profiles")
  // Open against the real HOMEDIR path the metadata-substrate will compute.
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

describe('dsg-gate', () => {
  it('approves a well-formed create with source_refs', () => {
    const input: DsgInput = {
      profile: 'fixture',
      table: 'events',
      action: 'create',
      payload: {
        id: 'e1',
        tenant: 'fixture',
        source_refs: [{ kind: 'wiki', value: 'knowledge/published/foo.md' }],
      },
      actor: 'token:test-runtime',
      token_label: 'test-runtime',
      token_allowed_profiles: ['fixture'],
      token_allowed_tools: ['brain_write'],
    }
    const out = dsgGate(input)
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.gate_event_id).toBeTruthy()
    }
  })

  it('rejects a create on a source-ref-required table when refs missing', () => {
    const out = dsgGate({
      profile: 'fixture',
      table: 'outputs',
      action: 'create',
      payload: { id: 'o1', tenant: 'fixture' },
      actor: 'token:runtime',
      token_label: 'runtime',
      token_allowed_profiles: ['fixture'],
      token_allowed_tools: ['brain_write'],
    })
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.rule).toBe('missing-source-reference')
      expect(out.advice.next_action).toMatch(/source_reference/i)
    }
  })

  it('rejects writes against an append-only table with update', () => {
    const out = dsgGate({
      profile: 'fixture',
      table: 'metadata_audit',
      action: 'update',
      payload: { id: 1, tenant: 'fixture' },
      actor: 'token:runtime',
      token_label: 'runtime',
      token_allowed_profiles: ['fixture'],
      token_allowed_tools: ['brain_write'],
    })
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.rule).toBe('append-only-violation')
    }
  })

  it('rejects tenant mismatch', () => {
    const out = dsgGate({
      profile: 'fixture',
      table: 'observations',
      action: 'create',
      payload: {
        id: 'obs1',
        tenant: 'someone-else',
        observation: 'leak attempt',
        source_refs: [{ kind: 'test', value: 'leak' }],
      },
      actor: 'token:runtime',
      token_label: 'runtime',
      token_allowed_profiles: ['fixture'],
      token_allowed_tools: ['brain_write'],
    })
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.rule).toBe('tenant-mismatch')
    }
  })

  it('rejects unknown actor form', () => {
    const out = dsgGate({
      profile: 'fixture',
      table: 'events',
      action: 'create',
      payload: {
        id: 'e2',
        tenant: 'fixture',
        source_refs: [{ kind: 'wiki', value: 'foo' }],
      },
      actor: 'just-some-string',
      token_label: 'runtime',
      token_allowed_profiles: ['fixture'],
      token_allowed_tools: ['brain_write'],
    })
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.rule).toBe('unknown-actor')
    }
  })

  it('denies cross-profile read without wildcard scope', () => {
    const out = dsgReadGate({
      profile: 'fixture',
      cross_profile: true,
      actor: 'token:runtime',
      token_allowed_profiles: ['fixture'],
      token_allowed_tools: ['brain_query'],
    })
    expect(out.ok).toBe(false)
    if (!out.ok) {
      expect(out.rule).toBe('cross-profile-write-denied')
      expect(out.advice.next_action).toMatch(/admin/i)
    }
  })

  it('allows cross-profile read with wildcard scope', () => {
    const out = dsgReadGate({
      profile: 'fixture',
      cross_profile: true,
      actor: 'token:rollup',
      token_allowed_profiles: ['*'],
      token_allowed_tools: ['brain_query'],
    })
    expect(out.ok).toBe(true)
  })

  it('every gate decision writes to metadata_audit', () => {
    dsgGate({
      profile: 'fixture',
      table: 'events',
      action: 'create',
      payload: {
        id: 'aud-test',
        tenant: 'fixture',
        source_refs: [{ kind: 'wiki', value: 'foo' }],
      },
      actor: 'token:runtime',
      token_label: 'runtime',
      token_allowed_profiles: ['fixture'],
      token_allowed_tools: ['brain_write'],
    })
    const profileRoot = path.join(tmpRoot, '.hermes', 'profiles', 'fixture')
    const handle = openBrain('fixture', { profileRoot })
    try {
      if (handle.inMemory) return
      const rows = handle.all<{ action: string; outcome: string; target_id: string }>(
        `SELECT action, outcome, target_id FROM metadata_audit WHERE target_id = ?`,
        'aud-test',
      )
      expect(rows.length).toBeGreaterThan(0)
      expect(rows[0].action).toBe('gate_decision')
      expect(rows[0].outcome).toBe('ok')
    } finally {
      handle.close()
    }
  })
})
