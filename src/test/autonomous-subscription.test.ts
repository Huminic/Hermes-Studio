import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome: string
const PROFILE = 'serra-honda'

function writeStudio(autonomous: string): void {
  const dir = path.join(tmpHome, '.hermes', 'profiles', PROFILE)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'studio.yaml'),
    [
      'branding:',
      '  persona_name: Serra Honda',
      'agent_picker:',
      '  default_agent: caroline',
      '  visible_agents:',
      '    - caroline',
      'autonomous_reply_defaults:',
      autonomous,
      '',
    ].join('\n'),
  )
}

beforeEach(async () => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-sub-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  const mod = await import('@/server/messaging-hub-store')
  mod._resetForTests()
})
afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

async function makeThread(channel: string, agent: string | null) {
  const { getOrCreateThreadEx } = await import('@/server/messaging-hub-store')
  return getOrCreateThreadEx({
    profile: PROFILE,
    domain: 'sales',
    channel,
    contact_handle: '+15555550100',
    assigned_agent_id: agent,
  }).thread
}

describe('ensureAutonomousSubscription', () => {
  it('does nothing when autonomous reply is disabled (default safe-mode)', async () => {
    writeStudio('  enabled: false')
    const { ensureAutonomousSubscription } = await import('@/server/agent-autonomous-reply')
    const { listSubscriptionsForThread } = await import('@/server/messaging-hub-store')
    const thread = await makeThread('sms', null)
    const r = ensureAutonomousSubscription(PROFILE, thread)
    expect(r.subscribed).toBe(false)
    expect(r.reason).toBe('disabled')
    expect(listSubscriptionsForThread(PROFILE, thread.id)).toHaveLength(0)
  })

  it('subscribes the resolved default agent in reply mode when enabled, idempotently', async () => {
    writeStudio('  enabled: true\n  channels: [sms, email]')
    const { ensureAutonomousSubscription } = await import('@/server/agent-autonomous-reply')
    const { listSubscriptionsForThread } = await import('@/server/messaging-hub-store')
    const thread = await makeThread('sms', null) // no assigned agent → default_agent
    const r1 = ensureAutonomousSubscription(PROFILE, thread)
    expect(r1.subscribed).toBe(true)
    expect(r1.agent_id).toBe('caroline')
    const subs = listSubscriptionsForThread(PROFILE, thread.id)
    expect(subs).toHaveLength(1)
    expect(subs[0].mode).toBe('reply')
    // Second call must not duplicate.
    const r2 = ensureAutonomousSubscription(PROFILE, thread)
    expect(r2.reason).toBe('already')
    expect(listSubscriptionsForThread(PROFILE, thread.id)).toHaveLength(1)
  })

  it('prefers the thread-assigned agent over the default', async () => {
    writeStudio('  enabled: true\n  channels: [sms]')
    const { ensureAutonomousSubscription } = await import('@/server/agent-autonomous-reply')
    const thread = await makeThread('sms', 'nancy-gaston')
    const r = ensureAutonomousSubscription(PROFILE, thread)
    expect(r.agent_id).toBe('nancy-gaston')
  })

  it('skips channels outside the allowlist', async () => {
    writeStudio('  enabled: true\n  channels: [sms]')
    const { ensureAutonomousSubscription } = await import('@/server/agent-autonomous-reply')
    const thread = await makeThread('chat', 'caroline')
    const r = ensureAutonomousSubscription(PROFILE, thread)
    expect(r.subscribed).toBe(false)
    expect(r.reason).toBe('channel-not-allowed')
  })
})
