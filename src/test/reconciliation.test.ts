import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openBrain } from '@/server/brain-store'
import {
  surfaceContradiction,
  resolveReconciliation,
  listOpenReconciliations,
  seedInteractionContract,
  KNOWLEDGE_BRAIN_INTERACTION_CONTRACT,
} from '@/server/reconciliation'

let tmpRoot: string

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'reconciliation-test-'))
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

describe('reconciliation (SRS B.3)', () => {
  it('surfaceContradiction creates a reconciliation_item AND a paired hunch', () => {
    const r = surfaceContradiction({
      profile: 'fixture',
      conflict_type: 'service_hours_mismatch',
      wiki_ref: 'canon/service-hours.md#L4',
      brain_ref: 'observations/agg-30d',
      details: { wiki: '8-5', operational: '7:30-6' },
      proposed_resolution: 'Confirm with GM and update canon.',
    })
    expect(r.ok).toBe(true)
    expect(r.reconciliation_id).toBeTruthy()
    expect(r.hunch_id).toBeTruthy()
    const items = listOpenReconciliations('fixture')
    expect(items.length).toBe(1)
    expect(items[0].conflict_type).toBe('service_hours_mismatch')
  })

  it('resolveReconciliation moves status to wiki_corrected', () => {
    const r = surfaceContradiction({
      profile: 'fixture',
      conflict_type: 'service_hours_mismatch',
      wiki_ref: 'canon/service-hours.md#L4',
      brain_ref: 'observations/agg-30d',
      details: { x: 1 },
    })
    expect(r.ok).toBe(true)
    const res = resolveReconciliation({
      profile: 'fixture',
      reconciliation_id: r.reconciliation_id!,
      resolution_notes: 'Confirmed correct hours with ops; wiki updated via promote.',
      resolved_by: 'user:duane',
      resolution: 'wiki_corrected',
    })
    expect(res.ok).toBe(true)
    const open = listOpenReconciliations('fixture')
    expect(open.length).toBe(0)
  })

  it('seedInteractionContract writes the canon page once and is idempotent', () => {
    const profileRoot = path.join(tmpRoot, '.hermes', 'profiles', 'fixture')
    const r1 = seedInteractionContract('fixture', { profileRoot })
    expect(r1.ok).toBe(true)
    expect(r1.written).toBe(true)
    expect(fs.existsSync(r1.path)).toBe(true)
    const content = fs.readFileSync(r1.path, 'utf8')
    expect(content).toBe(KNOWLEDGE_BRAIN_INTERACTION_CONTRACT)
    const r2 = seedInteractionContract('fixture', { profileRoot })
    expect(r2.ok).toBe(true)
    expect(r2.written).toBe(false) // already there
  })
})
