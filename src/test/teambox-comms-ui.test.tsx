// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { CustomerCommsRenderer } from '@/components/customer-console/comms-renderer'
import { defaultStudioConfig } from '@/lib/studio-config'

type Call = { method: string; path: string; body: unknown }

function baseThread(over: Partial<Record<string, unknown>>) {
  const now = 1_700_000_000_000
  return {
    id: 'x',
    profile: 'serra',
    domain: 'sales',
    channel: 'sms',
    subject: '',
    contact_handle: '+15555550100',
    assigned_agent_id: 'caroline',
    status: 'open',
    created_at: now,
    updated_at: now,
    message_count: 1,
    last_message_preview: 'hi',
    ...over,
  }
}

// Build a fetch mock over the messaging API for a given thread set. Detail
// responses are looked up by the id in the URL.
function installFetch(threads: Array<Record<string, unknown>>) {
  const calls: Array<Call> = []
  const byId = new Map(threads.map((t) => [t.id as string, t]))
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const path = new URL(url, 'http://localhost').pathname
      const method = (init?.method ?? 'GET').toUpperCase()
      const body = init?.body ? JSON.parse(init.body as string) : undefined
      calls.push({ method, path, body })
      const json = (obj: unknown) =>
        new Response(JSON.stringify(obj), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })

      const detailMatch = path.match(/\/api\/messaging\/threads\/([^/]+)$/)
      if (detailMatch && method === 'GET') {
        const t = byId.get(decodeURIComponent(detailMatch[1]))
        return json({
          ok: true,
          thread: { ...t, human_assigned: false, messages: [] },
        })
      }
      if (path.endsWith('/assign') && method === 'POST') {
        return json({ ok: true, human_assigned: true, assigned_to: 'rep' })
      }
      if (path.endsWith('/reply') && method === 'POST') {
        return json({ ok: true, message: { id: 'm-new' } })
      }
      if (path === '/api/messaging/threads' && method === 'GET') {
        return json({ ok: true, threads })
      }
      if (path === '/api/messaging/contacts') {
        return json({ ok: true, contacts: [] })
      }
      return json({ ok: true })
    },
  )
  vi.stubGlobal('fetch', fetchMock)
  return { calls }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const cfg = defaultStudioConfig('serra')

describe('Teambox — channel tabs + counts', () => {
  it('shows All plus per-channel tabs with accurate counts and no sales/service segment', async () => {
    installFetch([
      baseThread({ id: 't1', channel: 'sms' }),
      baseThread({ id: 't2', channel: 'textmagic' }),
      baseThread({ id: 't3', channel: 'email' }),
      baseThread({ id: 't4', channel: 'vapi' }),
      baseThread({ id: 't5', channel: 'tavus' }),
      baseThread({ id: 't6', channel: 'chat' }),
    ])
    render(<CustomerCommsRenderer profile="serra" config={cfg} />)
    const tabs = await screen.findByRole('tablist')
    // No segment switcher.
    expect(document.querySelectorAll('[data-role="segment"]')).toHaveLength(0)

    const countFor = (key: string) =>
      within(
        document.querySelector(`[data-channel-tab="${key}"]`) as HTMLElement,
      ).getByText((_c, el) => el?.getAttribute('data-role') === 'tab-count')
        .textContent

    await waitFor(() => expect(countFor('all')).toBe('6'))
    expect(countFor('text')).toBe('2') // sms + textmagic
    expect(countFor('email')).toBe('1')
    expect(countFor('call')).toBe('1') // vapi
    expect(countFor('video')).toBe('1') // tavus
    expect(countFor('chat')).toBe('1')
    expect(within(tabs).getByText('All')).toBeTruthy()
  })
})

describe('Teambox — Call/Video are not reply-capable', () => {
  it('a completed video shows an honest note and no composer, with a human-readable title (no raw slug)', async () => {
    installFetch([
      baseThread({
        id: 'v1',
        channel: 'tavus',
        subject: 'video-cecd7aaf287c2435',
        contact_handle: 'video-cecd7aaf287c2435',
      }),
    ])
    render(<CustomerCommsRenderer profile="serra" config={cfg} />)
    // Auto-selected; wait for the no-reply note.
    await waitFor(() =>
      expect(
        document.querySelector('[data-role="comms-noreply"]'),
      ).not.toBeNull(),
    )
    // No composer / send affordance for a completed video.
    expect(document.querySelector('[data-role="comms-composer"]')).toBeNull()
    expect(screen.queryByRole('button', { name: /send reply/i })).toBeNull()
    // The raw machine slug never reaches the screen.
    expect(document.body.textContent).not.toContain('video-cecd7aaf287c2435')
    expect(document.body.textContent).toMatch(/completed/i)
    expect(document.body.textContent).toMatch(/Video conversation/)
  })
})

