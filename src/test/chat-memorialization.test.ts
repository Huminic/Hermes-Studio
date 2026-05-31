import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openBrain } from '@/server/brain-store'
import {
  recordChat,
  reconstructDecisionContext,
  listRecentChats,
} from '@/server/chat-memorialization'

let tmpRoot: string

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-memo-test-'))
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

describe('chat memorialization (SRS A.6)', () => {
  it('records a single chat message and lists it back', () => {
    const res = recordChat({
      profile: 'fixture',
      channel: 'studio-chat',
      thread_id: 't1',
      participants: ['user:duane', 'agent:consultative'],
      role: 'user',
      content: 'How do we onboard Cedar Ridge?',
    })
    expect(res.ok).toBe(true)
    const recent = listRecentChats('fixture')
    expect(recent.length).toBe(1)
    expect(recent[0].content).toMatch(/Cedar Ridge/)
  })

  it('reconstructs a decision context across multiple channels', () => {
    const decisionId = 'dec-001'
    recordChat({
      profile: 'fixture',
      channel: 'studio-chat',
      thread_id: decisionId,
      participants: ['user:duane', 'agent:consultative'],
      role: 'user',
      content: 'What rooftops does this prospect own?',
      decision_context_id: decisionId,
    })
    recordChat({
      profile: 'fixture',
      channel: 'mcp',
      thread_id: decisionId,
      participants: ['agent:consultative', 'tool:wiki_search'],
      role: 'tool',
      content: 'wiki_search returned 0 results for "cedar ridge rooftops"',
      decision_context_id: decisionId,
    })
    recordChat({
      profile: 'fixture',
      channel: 'studio-chat',
      thread_id: decisionId,
      participants: ['user:duane', 'agent:consultative'],
      role: 'assistant',
      content:
        'I have no rooftop list yet. I will create a lookup miss and surface an assumption.',
      decision_context_id: decisionId,
    })
    const ctx = reconstructDecisionContext('fixture', decisionId)
    expect(ctx.chat.length).toBe(3)
    expect(ctx.chat[0].role).toBe('user')
    expect(ctx.chat[1].role).toBe('tool')
    expect(ctx.chat[2].role).toBe('assistant')
  })

  it('memorialization writes a metadata_audit entry per message', () => {
    recordChat({
      profile: 'fixture',
      channel: 'storefront-chat',
      participants: ['user:guest', 'agent:caroline'],
      role: 'user',
      content: 'Do you have a 2025 Pilot available?',
    })
    const profileRoot = path.join(tmpRoot, '.hermes', 'profiles', 'fixture')
    const handle = openBrain('fixture', { profileRoot })
    try {
      const audits = handle.all<{ action: string; target_type: string }>(
        `SELECT action, target_type FROM metadata_audit WHERE target_type = 'chat_records'`,
      )
      // Two audit rows expected: one gate_decision from DSG + one 'create' from
      // recordChat itself.
      expect(audits.length).toBeGreaterThanOrEqual(2)
    } finally {
      handle.close()
    }
  })
})
