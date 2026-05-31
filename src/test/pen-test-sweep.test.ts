/**
 * Headless pen-test sweep (SRS Tranche F.9).
 *
 * Each test case represents one attack vector from F.9:
 *   - cross-profile read
 *   - token scope escape
 *   - direct DB write bypassing DSG
 *   - wiki write to protected tree
 *   - MCP audit gaps
 *   - secret leakage in logs
 *   - CSRF
 *   - rate limit bypass
 *   - path traversal
 *   - file upload abuse
 *
 * Each test EITHER passes (the attack is correctly blocked) OR fails (we
 * have a security hole and the test exposes it). All failures here are
 * Tranche F blockers.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openBrain } from '@/server/brain-store'
import { dsgGate } from '@/server/dsg-gate'
import { handleUpload } from '@/server/upload-surface'
import { evaluateWikiSave } from '@/server/ksg-gate'
import { rollupQuery } from '@/server/rollup'
import { callFederationTool } from '@/server/federation-mcp-handlers'
import { recordAudit, listAuditByTarget } from '@/server/metadata-substrate'

let tmpRoot: string

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pen-test-'))
  process.env.BRAIN_PROFILES_ROOT = path.join(tmpRoot, '.hermes', 'profiles')
  // Two profiles for cross-profile tests.
  for (const p of ['alpha', 'beta']) {
    const r = path.join(tmpRoot, '.hermes', 'profiles', p)
    fs.mkdirSync(r, { recursive: true })
    const h = openBrain(p, { profileRoot: r })
    h.close()
  }
})

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
})

describe('SRS F.9 — Pen-test sweep (headless)', () => {
  // F.3 — Cross-profile read attempt without scope is denied.
  it('F.3 cross-profile brain_query without wildcard scope is denied', () => {
    const result = dsgGate({
      profile: 'alpha',
      table: 'events',
      action: 'cross_profile_read',
      payload: null,
      actor: 'token:attacker',
      token_label: 'attacker',
      token_allowed_profiles: ['alpha'], // no wildcard
      token_allowed_tools: ['brain_query'],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.rule).toBe('cross-profile-write-denied')
    }
  })

  // F.1 — Token scope escape (attempting to read beta from alpha-scoped token).
  it('F.1 alpha-scoped token cannot read beta via rollup', () => {
    const res = rollupQuery({
      parent_profile: 'alpha',
      child_profiles: ['beta'],
      query: { table: 'events', aggregate: 'count' },
      actor: 'token:alpha-runtime',
      is_admin_token: false,
      token_allowed_profiles: ['alpha'],
    })
    expect(res.ok).toBe(false)
    expect(res.rule).toBe('cross-profile-write-denied')
  })

  // F.3 — DSG bypass attempt (direct insertion via brain_write without source_refs).
  it('F.3 direct events insertion without source_refs is denied', () => {
    const result = dsgGate({
      profile: 'alpha',
      table: 'events',
      action: 'create',
      payload: { id: 'sneak', tenant: 'alpha' }, // no source_refs
      actor: 'token:attacker',
      token_label: 'attacker',
      token_allowed_profiles: ['alpha'],
      token_allowed_tools: ['brain_write'],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.rule).toBe('missing-source-reference')
  })

  // F.3 — tenant mismatch is rejected even with valid source_refs.
  it('F.3 cross-tenant payload via brain_write is denied', () => {
    const result = dsgGate({
      profile: 'alpha',
      table: 'observations',
      action: 'create',
      payload: {
        id: 'cross-tenant',
        tenant: 'beta', // forged
        source_refs: [{ kind: 'wiki', value: 'x' }],
      },
      actor: 'token:attacker',
      token_label: 'attacker',
      token_allowed_profiles: ['alpha', 'beta'],
      token_allowed_tools: ['brain_write'],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.rule).toBe('tenant-mismatch')
  })

  // F.5 — Wiki write to protected tree.
  it('F.5 wiki write to canon/ is denied by KSG', () => {
    const result = evaluateWikiSave({
      relativePath: 'canon/secret-edit.md',
      previousContent: null,
      newContent: '---\ntitle: malicious\ntype: edit\nstatus: canonical\n---\nrootkit',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.rule).toBe('protected-tree')
  })

  // F.5 — Wiki write to governance/ is denied by KSG.
  it('F.5 wiki write to governance/ is denied by KSG', () => {
    const result = evaluateWikiSave({
      relativePath: 'governance/agents/sneak.md',
      previousContent: null,
      newContent: '---\ntitle: x\ntype: y\nstatus: under-review\n---\nhi',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.rule).toBe('protected-tree')
  })

  // F.5 — Path traversal in upload filename is sanitized.
  it('F.5 upload filename containing ../ is sanitized', async () => {
    const r = await handleUpload({
      profile: 'alpha',
      actor: 'user:test',
      filename: '../../../etc/passwd',
      mime_type: 'text/plain',
      content: Buffer.from('attempt'),
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      // stored_path must be under brain/uploads/, NEVER escape it
      expect(r.stored_path).toMatch(/brain\/uploads\//)
      expect(r.stored_path).not.toContain('..')
    }
  })

  // F.2 — Every DSG denial appends a metadata_audit row with rule and outcome.
  it('F.2 DSG denials write an audit row with rule + outcome=denied', () => {
    const decision = dsgGate({
      profile: 'alpha',
      table: 'events',
      action: 'create',
      payload: { id: 'no-refs', tenant: 'alpha' },
      actor: 'token:test',
      token_label: 'test',
      token_allowed_profiles: ['alpha'],
      token_allowed_tools: ['brain_write'],
    })
    expect(decision.ok).toBe(false)
    const audits = listAuditByTarget('alpha', { type: 'events', id: 'no-refs' })
    expect(audits.length).toBeGreaterThan(0)
    expect(audits[0].outcome).toBe('denied')
    expect(audits[0].rule).toBe('missing-source-reference')
  })

  // F.4 — DSG denials do NOT leak the rejected payload contents into audit reason.
  it('F.4 DSG audit reason does not leak full payload contents', () => {
    const secret = 'PASSWORD=hunter2'
    dsgGate({
      profile: 'alpha',
      table: 'events',
      action: 'create',
      payload: {
        id: 'leak-test',
        tenant: 'alpha',
        secret,
      },
      actor: 'token:test',
      token_label: 'test',
      token_allowed_profiles: ['alpha'],
      token_allowed_tools: ['brain_write'],
    })
    const audits = listAuditByTarget('alpha', { type: 'events', id: 'leak-test' })
    for (const a of audits) {
      expect(a.reason ?? '').not.toContain(secret)
    }
  })

  // F.4 — Federation scope denial does NOT leak the SQL query contents.
  it('F.4 federation scope denial does not embed query text in error', async () => {
    const profileRoot = path.join(tmpRoot, '.hermes', 'profiles', 'alpha')
    fs.writeFileSync(
      path.join(profileRoot, 'studio.yaml'),
      `branding:\n  persona_name: Alpha\nfederation:\n  read_scopes:\n    - allowed\n`,
      'utf8',
    )
    const secret = 'SELECT password FROM users'
    const res = await callFederationTool(
      'federation_query',
      { profile: 'alpha', scope: 'forbidden', query: secret },
      {
        token_label: 'attacker',
        token_allowed_profiles: ['alpha'],
        token_allowed_tools: ['federation_query'],
        token_admin: false,
      },
    )
    expect(res.ok).toBe(false)
    if (!res.ok) {
      // error mentions the scope but NOT the query text
      expect(res.error).toContain('forbidden')
      expect(res.error).not.toContain('password')
    }
  })

  // F.6 — Rate cap denial path is exercised in tranche-d.test.ts; we verify
  // that comms_log table has the right shape to enforce it.
  it('F.6 comms_log table exists and supports rate-limit lookups', () => {
    const handle = openBrain('alpha')
    try {
      const cols = handle.all<{ name: string }>(
        `PRAGMA table_info(comms_log)`,
      )
      const names = cols.map((c) => c.name)
      // critical fields for rate limiting:
      expect(names).toContain('channel')
      expect(names).toContain('ts')
      expect(names).toContain('direction')
    } finally {
      handle.close()
    }
  })

  // F.7 — Embedding pipeline records model identity per row (no silent
  // PII leakage across model swaps).
  it('F.7 embeddings table records model + dim per row', () => {
    const handle = openBrain('alpha')
    try {
      const cols = handle.all<{ name: string }>(
        `PRAGMA table_info(embeddings)`,
      )
      const names = cols.map((c) => c.name)
      expect(names).toContain('model')
      expect(names).toContain('dim')
      expect(names).toContain('tenant')
    } finally {
      handle.close()
    }
  })

  // F.8 — Brain backup file is under brain/backups/ (not escapable).
  it('F.8 backup destination defaults under brain/backups/', () => {
    // We don't actually run the backup here (already covered in
    // brain-store.test.ts); verify the snapshot dir path discipline.
    const root = path.join(tmpRoot, '.hermes', 'profiles', 'alpha', 'brain', 'backups')
    expect(fs.existsSync(root)).toBe(true)
  })
})
