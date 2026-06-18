// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { CustomerAgentsRenderer } from '@/components/customer-console/agents-renderer'
import { CustomerChatRenderer } from '@/components/customer-console/chat-renderer'
import { defaultStudioConfig } from '@/lib/studio-config'

type Handler = (body: unknown, url: string) => unknown
const routes: Record<string, Handler> = {}
let chatReply = '[CAPABLE] Yes, I can do that for you.'
const calls: Array<{ method: string; url: string; body: unknown }> = []

function jsonResponse(obj: unknown) {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  calls.length = 0
  chatReply = '[CAPABLE] Yes, I can do that for you.'
  routes['GET /api/customer/agents'] = () => ({
    ok: true,
    profile: 'serra',
    agents: [
      {
        id: 'caroline',
        name: 'Caroline',
        summary: 'Caroline helps customers with sales questions.',
        scope: 'sales',
        source: 'governance/agents',
        has_chat_persona: true,
      },
    ],
    default_agent: 'caroline',
  })
  routes['GET /api/customer/agent-tasks'] = () => ({ ok: true, tasks: [] })
  routes['GET /api/customer/sessions'] = () => ({ ok: true, sessions: [] })
  routes['POST /api/customer/chat'] = () => ({
    ok: true,
    reply: chatReply,
    session_id: 's1',
    via: 'hermes',
  })
  routes['POST /api/customer/agent-tasks'] = (body) => ({
    ok: true,
    task: { id: 't1', ...(body as object) },
  })

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? 'GET').toUpperCase()
    const path = new URL(url, 'http://localhost').pathname
    const body = init?.body ? JSON.parse(init.body as string) : undefined
    calls.push({ method, url: path, body })
    const key = `${method} ${path}`
    const h = routes[key]
    if (h) return jsonResponse(h(body, url))
    return jsonResponse({ ok: true })
  }) as typeof fetch
  // window.location.assign is not implemented in jsdom
  Object.defineProperty(window, 'location', {
    value: { ...window.location, assign: vi.fn(), href: 'http://localhost/p/serra/agents' },
    writable: true,
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const cfg = defaultStudioConfig('serra')

function taskCreateCalls() {
  return calls.filter((c) => c.method === 'POST' && c.url === '/api/customer/agent-tasks')
}

describe('New Task interview (F1–F5)', () => {
  async function openInterview() {
    render(<CustomerAgentsRenderer profile="serra" config={cfg} />)
    const card = await screen.findByTestId('agent-card')
    fireEvent.click(within(card).getByText('New Task'))
    await screen.findByText(/What would you like Caroline to do/i)
  }

  it('capable → cadence → notify → review → confirm creates a structured record', async () => {
    await openInterview()
    fireEvent.change(screen.getByPlaceholderText(/Send me a summary/i), {
      target: { value: 'Summarize new leads every Monday' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Ask Caroline/i }))

    // Capability passed → cadence step
    await screen.findByText(/How often should Caroline do this/i)
    fireEvent.click(screen.getByRole('button', { name: 'Recurring' }))
    fireEvent.change(screen.getByPlaceholderText(/every Monday at 9am/i), {
      target: { value: 'every Monday at 9am' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    // Notify step → Review
    await screen.findByText(/How should we notify you/i)
    fireEvent.click(screen.getByRole('button', { name: 'Review' }))

    // Review → confirm
    const confirm = await screen.findByTestId('confirm-task')
    fireEvent.click(confirm)

    await waitFor(() => expect(taskCreateCalls()).toHaveLength(1))
    const body = taskCreateCalls()[0].body as Record<string, unknown>
    expect(body.agent_id).toBe('caroline')
    expect(body.frequency).toBe('recurring')
    expect(body.cadence).toBe('every Monday at 9am')
    expect(body.prompt).toBe('Summarize new leads every Monday')
    expect(body.notification_channel).toBe('in_app')
  })

  it('not capable → no record is created', async () => {
    chatReply = '[NOT_CAPABLE] That is outside what I can do.'
    await openInterview()
    fireEvent.change(screen.getByPlaceholderText(/Send me a summary/i), {
      target: { value: 'Pilot a rocket' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Ask Caroline/i }))
    await screen.findByText(/can’t take this one on/i)
    expect(taskCreateCalls()).toHaveLength(0)
  })

  it('closing mid-interview creates no record', async () => {
    await openInterview()
    fireEvent.change(screen.getByPlaceholderText(/Send me a summary/i), {
      target: { value: 'Do a thing' },
    })
    // Cancel on the first step
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() =>
      expect(screen.queryByText(/What would you like Caroline to do/i)).toBeNull(),
    )
    expect(taskCreateCalls()).toHaveLength(0)
  })
})

describe('Chat page (dropdown, arrow, slide-out)', () => {
  it('renders a single dropdown showing only the agent name and an arrow send button', async () => {
    render(<CustomerChatRenderer profile="serra" config={cfg} />)
    // Dropdown trigger shows the agent name; no "pick an agent" copy.
    await screen.findByRole('button', { name: /Select agent/i })
    expect(screen.getByText('Caroline')).toBeTruthy()
    expect(screen.queryByText(/pick an agent/i)).toBeNull()
    // Arrow send button present (replaces the "Send" text button).
    expect(screen.getByRole('button', { name: /Send message/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Send$/ })).toBeNull()
  })

  it('slide-out starts closed and opens on the toggle', async () => {
    render(<CustomerChatRenderer profile="serra" config={cfg} />)
    await screen.findByTestId('chat-slideout-toggle')
    // Closed initially.
    expect(screen.queryByTestId('chat-slideout')).toBeNull()
    fireEvent.click(screen.getByTestId('chat-slideout-toggle'))
    await screen.findByTestId('chat-slideout')
    expect(screen.getByText('History')).toBeTruthy()
  })
})
