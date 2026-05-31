import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openBrain } from '@/server/brain-store'
import { rollupQuery, childHasGrantedRollup } from '@/server/rollup'
import { insertEvent } from '@/server/brain-record-families'

let tmpRoot: string

function seedProfile(profile: string, withRollupGrant?: string) {
  const profileRoot = path.join(tmpRoot, '.hermes', 'profiles', profile)
  fs.mkdirSync(profileRoot, { recursive: true })
  // Open brain (apply migrations).
  const handle = openBrain(profile, { profileRoot })
  handle.close()
  // Seed studio.yaml with optional rollup grant.
  fs.writeFileSync(
    path.join(profileRoot, 'studio.yaml'),
    `
branding:
  persona_name: ${profile}
federation:
  read_scopes:
${withRollupGrant ? `    - rollup:${withRollupGrant}` : '    - vinsolutions'}
`,
    'utf8',
  )
}

function seedEvents(profile: string, n: number) {
  for (let i = 0; i < n; i++) {
    insertEvent({
      profile,
      actor: 'token:test',
      type: 'rollup_seed',
      source: 'test',
      payload: { i },
      source_refs: [{ kind: 'engagement', value: `seed-${i}` }],
    })
  }
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rollup-test-'))
  process.env.BRAIN_PROFILES_ROOT = path.join(tmpRoot, '.hermes', 'profiles')
  seedProfile('huminic') // parent
  seedProfile('child-a', 'huminic') // granted
  seedProfile('child-b', 'huminic') // granted
  seedProfile('child-c') // NOT granted
  seedEvents('child-a', 3)
  seedEvents('child-b', 5)
  seedEvents('child-c', 7)
})

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
})

describe('rollup (SRS Tranche E)', () => {
  it('childHasGrantedRollup reflects studio.yaml scope', () => {
    expect(childHasGrantedRollup('child-a', 'huminic')).toBe(true)
    expect(childHasGrantedRollup('child-b', 'huminic')).toBe(true)
    expect(childHasGrantedRollup('child-c', 'huminic')).toBe(false)
  })

  it('aggregates count across granted children with wildcard token', () => {
    const res = rollupQuery({
      parent_profile: 'huminic',
      child_profiles: ['child-a', 'child-b'],
      query: { table: 'events', aggregate: 'count' },
      actor: 'token:rollup',
      is_admin_token: false,
      token_allowed_profiles: ['*'],
    })
    expect(res.ok).toBe(true)
    expect(res.children_included).toEqual(['child-a', 'child-b'])
    expect(res.children_denied).toEqual([])
    expect(res.total).toBe(8) // 3 + 5
  })

  it('denies child without rollup grant even with wildcard token-allowed-profiles', () => {
    const res = rollupQuery({
      parent_profile: 'huminic',
      child_profiles: ['child-a', 'child-c'],
      query: { table: 'events', aggregate: 'count' },
      actor: 'token:rollup',
      is_admin_token: false,
      token_allowed_profiles: ['child-a', 'child-c'],
    })
    expect(res.ok).toBe(true)
    expect(res.children_included).toEqual(['child-a'])
    expect(res.children_denied.length).toBe(1)
    expect(res.children_denied[0].profile).toBe('child-c')
    expect(res.children_denied[0].reason).toMatch(/rollup:huminic/)
  })

  it('admin token (with wildcard) bypasses the per-child grant requirement', () => {
    const res = rollupQuery({
      parent_profile: 'huminic',
      child_profiles: ['child-a', 'child-b', 'child-c'],
      query: { table: 'events', aggregate: 'count' },
      actor: 'token:admin',
      is_admin_token: true,
      token_allowed_profiles: ['*'],
    })
    expect(res.ok).toBe(true)
    expect(res.children_included.length).toBe(3)
    expect(res.total).toBe(15)
  })

  it('non-wildcard token without child scope is denied', () => {
    const res = rollupQuery({
      parent_profile: 'huminic',
      child_profiles: ['child-a', 'child-b'],
      query: { table: 'events', aggregate: 'count' },
      actor: 'token:scoped',
      is_admin_token: false,
      token_allowed_profiles: ['huminic'], // doesn't include child-a/b
    })
    expect(res.ok).toBe(false)
    expect(res.rule).toBe('cross-profile-write-denied')
  })

  it('rejects rollup against table not in allowlist', () => {
    const res = rollupQuery({
      parent_profile: 'huminic',
      child_profiles: ['child-a'],
      query: { table: 'metadata_audit', aggregate: 'count' },
      actor: 'token:rollup',
      is_admin_token: false,
      token_allowed_profiles: ['*'],
    })
    expect(res.ok).toBe(false)
    expect(res.rule).toBe('invalid-table')
  })

  it('writes a metadata_audit row to the PARENT profile after each rollup', () => {
    rollupQuery({
      parent_profile: 'huminic',
      child_profiles: ['child-a', 'child-b'],
      query: { table: 'events', aggregate: 'count' },
      actor: 'token:rollup',
      is_admin_token: false,
      token_allowed_profiles: ['*'],
    })
    const handle = openBrain('huminic')
    try {
      const audits = handle.all<{ target_type: string; reason: string }>(
        `SELECT target_type, reason FROM metadata_audit WHERE target_type = 'rollup_query'`,
      )
      expect(audits.length).toBeGreaterThan(0)
      expect(audits[0].reason).toMatch(/child-a/)
      expect(audits[0].reason).toMatch(/child-b/)
    } finally {
      handle.close()
    }
  })
})
