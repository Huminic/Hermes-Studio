import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openBrain, type BrainHandle } from '../server/brain-store'
import {
  recordSnapshot,
  getStatusesOn,
  diffDay,
  findStaleStatus,
  snapshotDate,
} from '../server/lead-status-snapshot'

let root: string
let h: BrainHandle

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'snap-'))
  h = openBrain('snap-test', { profileRoot: path.join(root, 'snap-test') })
})

afterEach(() => {
  h.close()
  fs.rmSync(root, { recursive: true, force: true })
})

describe('snapshotDate', () => {
  it('formats YYYY-MM-DD in the store timezone', () => {
    // 2026-08-15T02:00:00Z is still 2026-08-14 in America/Chicago (UTC-5).
    expect(snapshotDate(Date.parse('2026-08-15T02:00:00Z'), 'America/Chicago')).toBe(
      '2026-08-14',
    )
  })
})

describe('recordSnapshot + getStatusesOn', () => {
  it('records one row per lead and reads them back', () => {
    const n = recordSnapshot(
      h,
      '2026-09-22',
      [
        { leadId: 'A', leadStatus: 'ACTIVE_NEW_LEAD', leadStatusType: 'ACTIVE' },
        { leadId: 'B', leadStatus: 'WORKING', leadStatusType: 'ACTIVE' },
      ],
      1000,
    )
    expect(n).toBe(2)
    const m = getStatusesOn(h, '2026-09-22')
    expect(m.get('A')).toEqual({ status: 'ACTIVE_NEW_LEAD', statusType: 'ACTIVE' })
    expect(m.size).toBe(2)
  })

  it('is idempotent — re-recording the same day updates in place', () => {
    recordSnapshot(h, '2026-09-22', [{ leadId: 'A', leadStatusType: 'ACTIVE' }], 1000)
    recordSnapshot(h, '2026-09-22', [{ leadId: 'A', leadStatusType: 'SOLD' }], 2000)
    const m = getStatusesOn(h, '2026-09-22')
    expect(m.size).toBe(1)
    expect(m.get('A')!.statusType).toBe('SOLD')
  })
})

describe('diffDay (day-over-day transitions)', () => {
  beforeEach(() => {
    recordSnapshot(
      h,
      '2026-09-21',
      [
        { leadId: 'A', leadStatusType: 'ACTIVE' }, // will sell today
        { leadId: 'B', leadStatusType: 'ACTIVE' }, // will be lost today
        { leadId: 'C', leadStatusType: 'SOLD' }, // already sold yesterday
      ],
      1000,
    )
    recordSnapshot(
      h,
      '2026-09-22',
      [
        { leadId: 'A', leadStatusType: 'SOLD' },
        { leadId: 'B', leadStatusType: 'LOST' },
        { leadId: 'C', leadStatusType: 'SOLD' },
        { leadId: 'D', leadStatusType: 'ACTIVE' }, // new today
      ],
      2000,
    )
  })

  it('counts only NEW sold/lost transitions and new leads', () => {
    const d = diffDay(h, '2026-09-22', '2026-09-21')
    expect(d.soldToday).toEqual(['A']) // C was already sold → excluded
    expect(d.lostToday).toEqual(['B'])
    expect(d.newToday).toEqual(['D'])
  })
})

describe('findStaleStatus (same status across all snapshot dates)', () => {
  it('flags a lead unchanged across the span, excludes changed or gapped ones', () => {
    const dates = ['2026-09-15', '2026-09-18', '2026-09-22']
    // STUCK: WORKING on all three ; CHANGED: WORKING→SOLD ; GAP: missing middle
    recordSnapshot(h, '2026-09-15', [
      { leadId: 'STUCK', leadStatusType: 'WORKING' },
      { leadId: 'CHANGED', leadStatusType: 'WORKING' },
      { leadId: 'GAP', leadStatusType: 'WORKING' },
    ], 1)
    recordSnapshot(h, '2026-09-18', [
      { leadId: 'STUCK', leadStatusType: 'WORKING' },
      { leadId: 'CHANGED', leadStatusType: 'WORKING' },
    ], 2)
    recordSnapshot(h, '2026-09-22', [
      { leadId: 'STUCK', leadStatusType: 'WORKING' },
      { leadId: 'CHANGED', leadStatusType: 'SOLD' },
      { leadId: 'GAP', leadStatusType: 'WORKING' },
    ], 3)
    expect(findStaleStatus(h, dates)).toEqual(['STUCK'])
  })
})
