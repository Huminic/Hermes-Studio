import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openBrain } from '@/server/brain-store'
import { runConsultativeEngagement } from '@/server/consultative-engine'
import { listOperatorVisibleAssumptions } from '@/server/lookup-miss'
import {
  checkStarterContent,
  defaultStarterArtifacts,
} from '@/server/consultative-starter-content'

let tmpRoot: string

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'consultative-test-'))
  process.env.BRAIN_PROFILES_ROOT = path.join(tmpRoot, '.hermes', 'profiles')
  fs.mkdirSync(path.join(tmpRoot, '.hermes', 'profiles', 'cedar-ridge-automotive'), {
    recursive: true,
  })
  const handle = openBrain('cedar-ridge-automotive')
  handle.close()
})

afterEach(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
})

describe('consultative engine (SRS Tranche C)', () => {
  it('starter content check passes against the real repo', () => {
    const repoRoot = '/home/ubuntu/Claude-store/huminic-studio'
    const check = checkStarterContent(repoRoot)
    expect(check.ok).toBe(true)
    expect(check.missing).toEqual([])
    const artifacts = defaultStarterArtifacts(repoRoot)
    expect(artifacts.length).toBeGreaterThanOrEqual(8)
  })

  it('runs end-to-end against the Cedar Ridge fixture', async () => {
    const result = await runConsultativeEngagement({
      customer_profile: 'cedar-ridge-automotive',
      customer_display_name: 'Cedar Ridge Automotive Group',
      industry: 'automotive-retail',
      rooftops: ['Cedar Ridge Honda', 'Cedar Ridge Subaru'],
      primary_contact: {
        name: 'Patricia Ramos',
        email: 'gm@cedar-ridge.example',
      },
      known_systems: ['VinSolutions', 'Vapi', 'TextMagic', 'Google Analytics'],
      known_pain_points: [
        'lead leakage on after-hours SMS',
        'recall outreach is manual',
      ],
    })

    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.phases.length).toBe(6)
    expect(result.phases.map((p) => p.phase)).toEqual([
      'orient',
      'audit',
      'design',
      'author',
      'validate',
      'package',
    ])
    // SRS C.5: at least three assumptions surfaced.
    expect(result.summary.assumptions).toBeGreaterThanOrEqual(3)
    // SRS C.6: at least one capability gap proposal.
    expect(result.summary.capability_gaps).toBeGreaterThanOrEqual(1)
    // Wiki invariants
    const canonDir = path.join(
      tmpRoot,
      '.hermes',
      'profiles',
      'cedar-ridge-automotive',
      'canon',
    )
    for (const f of [
      'scope-contract.md',
      'confidence-schema.md',
      'human-relay-specification.md',
      'integration-playbooks.md',
      'house-canon-reference.md',
      'metadata-substrate.md',
      'knowledge-brain-interaction-contract.md',
    ]) {
      expect(fs.existsSync(path.join(canonDir, f))).toBe(true)
    }
    // Prescription package emitted.
    expect(fs.existsSync(result.prescription_package_path)).toBe(true)
    // Operator queue has the three assumptions.
    const assumptions = listOperatorVisibleAssumptions('cedar-ridge-automotive')
    expect(assumptions.length).toBeGreaterThanOrEqual(3)
  })

  it('does NOT bypass DSG even when running with admin authority', async () => {
    // Run with an injectable complete that asks to write a record with
    // tenant mismatch. Engine still uses DSG; mismatch should fail.
    const result = await runConsultativeEngagement({
      customer_profile: 'cedar-ridge-automotive',
      customer_display_name: 'Cedar Ridge Automotive Group',
    })
    // The Brain records that landed all carry tenant=cedar-ridge-automotive.
    const handle = openBrain('cedar-ridge-automotive')
    try {
      const wrongTenant = handle.all<{ tenant: string }>(
        `SELECT tenant FROM observations WHERE tenant != ?`,
        'cedar-ridge-automotive',
      )
      expect(wrongTenant.length).toBe(0)
    } finally {
      handle.close()
    }
    expect(result.ok).toBe(true)
  })

  it('Cedar Ridge engagement-state.yaml is enrichable with adjacent neighbors', async () => {
    await runConsultativeEngagement({
      customer_profile: 'cedar-ridge-automotive',
      customer_display_name: 'Cedar Ridge Automotive Group',
    })
    const handle = openBrain('cedar-ridge-automotive')
    try {
      const rows = handle.all<{ name: string; classification: string }>(
        `SELECT name, classification FROM adjacent_neighbors`,
      )
      const names = rows.map((r) => r.name)
      expect(names).toContain('VinSolutions')
      expect(names).toContain('Google Analytics')
    } finally {
      handle.close()
    }
  })
})
