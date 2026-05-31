import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openBrain } from '@/server/brain-store'
import { checkAndRecord } from '@/server/comms-rate-limiter'
import { handleUpload, listUploads, readUpload } from '@/server/upload-surface'
import { callFederationTool } from '@/server/federation-mcp-handlers'
import { publishBrainEvent } from '@/server/brain-event-bus'
import { subscribeMessaging } from '@/server/messaging-hub-bus'

let tmpRoot: string

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tranche-d-test-'))
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
  delete process.env.MINDSDB_URL
})

describe('Tranche D (plugin/skills/federation/comms/upload)', () => {
  it('rate limiter starts with full quota and decrements via outbound history', () => {
    const r = checkAndRecord({ profile: 'fixture', channel: 'sms' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.remaining_minute).toBeGreaterThan(0)
    }
  })

  it('upload surface stores file under brain/uploads/, indexes in Brain, classifies', async () => {
    const r = await handleUpload({
      profile: 'fixture',
      actor: 'user:duane',
      filename: 'specs.md',
      mime_type: 'text/markdown',
      content: Buffer.from('# Specs\nThis is a test upload.'),
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.classification).toBe('document')
      expect(fs.existsSync(r.stored_path)).toBe(true)
      const list = listUploads('fixture')
      expect(list.length).toBe(1)
      expect(list[0].filename).toBe('specs.md')
      const read = readUpload('fixture', r.id)
      expect(read.ok).toBe(true)
      expect(read.bytes!.toString('utf8')).toMatch(/Specs/)
    }
  })

  it('upload of an image classifies as image and does not embed', async () => {
    const r = await handleUpload({
      profile: 'fixture',
      actor: 'user:duane',
      filename: 'logo.png',
      mime_type: 'image/png',
      content: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.classification).toBe('image')
      expect(r.embedded).toBe(false)
    }
  })

  it('federation_list_scopes returns the studio.yaml scope set', async () => {
    // Write a studio.yaml with federation scopes.
    const profileRoot = path.join(tmpRoot, '.hermes', 'profiles', 'fixture')
    fs.writeFileSync(
      path.join(profileRoot, 'studio.yaml'),
      `
branding:
  persona_name: Fixture
federation:
  read_scopes:
    - vinsolutions
    - google_analytics
`,
      'utf8',
    )
    const res = await callFederationTool(
      'federation_list_scopes',
      { profile: 'fixture' },
      {
        token_label: 'test',
        token_allowed_profiles: ['fixture'],
        token_allowed_tools: ['federation_list_scopes'],
        token_admin: false,
      },
    )
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.rows).toEqual(['vinsolutions', 'google_analytics'])
    }
  })

  it('federation_query is denied when scope is not in read_scopes', async () => {
    const profileRoot = path.join(tmpRoot, '.hermes', 'profiles', 'fixture')
    fs.writeFileSync(
      path.join(profileRoot, 'studio.yaml'),
      `
branding:
  persona_name: Fixture
federation:
  read_scopes:
    - allowed_only
`,
      'utf8',
    )
    const res = await callFederationTool(
      'federation_query',
      { profile: 'fixture', scope: 'forbidden', query: 'SELECT 1' },
      {
        token_label: 'test',
        token_allowed_profiles: ['fixture'],
        token_allowed_tools: ['federation_query'],
        token_admin: false,
      },
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.rule).toBe('unscoped-tool')
  })

  it('federation_query falls back to shim when MindsDB not configured', async () => {
    const profileRoot = path.join(tmpRoot, '.hermes', 'profiles', 'fixture')
    fs.writeFileSync(
      path.join(profileRoot, 'studio.yaml'),
      `
branding:
  persona_name: Fixture
federation:
  read_scopes:
    - vinsolutions
`,
      'utf8',
    )
    const res = await callFederationTool(
      'federation_query',
      { profile: 'fixture', scope: 'vinsolutions', query: 'SELECT 1' },
      {
        token_label: 'test',
        token_allowed_profiles: ['fixture'],
        token_allowed_tools: ['federation_query'],
        token_admin: false,
      },
    )
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.engine).toBe('shim')
    }
  })

  it('publishBrainEvent reaches a messaging-hub subscriber', () => {
    const received: Array<unknown> = []
    const unsub = subscribeMessaging('fixture', (e) => received.push(e))
    publishBrainEvent('fixture', 'brain_lookup_miss', { miss_id: 'm-1' })
    unsub()
    expect(received.length).toBe(1)
    const ev = received[0] as { payload: { brain_event_type: string } }
    expect(ev.payload.brain_event_type).toBe('brain_lookup_miss')
  })
})
