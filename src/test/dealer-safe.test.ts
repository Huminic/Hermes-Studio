import { describe, expect, it } from 'vitest'
import {
  scrubVendorTerms,
  scrubThreadListItem,
  scrubThreadDetail,
  scrubContact,
  VENDOR_GUARDRAIL,
} from '@/server/dealer-safe'

const VENDOR = /tavus|vapi|textmagic|vinsolutions|signalwire|resend/i

describe('scrubVendorTerms (LC-BLOCKER-004)', () => {
  it('replaces provider terms with neutral words', () => {
    expect(scrubVendorTerms('tavus-cert_serra-honda_5550002001')).toBe(
      'video-cert_serra-honda_5550002001',
    )
    expect(scrubVendorTerms('tavus-verify_tavus_1780893916')).toBe(
      'video-verify_video_1780893916',
    )
    expect(scrubVendorTerms('vapi call · c303d993')).toBe('voice call · c303d993')
    expect(scrubVendorTerms('tavus session · cert')).toBe('video session · cert')
    expect(scrubVendorTerms('TextMagic')).toBe('text')
  })

  it('passes through null and clean strings', () => {
    expect(scrubVendorTerms(null)).toBeNull()
    expect(scrubVendorTerms('+19015550100')).toBe('+19015550100')
    expect(scrubVendorTerms('Phone call · Pat')).toBe('Phone call · Pat')
  })
})

describe('VENDOR_GUARDRAIL (LC-BLOCKER-008)', () => {
  it('instructs the agent to never reveal vendor/tech-stack names, even when baited', () => {
    expect(VENDOR_GUARDRAIL).toMatch(/never reveal/i)
    expect(VENDOR_GUARDRAIL).toMatch(/bait/i)
    expect(VENDOR_GUARDRAIL).toMatch(/powered by Huminic/i)
    // the don't-list names the banned providers (this lives in the system
    // prompt only; model OUTPUT is additionally scrubbed by scrubVendorTerms).
    for (const v of ['Vapi', 'Tavus', 'TextMagic', 'VinSolutions', 'SignalWire', 'Resend']) {
      expect(VENDOR_GUARDRAIL).toContain(v)
    }
  })
})

describe('scrubThreadListItem', () => {
  it('scrubs the dealer-visible fields and leaves no vendor term', () => {
    const out = scrubThreadListItem({
      id: 't1',
      channel: 'video',
      subject: 'tavus session · verify',
      contact_handle: 'tavus-cert_serra-honda_5550002001',
      last_message_preview: 'started a tavus session',
    })
    expect(out.subject).not.toMatch(VENDOR)
    expect(out.contact_handle).not.toMatch(VENDOR)
    expect(out.last_message_preview).not.toMatch(VENDOR)
    // non-display fields untouched
    expect(out.id).toBe('t1')
  })
})

describe('scrubThreadDetail', () => {
  it('scrubs visible fields and DROPS internal metadata', () => {
    const out = scrubThreadDetail({
      id: 't1',
      subject: 'tavus session · verify',
      contact_handle: 'tavus-cert_x',
      messages: [
        {
          id: 'm1',
          content: 'inbound tavus call',
          author: 'tavus-cert_x',
          metadata: { via: 'tavus-webhook', vapi_call_id: 'abc' },
        },
      ],
    })
    expect(out.subject).not.toMatch(VENDOR)
    expect(out.contact_handle).not.toMatch(VENDOR)
    expect(out.messages[0].content).not.toMatch(VENDOR)
    expect(out.messages[0].author).not.toMatch(VENDOR)
    // metadata (vapi_call_id key, via: tavus-webhook) must be gone entirely.
    expect('metadata' in out.messages[0]).toBe(false)
    expect(JSON.stringify(out)).not.toMatch(VENDOR)
  })

  it('classifies a dealer-safe sender from metadata before dropping it', () => {
    const out = scrubThreadDetail({
      id: 't1',
      subject: 's',
      contact_handle: 'c',
      messages: [
        { id: 'm1', direction: 'inbound', content: 'hi', author: '+1555', metadata: { via: 'textmagic-webhook' } },
        { id: 'm2', direction: 'outbound', content: 'ai', author: 'caroline', metadata: { via: 'hermes' } },
        { id: 'm3', direction: 'outbound', content: 'blast', author: 'campaign', metadata: { via: 'sms-textmagic-shared' } },
        { id: 'm4', direction: 'outbound', content: 'rep', author: 'customer-admin', metadata: { via: 'textmagic' } },
      ],
    })
    expect(out.messages.map((m) => (m as { sender?: string }).sender)).toEqual([
      'contact',
      'ai',
      'campaign',
      'human',
    ])
    // raw metadata still dropped for every message
    expect(out.messages.every((m) => !('metadata' in m))).toBe(true)
  })
})

describe('scrubContact', () => {
  it('scrubs display name + identifier keys and values consistently', () => {
    const out = scrubContact({
      id: 'c1',
      display_name: 'tavus-verify_tavus_1780893916',
      identifiers: { video: 'tavus-cert_serra-honda_5550002001', vapi: '+15551112222' },
    })
    expect(out.display_name).not.toMatch(VENDOR)
    expect(JSON.stringify(out.identifiers)).not.toMatch(VENDOR)
    // Deterministic: the scrubbed handle still matches the scrubbed thread handle.
    expect(out.identifiers.video).toBe('video-cert_serra-honda_5550002001')
  })
})
