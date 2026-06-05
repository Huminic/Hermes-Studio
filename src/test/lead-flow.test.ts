import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdapterResult } from '@/server/messaging-adapters'

let tmpHome: string
const PROFILE = 'huminic'

// In business hours (12:00 ET on 2026-01-01) so steps may send.
const T = Date.UTC(2026, 0, 1, 17, 0, 0)
const HOUR = 60 * 60_000

beforeEach(async () => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'lead-flow-test-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  const dir = path.join(tmpHome, '.hermes', 'profiles', PROFILE)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'studio.yaml'), 'branding:\n  persona_name: Huminic\n')
  const mod = await import('@/server/messaging-hub-store')
  mod._resetForTests()
  const bus = await import('@/server/messaging-hub-bus')
  bus._resetMessagingBus()
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

function fakeDispatch() {
  return vi.fn(
    async (input: { channel: string }): Promise<AdapterResult> => ({
      status: 'sent',
      via: `fake-${input.channel}`,
    }),
  )
}

const THREE_STEP = [
  { channel: 'sms', wait_hours: 0 },
  { channel: 'email', wait_hours: 4 },
  { channel: 'voice', wait_hours: 24 },
]

describe('normalizeFlowSteps', () => {
  it('rejects more than 3 steps', async () => {
    const { normalizeFlowSteps } = await import('@/server/lead-flow')
    const r = normalizeFlowSteps([
      { channel: 'sms' },
      { channel: 'email', wait_hours: 1 },
      { channel: 'voice', wait_hours: 2 },
      { channel: 'sms', wait_hours: 3 },
    ])
    expect(r.ok).toBe(false)
  })

  it('rejects an unknown channel', async () => {
    const { normalizeFlowSteps } = await import('@/server/lead-flow')
    const r = normalizeFlowSteps([{ channel: 'carrier-pigeon' }])
    expect(r.ok).toBe(false)
  })

  it('forces step 1 wait to 0 and rounds waits', async () => {
    const { normalizeFlowSteps } = await import('@/server/lead-flow')
    const r = normalizeFlowSteps([
      { channel: 'sms', wait_hours: 9 },
      { channel: 'email', wait_hours: 4.4 },
    ])
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.steps[0].wait_hours).toBe(0)
      expect(r.steps[1].wait_hours).toBe(4)
    }
  })
})

describe('enrollLead', () => {
  it('sends step 1 and creates an active enrollment due at step 2', async () => {
    const { saveLeadFlow, getActiveFlowEnrollment } = await import('@/server/messaging-hub-store')
    const { enrollLead } = await import('@/server/lead-flow')
    saveLeadFlow({ profile: PROFILE, enabled: true, steps: THREE_STEP })
    const dispatch = fakeDispatch()

    const res = await enrollLead({
      profile: PROFILE,
      contact_key: '+15555550100',
      handles: { sms: '+15555550100', voice: '+15555550100', email: 'lead@example.com' },
      first_name: 'Pat',
      dealer: 'Huminic',
      now: T,
      deps: { dispatch },
    })

    expect(res.enrolled).toBe(true)
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0][0].channel).toBe('sms')
    const e = getActiveFlowEnrollment(PROFILE, '+15555550100')
    expect(e?.step_index).toBe(0)
    expect(e?.next_due_at).toBe(T + 4 * HOUR)
  })

  it('is a no-op when no flow is enabled', async () => {
    const { saveLeadFlow } = await import('@/server/messaging-hub-store')
    const { enrollLead } = await import('@/server/lead-flow')
    saveLeadFlow({ profile: PROFILE, enabled: false, steps: THREE_STEP })
    const dispatch = fakeDispatch()
    const res = await enrollLead({
      profile: PROFILE,
      contact_key: '+15555550100',
      handles: { sms: '+15555550100' },
      dealer: 'Huminic',
      now: T,
      deps: { dispatch },
    })
    expect(res.enrolled).toBe(false)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('does not double-enroll the same contact', async () => {
    const { saveLeadFlow } = await import('@/server/messaging-hub-store')
    const { enrollLead } = await import('@/server/lead-flow')
    saveLeadFlow({ profile: PROFILE, enabled: true, steps: THREE_STEP })
    const handles = { sms: '+15555550100' }
    const first = await enrollLead({ profile: PROFILE, contact_key: '+15555550100', handles, dealer: 'H', now: T, deps: { dispatch: fakeDispatch() } })
    const second = await enrollLead({ profile: PROFILE, contact_key: '+15555550100', handles, dealer: 'H', now: T, deps: { dispatch: fakeDispatch() } })
    expect(first.enrolled).toBe(true)
    expect(second.enrolled).toBe(false)
  })
})

