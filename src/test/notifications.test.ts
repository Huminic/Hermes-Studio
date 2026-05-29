import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.CENTRAL_MCP_STUDIO_TOKEN
})

describe('sendNotification', () => {
  it('returns an error when CENTRAL_MCP_STUDIO_TOKEN is not set', async () => {
    const { sendNotification } = await import('@/server/notifications')
    const result = await sendNotification({
      to: 'op@huminic.ai',
      subject: 'test',
      html: '<p>x</p>',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('CENTRAL_MCP_STUDIO_TOKEN')
    }
  })

  it('parses a successful Resend response and returns the email_id', async () => {
    process.env.CENTRAL_MCP_STUDIO_TOKEN = 'test-token'
    const fetchMock = vi.fn().mockResolvedValue({
      text: async () =>
        'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"{\\"id\\":\\"abc-123\\",\\"to\\":[\\"op@huminic.ai\\"]}"}]}}',
    } as Response)
    vi.stubGlobal('fetch', fetchMock)

    const { sendNotification } = await import('@/server/notifications')
    const result = await sendNotification({
      to: 'op@huminic.ai',
      subject: 'test',
      html: '<p>hi</p>',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.email_id).toBe('abc-123')
    }
    expect(fetchMock).toHaveBeenCalledOnce()
    const call = fetchMock.mock.calls[0]
    expect(call[1]).toMatchObject({ method: 'POST' })
    const body = JSON.parse(call[1].body as string)
    expect(body.params.name).toBe('resend_send_email')
    expect(body.params.arguments.from).toMatch(/Huminic Studio/)
    expect(body.params.arguments.to).toEqual(['op@huminic.ai'])
  })

  it('returns an error when the MCP response signals isError', async () => {
    process.env.CENTRAL_MCP_STUDIO_TOKEN = 'test-token'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        text: async () =>
          'data: {"jsonrpc":"2.0","id":1,"result":{"isError":true,"content":[{"type":"text","text":"Rate limited"}]}}',
      } as Response),
    )

    const { sendNotification } = await import('@/server/notifications')
    const result = await sendNotification({
      to: 'op@huminic.ai',
      subject: 'test',
      html: '<p>x</p>',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('Rate limited')
    }
  })
})

describe('senderForCustomer', () => {
  it('formats a customer-branded from address', async () => {
    const { senderForCustomer } = await import('@/server/notifications')
    expect(senderForCustomer('Strukture')).toBe(
      'Strukture via Huminic <notifications@huminic.ai>',
    )
  })
})
