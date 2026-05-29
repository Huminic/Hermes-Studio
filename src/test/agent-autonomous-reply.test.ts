import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let tmpHome: string

beforeEach(async () => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'aar-test-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  const dir = path.join(tmpHome, '.hermes', 'profiles', 'huminic')
  fs.mkdirSync(path.join(dir, 'governance', 'agents'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'governance/agents/caroline.md'),
    '---\nname: Caroline\n---\nCaroline does customer follow-up.\n',
  )
  fs.writeFileSync(
    path.join(dir, 'studio.yaml'),
    [
      'branding:',
      '  persona_name: Huminic',
      'autonomous_reply_defaults:',
      '  enabled: true',
      '  max_agent_turns: 2',
      '',
    ].join('\n'),
  )
  const mod = await import('@/server/messaging-hub-store')
  mod._resetForTests()
  const bus = await import('@/server/messaging-hub-bus')
  bus._resetMessagingBus()
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('agent-autonomous-reply', () => {
  it('dispatches an agent reply when rules allow', async () => {
    const {
      getOrCreateThread,
      appendMessage,
      subscribeAgentToThread,
    } = await import('@/server/messaging-hub-store')
    const ar = await import('@/server/agent-autonomous-reply')
    ar.setAutonomousReplyProvider(async () => ({
      ok: true,
      reply: 'auto-reply',
      via: 'mock',
    }))
    const thread = getOrCreateThread({
      profile: 'huminic',
      domain: 'service',
      channel: 'sms',
      contact_handle: '+15555550100',
    })
    const inbound = appendMessage({
      thread_id: thread.id,
      direction: 'inbound',
      role: 'user',
      channel: 'sms',
      content: 'hello',
      author: 'lead',
    })
    subscribeAgentToThread({
      thread_id: thread.id,
      agent_id: 'caroline',
      profile: 'huminic',
      channel: 'sms',
      mode: 'reply',
      rules: {},
      created_at: Date.now(),
    })
    const results = await ar.maybeAutonomousReply({
      profile: 'huminic',
      threadId: thread.id,
      inboundMessageId: inbound.id,
      // pin to a time inside business hours (UTC 16:00 = 11am ET)
      now: Date.UTC(2026, 4, 29, 16, 0, 0),
    })
    expect(results).toHaveLength(1)
    expect(results[0].ok).toBe(true)
    const { getThread } = await import('@/server/messaging-hub-store')
    const updated = getThread('huminic', thread.id)
    expect(updated?.messages).toHaveLength(2)
    expect(updated?.messages[1].direction).toBe('outbound')
    expect(updated?.messages[1].author).toBe('caroline')
  })

  it('rejects when channel not in allowed_channels', async () => {
    const {
      getOrCreateThread,
      appendMessage,
      subscribeAgentToThread,
    } = await import('@/server/messaging-hub-store')
    const ar = await import('@/server/agent-autonomous-reply')
    const thread = getOrCreateThread({
      profile: 'huminic',
      domain: 'service',
      channel: 'sms',
      contact_handle: '+15555550100',
    })
    const inbound = appendMessage({
      thread_id: thread.id,
      direction: 'inbound',
      role: 'user',
      channel: 'sms',
      content: 'hello',
      author: 'lead',
    })
    subscribeAgentToThread({
      thread_id: thread.id,
      agent_id: 'caroline',
      profile: 'huminic',
      channel: 'sms',
      mode: 'reply',
      rules: { allowed_channels: ['email'] },
      created_at: Date.now(),
    })
    const results = await ar.maybeAutonomousReply({
      profile: 'huminic',
      threadId: thread.id,
      inboundMessageId: inbound.id,
      now: Date.UTC(2026, 4, 29, 16, 0, 0),
    })
    expect(results).toHaveLength(1)
    expect(results[0].ok).toBe(false)
    if (!results[0].ok) {
      expect(results[0].reason).toMatch(/not in allowed_channels/)
    }
  })

  it('rejects after the max_agent_turns ceiling', async () => {
    const {
      getOrCreateThread,
      appendMessage,
      subscribeAgentToThread,
    } = await import('@/server/messaging-hub-store')
    const ar = await import('@/server/agent-autonomous-reply')
    ar.setAutonomousReplyProvider(async () => ({
      ok: true,
      reply: 'auto',
      via: 'mock',
    }))
    const thread = getOrCreateThread({
      profile: 'huminic',
      domain: 'service',
      channel: 'sms',
      contact_handle: '+15555550100',
    })
    // 2 prior agent turns
    appendMessage({
      thread_id: thread.id,
      direction: 'outbound',
      role: 'assistant',
      channel: 'sms',
      content: 'a',
      author: 'caroline',
    })
    appendMessage({
      thread_id: thread.id,
      direction: 'outbound',
      role: 'assistant',
      channel: 'sms',
      content: 'a',
      author: 'caroline',
    })
    const inbound = appendMessage({
      thread_id: thread.id,
      direction: 'inbound',
      role: 'user',
      channel: 'sms',
      content: 'still nothing',
      author: 'lead',
    })
    // Reset the consecutive count: BUT max_agent_turns counts trailing agent
    // turns from the end. Since the inbound is the last message, prior
    // agent turns reset to 0. Make the inbound the SECOND-to-last by adding
    // one more agent turn afterward.
    appendMessage({
      thread_id: thread.id,
      direction: 'outbound',
      role: 'assistant',
      channel: 'sms',
      content: 'b',
      author: 'caroline',
    })
    appendMessage({
      thread_id: thread.id,
      direction: 'outbound',
      role: 'assistant',
      channel: 'sms',
      content: 'b',
      author: 'caroline',
    })
    subscribeAgentToThread({
      thread_id: thread.id,
      agent_id: 'caroline',
      profile: 'huminic',
      channel: 'sms',
      mode: 'reply',
      rules: {},
      created_at: Date.now(),
    })
    const results = await ar.maybeAutonomousReply({
      profile: 'huminic',
      threadId: thread.id,
      inboundMessageId: inbound.id,
      now: Date.UTC(2026, 4, 29, 16, 0, 0),
    })
    expect(results).toHaveLength(1)
    expect(results[0].ok).toBe(false)
    if (!results[0].ok) {
      expect(results[0].reason).toMatch(/max agent turns/)
    }
  })

  it('returns empty when no subscriptions exist', async () => {
    const {
      getOrCreateThread,
      appendMessage,
    } = await import('@/server/messaging-hub-store')
    const ar = await import('@/server/agent-autonomous-reply')
    const thread = getOrCreateThread({
      profile: 'huminic',
      domain: 'service',
      channel: 'sms',
      contact_handle: '+15555550100',
    })
    const inbound = appendMessage({
      thread_id: thread.id,
      direction: 'inbound',
      role: 'user',
      channel: 'sms',
      content: 'hello',
      author: 'lead',
    })
    const results = await ar.maybeAutonomousReply({
      profile: 'huminic',
      threadId: thread.id,
      inboundMessageId: inbound.id,
    })
    expect(results).toHaveLength(0)
  })
})
