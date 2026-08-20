import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  listFindings,
  resolveStale,
  setFindingStatus,
  upsertFinding,
} from '@/server/watchdog/watchdog-store'
import type { WatchdogFinding } from '@/server/watchdog/watchdog-types'

let tmp: string
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'watchdog-store-'))
  process.env.BRAIN_PROFILES_ROOT = path.join(tmp, '.hermes', 'profiles')
})
afterEach(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
})

const f = (over: Partial<WatchdogFinding> = {}): WatchdogFinding => ({
  key: 'rule.a:thread1',
  profile: 'serra-honda',
  rule_id: 'rule.a',
  category: 'Leads',
  priority: 'medium',
  issue: 'Customer waiting',
  name: '…6500',
  details: 'The customer has waited over 4 business hours for a reply.',
  ...over,
})

describe('watchdog finding store', () => {
  it('inserts new, dedups by key, and reports escalation', () => {
    expect(upsertFinding(f(), 1000)).toEqual({ isNew: true, escalated: false })
    // same key again, same priority → not new, not escalated (deduped)
    expect(upsertFinding(f(), 2000)).toEqual({ isNew: false, escalated: false })
    // same key, higher priority → escalated
    expect(upsertFinding(f({ priority: 'high' }), 3000)).toEqual({ isNew: false, escalated: true })
    const open = listFindings('serra-honda', { status: 'open' })
    expect(open).toHaveLength(1)
    expect(open[0].priority).toBe('high')
    expect(open[0].details).toContain('4 business hours')
  })

  it('dismiss / ignore suppress from the open list and stay muted on re-detect', () => {
    upsertFinding(f(), 1000)
    expect(setFindingStatus('serra-honda', f().key, 'ignored')).toBe(true)
    expect(listFindings('serra-honda', { status: 'open' })).toHaveLength(0)
    expect(listFindings('serra-honda', { status: 'ignored' })).toHaveLength(1)
    // re-detecting an ignored finding must NOT reopen it
    expect(upsertFinding(f({ priority: 'high' }), 2000)).toEqual({ isNew: false, escalated: false })
    expect(listFindings('serra-honda', { status: 'open' })).toHaveLength(0)
    expect(listFindings('serra-honda', { status: 'ignored' })).toHaveLength(1)
  })

  it('resolveStale clears open findings not seen this pass, but never muted ones', () => {
    upsertFinding(f({ key: 'k1' }), 1000)
    upsertFinding(f({ key: 'k2' }), 1000)
    upsertFinding(f({ key: 'k3' }), 1000)
    setFindingStatus('serra-honda', 'k3', 'ignored')
    // pass sees only k1
    const resolved = resolveStale('serra-honda', ['k1'], 2000)
    expect(resolved).toBe(1) // only k2 (open, unseen) resolved; k3 ignored untouched
    expect(listFindings('serra-honda', { status: 'open' }).map((x) => x.key)).toEqual(['k1'])
    expect(listFindings('serra-honda', { status: 'resolved' }).map((x) => x.key)).toEqual(['k2'])
    expect(listFindings('serra-honda', { status: 'ignored' }).map((x) => x.key)).toEqual(['k3'])
  })

  it('sorts open findings high→low priority', () => {
    upsertFinding(f({ key: 'lo', priority: 'low' }), 1000)
    upsertFinding(f({ key: 'hi', priority: 'high' }), 1000)
    upsertFinding(f({ key: 'md', priority: 'medium' }), 1000)
    expect(listFindings('serra-honda', { status: 'open' }).map((x) => x.key)).toEqual(['hi', 'md', 'lo'])
  })
})
