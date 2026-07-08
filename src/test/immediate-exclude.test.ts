import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isAgentHandled,
  resolveExcludeVia,
  DEFAULT_EXCLUDE_VIA,
  type ViasForContact,
} from '../server/immediate-exclude'

describe('resolveExcludeVia', () => {
  it('defaults to vapi + tavus webhooks (voice + video)', () => {
    expect(resolveExcludeVia(undefined)).toEqual(['vapi-webhook', 'tavus-webhook'])
    expect([...DEFAULT_EXCLUDE_VIA]).toEqual(['vapi-webhook', 'tavus-webhook'])
  })
  it('uses the configured list when non-empty (e.g. also exclude call-back)', () => {
    expect(
      resolveExcludeVia({ immediate_exclude_via: ['vapi-webhook', 'tavus-webhook', 'widget-callback'] }),
    ).toEqual(['vapi-webhook', 'tavus-webhook', 'widget-callback'])
  })
  it('falls back to default when configured list is empty', () => {
    expect(resolveExcludeVia({ immediate_exclude_via: [] })).toEqual([
      'vapi-webhook',
      'tavus-webhook',
    ])
  })
})

describe('isAgentHandled (injected lookup)', () => {
  const viaMap = (m: Record<string, string[]>): ViasForContact => (_p, handle) => m[handle] ?? []

  it('excludes a phone with a vapi-webhook thread', () => {
    expect(
      isAgentHandled({
        profile: 'serra-honda',
        phone: '+17313946907',
        viasForContact: viaMap({ '+17313946907': ['vapi-webhook', 'lead-notification'] }),
      }),
    ).toBe(true)
  })

  it('excludes a phone with a tavus-webhook (video) thread', () => {
    expect(
      isAgentHandled({
        profile: 'serra-honda',
        phone: '+15551234567',
        viasForContact: viaMap({ '+15551234567': ['tavus-webhook'] }),
      }),
    ).toBe(true)
  })

  it('does NOT exclude a normal VIN/website lead (no agent via)', () => {
    expect(
      isAgentHandled({
        profile: 'serra-honda',
        phone: '+15559990000',
        viasForContact: viaMap({ '+15559990000': ['vin-watcher', 'lead-notification'] }),
      }),
    ).toBe(false)
  })

  it('does NOT exclude call-back / form / chat by default (only vapi+tavus)', () => {
    for (const via of ['widget-callback', 'widget-form', 'widget-chat:answered']) {
      expect(
        isAgentHandled({
          profile: 'serra-honda',
          phone: '+15550001111',
          viasForContact: viaMap({ '+15550001111': [via] }),
        }),
      ).toBe(false)
    }
  })

  it('excludes call-back when config adds widget-callback', () => {
    expect(
      isAgentHandled({
        profile: 'serra-honda',
        phone: '+15550001111',
        cfg: { immediate_exclude_via: ['vapi-webhook', 'tavus-webhook', 'widget-callback'] },
        viasForContact: viaMap({ '+15550001111': ['widget-callback'] }),
      }),
    ).toBe(true)
  })

  it('canonicalizes the phone before lookup (no-+ input matches +E.164 threads)', () => {
    // hub threads are keyed by canonical +E.164; the caller may pass a bare number.
    const seen: string[] = []
    const lookup: ViasForContact = (_p, handle) => {
      seen.push(handle)
      return handle === '+17313946907' ? ['tavus-webhook'] : []
    }
    expect(
      isAgentHandled({ profile: 'serra-honda', phone: '7313946907', viasForContact: lookup }),
    ).toBe(true)
    expect(seen).toContain('+17313946907')
  })

  it('returns false for an unknown phone (no threads)', () => {
    expect(
      isAgentHandled({
        profile: 'serra-honda',
        phone: '+15558675309',
        viasForContact: viaMap({}),
      }),
    ).toBe(false)
  })
})

describe('isAgentHandled (real messaging-hub store)', () => {
  let tmpHome: string
  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'exclude-test-'))
    vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
    const dir = path.join(tmpHome, '.hermes', 'profiles', 'serra-honda')
    fs.mkdirSync(dir, { recursive: true })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(tmpHome, { recursive: true, force: true })
  })

  it('reads via tags from seeded hub threads and excludes an agent-handled lead', async () => {
    const store = await import('../server/messaging-hub-store')
    // Tavus (video) lead — should be excluded.
    const t1 = store.getOrCreateThread({
      profile: 'serra-honda',
      domain: 'sales',
      channel: 'video',
      contact_handle: '+17313946907',
    })
    store.appendMessage({
      thread_id: t1.id,
      direction: 'inbound',
      role: 'user',
      channel: 'video',
      content: 'started a video call',
      author: 'system',
      metadata: { via: 'tavus-webhook' },
    })
    // Ordinary website/VIN lead — should NOT be excluded.
    const t2 = store.getOrCreateThread({
      profile: 'serra-honda',
      domain: 'sales',
      channel: 'sms',
      contact_handle: '+15559990000',
    })
    store.appendMessage({
      thread_id: t2.id,
      direction: 'outbound',
      role: 'assistant',
      channel: 'sms',
      content: 'hi',
      author: 'caroline',
      metadata: { via: 'vin-watcher' },
    })

    expect(store.listContactVias('serra-honda', '+17313946907')).toContain('tavus-webhook')
    expect(isAgentHandled({ profile: 'serra-honda', phone: '+17313946907' })).toBe(true)
    expect(isAgentHandled({ profile: 'serra-honda', phone: '+15559990000' })).toBe(false)
  })
})