describe('Teambox — message attribution', () => {
  it('attributes AI (via hermes), campaign, and human replies correctly even when the thread has no assigned agent', async () => {
    // Mirrors a real prod thread: assigned_agent_id is null, yet the AI replied.
    const t = baseThread({ id: 't1', channel: 'sms', assigned_agent_id: null })
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input), 'http://localhost').pathname
      const json = (o: unknown) =>
        new Response(JSON.stringify(o), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      if (/\/api\/messaging\/threads\/[^/]+$/.test(path)) {
        return json({
          ok: true,
          thread: {
            ...t,
            human_assigned: false,
            messages: [
              { id: 'm1', direction: 'outbound', role: 'assistant', channel: 'sms', content: 'AI handled this', author: 'caroline', created_at: 1, metadata: { via: 'hermes' } },
              { id: 'm2', direction: 'outbound', role: 'assistant', channel: 'sms', content: 'Campaign blast', author: 'campaign', created_at: 2, metadata: { via: 'sms-textmagic-shared' } },
              { id: 'm3', direction: 'outbound', role: 'assistant', channel: 'sms', content: 'Rep handled this', author: 'customer-admin', created_at: 3, metadata: { via: 'textmagic' } },
            ],
          },
        })
      }
      if (path === '/api/messaging/threads') return json({ ok: true, threads: [t] })
      if (path === '/api/messaging/contacts') return json({ ok: true, contacts: [] })
      return json({ ok: true })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<CustomerCommsRenderer profile="serra" config={cfg} />)
    const find = async (txt: string) =>
      (await screen.findByText(txt)).closest('[data-role="message"]') as HTMLElement
    expect((await find('AI handled this')).textContent).toContain('Caroline')
    expect((await find('Campaign blast')).textContent).toContain('Automated')
    const rep = await find('Rep handled this')
    expect(rep.textContent).toContain('You')
    expect(rep.textContent).not.toContain('Caroline')
  })

  it('shows the agent name for AI replies and "You" for the human rep reply', async () => {
    const t = baseThread({ id: 't1', channel: 'sms', assigned_agent_id: 'caroline' })
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = new URL(String(input), 'http://localhost').pathname
      const json = (o: unknown) =>
        new Response(JSON.stringify(o), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      if (/\/api\/messaging\/threads\/[^/]+$/.test(path)) {
        return json({
          ok: true,
          thread: {
            ...t,
            human_assigned: true,
            messages: [
              {
                id: 'm1',
                direction: 'outbound',
                role: 'assistant',
                channel: 'sms',
                content: 'AI handled this',
                author: 'Caroline',
                created_at: 1,
                metadata: { via: 'hermes' },
              },
              {
                id: 'm2',
                direction: 'outbound',
                role: 'assistant',
                channel: 'sms',
                content: 'Rep handled this',
                author: 'customer-admin',
                created_at: 2,
                metadata: { via: 'sms' },
              },
            ],
          },
        })
      }
      if (path === '/api/messaging/threads') return json({ ok: true, threads: [t] })
      if (path === '/api/messaging/contacts') return json({ ok: true, contacts: [] })
      return json({ ok: true })
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<CustomerCommsRenderer profile="serra" config={cfg} />)
    const aiMsg = (await screen.findByText('AI handled this')).closest(
      '[data-role="message"]',
    ) as HTMLElement
    const repMsg = screen
      .getByText('Rep handled this')
      .closest('[data-role="message"]') as HTMLElement
    expect(aiMsg.textContent).toContain('Caroline')
    expect(repMsg.textContent).toContain('You')
    expect(repMsg.textContent).not.toContain('Caroline')
  })
})

describe('Teambox — titles never leak vendor names or slugs', () => {
  it('scrubs "vapi call · <slug>" and "form · <slug>" machine subjects', async () => {
    installFetch([
      baseThread({
        id: 'c1',
        channel: 'voice',
        subject: 'vapi call · c303d993',
        contact_handle: 'vapi-c303d993',
      }),
      baseThread({
        id: 'f1',
        channel: 'form',
        subject: 'form · serra-honda-contact',
        contact_handle: 'serra-honda-contact',
      }),
    ])
    render(<CustomerCommsRenderer profile="serra" config={cfg} />)
    await waitFor(() =>
      expect(document.body.textContent).toContain('Call conversation'),
    )
    const body = document.body.textContent ?? ''
    // Friendly titles render…
    expect(body).toContain('Call conversation')
    expect(body).toContain('Website form')
    // …and the raw vendor name / slug / machine subject never do.
    expect(body).not.toMatch(/vapi/i)
    expect(body).not.toContain('c303d993')
    expect(body).not.toContain('form · serra-honda-contact')
  })
})

describe('Teambox — auto-takeover on reply', () => {
  it('sending a manual reply on an AI-handled text thread takes over first, then replies', async () => {
    const { calls } = installFetch([
      baseThread({ id: 't1', channel: 'sms', subject: 'Question about pricing' }),
    ])
    render(<CustomerCommsRenderer profile="serra" config={cfg} />)
    const composer = (await screen.findByPlaceholderText(
      /type your reply/i,
    )) as HTMLTextAreaElement
    // Composer is enabled even though the AI still owns the thread.
    expect(composer.disabled).toBe(false)
    fireEvent.change(composer, { target: { value: 'Happy to help!' } })
    fireEvent.click(screen.getByRole('button', { name: /send reply/i }))

    await waitFor(() => {
      const reply = calls.find(
        (c) => c.method === 'POST' && c.path.endsWith('/reply'),
      )
      expect(reply).toBeTruthy()
    })
    const assignIdx = calls.findIndex(
      (c) =>
        c.method === 'POST' &&
        c.path.endsWith('/assign') &&
        (c.body as { action?: string })?.action === 'take_over',
    )
    const replyIdx = calls.findIndex(
      (c) => c.method === 'POST' && c.path.endsWith('/reply'),
    )
    // Takeover happened, and it happened BEFORE the reply.
    expect(assignIdx).toBeGreaterThanOrEqual(0)
    expect(assignIdx).toBeLessThan(replyIdx)
    // The reply carried the typed content.
    expect((calls[replyIdx].body as { content?: string }).content).toBe(
      'Happy to help!',
    )
  })
})