describe('tickFlows', () => {
  async function enroll(handles: Record<string, string>, dispatch = fakeDispatch()) {
    const { saveLeadFlow } = await import('@/server/messaging-hub-store')
    const { enrollLead } = await import('@/server/lead-flow')
    saveLeadFlow({ profile: PROFILE, enabled: true, steps: THREE_STEP })
    await enrollLead({
      profile: PROFILE,
      contact_key: '+15555550100',
      handles,
      first_name: 'Pat',
      dealer: 'Huminic',
      now: T,
      deps: { dispatch },
    })
  }

  it('advances to step 2 after the wait when there is no reply', async () => {
    await enroll({ sms: '+15555550100', voice: '+15555550100', email: 'lead@example.com' })
    const { tickFlows } = await import('@/server/lead-flow')
    const { getActiveFlowEnrollment } = await import('@/server/messaging-hub-store')
    const dispatch = fakeDispatch()
    const r = await tickFlows({ profile: PROFILE, now: T + 4 * HOUR, deps: { dispatch } })
    expect(r.sent).toBe(1)
    expect(dispatch.mock.calls[0][0].channel).toBe('email')
    const e = getActiveFlowEnrollment(PROFILE, '+15555550100')
    expect(e?.step_index).toBe(1)
    expect(e?.next_due_at).toBe(T + 4 * HOUR + 24 * HOUR)
  })

  it('stops the flow when the lead has replied', async () => {
    await enroll({ sms: '+15555550100', voice: '+15555550100', email: 'lead@example.com' })
    const { listThreads, appendMessage } = await import('@/server/messaging-hub-store')
    // Lead replies on the SMS thread.
    const thread = listThreads({ profile: PROFILE, channel: 'sms' })[0]
    appendMessage({
      thread_id: thread.id,
      direction: 'inbound',
      role: 'user',
      channel: 'sms',
      content: 'yes please',
      author: 'customer',
    })
    const { tickFlows } = await import('@/server/lead-flow')
    const dispatch = fakeDispatch()
    const r = await tickFlows({ profile: PROFILE, now: T + 4 * HOUR, deps: { dispatch } })
    expect(r.stopped).toBe(1)
    expect(r.sent).toBe(0)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('skips a step with no handle and advances to the next reachable step', async () => {
    // No email handle — step 2 (email) is skipped, step 3 (voice) sends.
    await enroll({ sms: '+15555550100', voice: '+15555550100' })
    const { tickFlows } = await import('@/server/lead-flow')
    const { getActiveFlowEnrollment } = await import('@/server/messaging-hub-store')
    const dispatch = fakeDispatch()
    const r = await tickFlows({ profile: PROFILE, now: T + 4 * HOUR, deps: { dispatch } })
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0][0].channel).toBe('voice')
    // Reached the last step → enrollment completed (no longer active).
    expect(getActiveFlowEnrollment(PROFILE, '+15555550100')).toBeNull()
    expect(r.sent).toBe(1)
  })

  it('is idempotent — re-ticking before the next step is due sends nothing', async () => {
    await enroll({ sms: '+15555550100', email: 'lead@example.com', voice: '+15555550100' })
    const { tickFlows } = await import('@/server/lead-flow')
    // Advance to step 2.
    await tickFlows({ profile: PROFILE, now: T + 4 * HOUR, deps: { dispatch: fakeDispatch() } })
    // Re-tick immediately — step 3 isn't due for another 24h.
    const dispatch = fakeDispatch()
    const r = await tickFlows({ profile: PROFILE, now: T + 4 * HOUR + 60_000, deps: { dispatch } })
    expect(r.due).toBe(0)
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('holds (does not send) when out of business hours', async () => {
    await enroll({ sms: '+15555550100', email: 'lead@example.com', voice: '+15555550100' })
    const { tickFlows } = await import('@/server/lead-flow')
    const { defaultStudioConfig } = await import('@/lib/studio-config')
    const { getActiveFlowEnrollment } = await import('@/server/messaging-hub-store')
    const config = defaultStudioConfig(PROFILE) // business hours 08:00–21:00 ET
    const dispatch = fakeDispatch()
    // 02:00 ET — out of hours — but the step is due.
    const outOfHours = Date.UTC(2026, 0, 2, 7, 0, 0)
    const r = await tickFlows({ profile: PROFILE, now: outOfHours, config, deps: { dispatch } })
    expect(dispatch).not.toHaveBeenCalled()
    expect(r.outcomes[0]?.action).toBe('waiting')
    expect(getActiveFlowEnrollment(PROFILE, '+15555550100')?.step_index).toBe(0)
  })
})
