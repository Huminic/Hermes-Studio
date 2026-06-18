import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAutomation,
  updateAutomation,
  listAutomations,
  getThread,
  listThreads,
  appendMessage,
  getOrCreateThread,
  listDueAutomationRuns,
  _resetForTests,
} from '@/server/messaging-hub-store'
import {
  processNewLead,
  tickAutomations,
  seedDefaultAutomations,
  DEFAULT_AUTOMATIONS,
} from '@/server/automations'

const PROFILE = 'test-automations'
let tmpHome: string

// A dispatch stub that always "sends" (bypasses the real gated adapter, which
// would hit live channels). The engine's persistence + state transitions are
// what we assert here; the gate itself is covered by comms-gate tests.
function sentDispatch() {
  return vi.fn(async () => ({ status: 'sent' as const, via: 'sms-test' }))
}

beforeEach(async () => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'automations-test-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  const dir = path.join(tmpHome, '.hermes', 'profiles', PROFILE)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'studio.yaml'),
    'branding:\n  persona_name: Test Store\n',
  )
  _resetForTests()
  const bus = await import('@/server/messaging-hub-bus')
  bus._resetMessagingBus()
})
afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

const LEAD = {
  contact_handle: '+14155550100',
  handles: { sms: '+14155550100', voice: '+14155550100' },
  first_name: 'Jordan',
  vehicle: '2026 Civic',
}

describe('seedDefaultAutomations', () => {
  it('seeds the two required Serra drafts, idempotently', () => {
    const first = seedDefaultAutomations(PROFILE)
    expect(first).toHaveLength(DEFAULT_AUTOMATIONS.length)
    const again = seedDefaultAutomations(PROFILE)
    expect(again).toHaveLength(0) // no duplicates
    const all = listAutomations(PROFILE)
    expect(all.map((a) => a.name).sort()).toEqual(
      ['24-hour follow-up for all leads', 'Instant SMS for new leads'].sort(),
    )
    // Seeded as DRAFT — never auto-armed.
    expect(all.every((a) => a.status === 'draft')).toBe(true)
  })
})

describe('processNewLead', () => {
  it('does NOT fire draft or paused automations', async () => {
    createAutomation({
      profile: PROFILE,
      name: 'draft new-lead',
      trigger: 'new_lead',
      channel: 'sms',
      agent_id: 'caroline',
      status: 'draft',
    })
    createAutomation({
      profile: PROFILE,
      name: 'paused new-lead',
      trigger: 'new_lead',
      channel: 'sms',
      agent_id: 'caroline',
      status: 'paused',
    })
    const dispatch = sentDispatch()
    const outcomes = await processNewLead({
      profile: PROFILE,
      lead: LEAD,
      deps: { dispatch },
    })
    expect(outcomes).toHaveLength(0)
    expect(dispatch).not.toHaveBeenCalled()
    expect(listThreads({ profile: PROFILE })).toHaveLength(0)
  })

  it('fires an ACTIVE new_lead automation immediately and lands in Teambox', async () => {
    createAutomation({
      profile: PROFILE,
      name: 'active new-lead',
      trigger: 'new_lead',
      channel: 'sms',
      agent_id: 'caroline',
      status: 'active',
    })
    const dispatch = sentDispatch()
    const outcomes = await processNewLead({
      profile: PROFILE,
      lead: LEAD,
      deps: { dispatch },
    })
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(outcomes[0].action).toBe('sent')
    const threads = listThreads({ profile: PROFILE })
    expect(threads).toHaveLength(1)
    const full = getThread(PROFILE, threads[0].id)
    expect(full?.messages.some((m) => m.author === 'automation')).toBe(true)
    // last_triggered_at stamped.
    expect(listAutomations(PROFILE)[0].last_triggered_at).not.toBeNull()
    // E2: the fire is committed to the Brain/InfoStore (events family), not just
    // the Teambox thread — verified, not assumed.
    const { openBrain } = await import('@/server/brain-store')
    const brain = openBrain(PROFILE)
    const events = brain.all<{ type: string }>(
      `SELECT type FROM events WHERE type='marketing.automation.fired'`,
    )
    brain.close()
    expect(events.length).toBeGreaterThan(0)
  })

  it('enrolls an ACTIVE lead_followup automation (no immediate send)', async () => {
    createAutomation({
      profile: PROFILE,
      name: 'active follow-up',
      trigger: 'lead_followup',
      channel: 'sms',
      agent_id: 'caroline',
      wait_hours: 24,
      status: 'active',
    })
    const dispatch = sentDispatch()
    const outcomes = await processNewLead({
      profile: PROFILE,
      lead: LEAD,
      now: 1_000_000,
      deps: { dispatch },
    })
    expect(dispatch).not.toHaveBeenCalled()
    expect(outcomes[0].action).toBe('enrolled')
    // A pending run is scheduled 24h out (not yet due).
    expect(listDueAutomationRuns(PROFILE, 1_000_000)).toHaveLength(0)
    expect(
      listDueAutomationRuns(PROFILE, 1_000_000 + 24 * 3600_000),
    ).toHaveLength(1)
  })

  it('dedups: a second detection of the same lead does not re-fire', async () => {
    createAutomation({
      profile: PROFILE,
      name: 'active new-lead',
      trigger: 'new_lead',
      channel: 'sms',
      agent_id: 'caroline',
      status: 'active',
    })
    const dispatch = sentDispatch()
    await processNewLead({ profile: PROFILE, lead: LEAD, deps: { dispatch } })
    await processNewLead({ profile: PROFILE, lead: LEAD, deps: { dispatch } })
    expect(dispatch).toHaveBeenCalledTimes(1)
  })
})

