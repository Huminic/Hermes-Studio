import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openBrain } from '@/server/brain-store'
import {
  scanSelfImprovement,
  listSelfImprovementEvents,
} from '@/server/hermes-self-improvement-watcher'

let tmpRoot: string

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'self-imp-test-'))
  process.env.BRAIN_PROFILES_ROOT = path.join(tmpRoot, ".hermes", "profiles")
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

describe('hermes self-improvement watcher (SRS A.8)', () => {
  it('detects file creation, opens a hunch, records the event', () => {
    const profileRoot = path.join(tmpRoot, '.hermes', 'profiles', 'fixture')
    const target = path.join(profileRoot, 'SOUL.md')
    fs.writeFileSync(target, '# Test SOUL\nInitial content.\n')
    const report = scanSelfImprovement('fixture', {
      profileRoot,
      watchList: [
        { path: target, routed_to: 'KSG', label: 'profile SOUL' },
      ],
    })
    expect(report.changes.length).toBe(1)
    expect(report.changes[0].change_type).toBe('created')
    expect(report.changes[0].hunch_id).toBeTruthy()
    const events = listSelfImprovementEvents('fixture')
    expect(events.length).toBe(1)
  })

  it('is idempotent: no changes => no new events', () => {
    const profileRoot = path.join(tmpRoot, '.hermes', 'profiles', 'fixture')
    const target = path.join(profileRoot, 'SOUL.md')
    fs.writeFileSync(target, '# stable\n')
    scanSelfImprovement('fixture', {
      profileRoot,
      watchList: [{ path: target, routed_to: 'KSG' }],
    })
    const report2 = scanSelfImprovement('fixture', {
      profileRoot,
      watchList: [{ path: target, routed_to: 'KSG' }],
    })
    expect(report2.changes.length).toBe(0)
    const events = listSelfImprovementEvents('fixture')
    expect(events.length).toBe(1)
  })

  it('detects modification and opens a new hunch', () => {
    const profileRoot = path.join(tmpRoot, '.hermes', 'profiles', 'fixture')
    const target = path.join(profileRoot, 'config.yaml')
    fs.writeFileSync(target, 'version: 1\n')
    scanSelfImprovement('fixture', {
      profileRoot,
      watchList: [{ path: target, routed_to: 'DSG' }],
    })
    fs.writeFileSync(target, 'version: 2\n')
    const report = scanSelfImprovement('fixture', {
      profileRoot,
      watchList: [{ path: target, routed_to: 'DSG' }],
    })
    expect(report.changes.length).toBe(1)
    expect(report.changes[0].change_type).toBe('modified')
  })

  it('routes to the correct guardian based on file type', () => {
    const profileRoot = path.join(tmpRoot, '.hermes', 'profiles', 'fixture')
    const wikiFile = path.join(profileRoot, 'SOUL.md')
    const brainFile = path.join(profileRoot, 'config.yaml')
    fs.writeFileSync(wikiFile, 'wiki\n')
    fs.writeFileSync(brainFile, 'brain\n')
    const report = scanSelfImprovement('fixture', {
      profileRoot,
      watchList: [
        { path: wikiFile, routed_to: 'KSG' },
        { path: brainFile, routed_to: 'DSG' },
      ],
    })
    expect(report.changes.length).toBe(2)
    const handle = openBrain('fixture', { profileRoot })
    try {
      const wikiHunches = handle.all<{ originating_guardian: string }>(
        `SELECT originating_guardian FROM hunches WHERE subject_id = ?`,
        wikiFile,
      )
      const brainHunches = handle.all<{ originating_guardian: string }>(
        `SELECT originating_guardian FROM hunches WHERE subject_id = ?`,
        brainFile,
      )
      expect(wikiHunches[0]?.originating_guardian).toBe('KSG')
      expect(brainHunches[0]?.originating_guardian).toBe('DSG')
    } finally {
      handle.close()
    }
  })
})