describe('tickAutomations (follow-up cadence)', () => {
  it('sends a due follow-up when there is no reply', async () => {
    const a = createAutomation({
      profile: PROFILE,
      name: 'follow-up',
      trigger: 'lead_followup',
      channel: 'sms',
      agent_id: 'caroline',
      wait_hours: 24,
      status: 'active',
    })
    const dispatch = sentDispatch()
    const t0 = 1_000_000
    await processNewLead({ profile: PROFILE, lead: LEAD, now: t0, deps: { dispatch } })

    const due = t0 + 24 * 3600_000 + 1
    const res = await tickAutomations({ profile: PROFILE, now: due, deps: { dispatch } })
    expect(res.sent).toBe(1)
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(listDueAutomationRuns(PROFILE, due + 1)).toHaveLength(0)
    void a
  })

  it('stops on reply — a due follow-up does NOT send when the lead replied', async () => {
    createAutomation({
      profile: PROFILE,
      name: 'follow-up',
      trigger: 'lead_followup',
      channel: 'sms',
      agent_id: 'caroline',
      wait_hours: 24,
      status: 'active',
    })
    const dispatch = sentDispatch()
    const t0 = 1_000_000
    await processNewLead({ profile: PROFILE, lead: LEAD, now: t0, deps: { dispatch } })

    // The lead replies (inbound) after enrollment.
    const thread = getOrCreateThread({
      profile: PROFILE,
      domain: 'sales',
      channel: 'sms',
      contact_handle: LEAD.contact_handle,
      subject: 'reply',
    })
    appendMessage({
      thread_id: thread.id,
      direction: 'inbound',
      role: 'user',
      channel: 'sms',
      content: 'Yes please call me',
      author: LEAD.contact_handle,
    })

    const due = t0 + 24 * 3600_000 + 1
    const res = await tickAutomations({ profile: PROFILE, now: due, deps: { dispatch } })
    expect(res.stopped).toBe(1)
    expect(res.sent).toBe(0)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('does NOT send a due follow-up if the automation was paused after enrollment', async () => {
    const a = createAutomation({
      profile: PROFILE,
      name: 'follow-up',
      trigger: 'lead_followup',
      channel: 'sms',
      agent_id: 'caroline',
      wait_hours: 24,
      status: 'active',
    })
    const dispatch = sentDispatch()
    const t0 = 1_000_000
    await processNewLead({ profile: PROFILE, lead: LEAD, now: t0, deps: { dispatch } })
    updateAutomation(PROFILE, a.id, { status: 'paused' })

    const due = t0 + 24 * 3600_000 + 1
    const res = await tickAutomations({ profile: PROFILE, now: due, deps: { dispatch } })
    expect(res.sent).toBe(0)
    expect(dispatch).not.toHaveBeenCalled()
  })
})
