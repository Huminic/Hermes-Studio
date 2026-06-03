import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the two external collaborators: central-mcp (live VIN) + studio-config
// (federation scopes). The messaging-hub store is the REAL store under tmpHome.
const callCentralMcpTool = vi.fn()
const readStudioConfig = vi.fn()

vi.mock('@/server/central-mcp', () => ({
  callCentralMcpTool: (...args: Array<unknown>) => callCentralMcpTool(...args),
}))
vi.mock('@/server/studio-config', () => ({
  readStudioConfig: (profile: string) => readStudioConfig(profile),
}))

let tmpHome: string

function configWithScopes(scopes: Array<string>) {
  return {
    config: { federation: { read_scopes: scopes } },
    source: 'file' as const,
  }
}

beforeEach(async () => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cust-reports-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  const mod = await import('@/server/messaging-hub-store')
  mod._resetForTests()
  const bus = await import('@/server/messaging-hub-bus')
  bus._resetMessagingBus()
  callCentralMcpTool.mockReset()
  readStudioConfig.mockReset().mockReturnValue(configWithScopes([]))
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

describe('buildCustomerReports', () => {
  it('reports comms + campaign aggregates from the store', async () => {
    const { getOrCreateThread, appendMessage } = await import(
      '@/server/messaging-hub-store'
    )
    const t = getOrCreateThread({
      profile: 'serra-honda',
      domain: 'sales',
      channel: 'sms',
      contact_handle: '+15555550100',
    })
    appendMessage({
      thread_id: t.id,
      direction: 'inbound',
      role: 'user',
      channel: 'sms',
      content: 'hi',
      author: '+15555550100',
    })
    const { buildCustomerReports } = await import('@/server/customer-reports')
    const reports = await buildCustomerReports('serra-honda')
    expect(reports.comms.messages.total).toBe(1)
    expect(reports.comms.threads.by_domain.sales).toBe(1)
    expect(reports.campaigns.campaigns).toBe(0)
  })

  it('marks the lead funnel unavailable (source none) without a VIN scope', async () => {
    readStudioConfig.mockReturnValue(configWithScopes([]))
    const { buildCustomerReports } = await import('@/server/customer-reports')
    const reports = await buildCustomerReports('serra-honda')
    expect(reports.lead_funnel.available).toBe(false)
    if (!reports.lead_funnel.available) {
      expect(reports.lead_funnel.source).toBe('none')
    }
    expect(callCentralMcpTool).not.toHaveBeenCalled()
  })

  it('queries live VIN and builds a funnel when a vin scope is present', async () => {
    readStudioConfig.mockReturnValue(configWithScopes(['vin:serra-honda']))
    callCentralMcpTool.mockResolvedValue({
      ok: true,
      data: {
        leads: [
          { status: 'Hot' },
          { status: 'hot' },
          { status: 'Cold' },
          { lead_status: 'Working' },
        ],
      },
    })
    const { buildCustomerReports } = await import('@/server/customer-reports')
    const reports = await buildCustomerReports('serra-honda')
    expect(callCentralMcpTool).toHaveBeenCalledWith(
      'vin_query_leads',
      { profile: 'serra-honda' },
      expect.any(Object),
    )
    expect(reports.lead_funnel.available).toBe(true)
    if (reports.lead_funnel.available) {
      expect(reports.lead_funnel.total).toBe(4)
      expect(reports.lead_funnel.by_status.hot).toBe(2)
      expect(reports.lead_funnel.by_status.cold).toBe(1)
      expect(reports.lead_funnel.by_status.working).toBe(1)
    }
  })

  it('marks the funnel unavailable when central-mcp is unconfigured', async () => {
    readStudioConfig.mockReturnValue(configWithScopes(['vin']))
    callCentralMcpTool.mockResolvedValue({
      ok: false,
      unconfigured: true,
      error: 'central-mcp token missing',
    })
    const { buildCustomerReports } = await import('@/server/customer-reports')
    const reports = await buildCustomerReports('serra-honda')
    expect(reports.lead_funnel.available).toBe(false)
    if (!reports.lead_funnel.available) {
      expect(reports.lead_funnel.source).toBe('vin-live')
      expect(reports.lead_funnel.reason).toMatch(/not configured/i)
    }
  })

  it('marks the funnel unavailable on an unrecognized VIN response shape', async () => {
    readStudioConfig.mockReturnValue(configWithScopes(['vin']))
    callCentralMcpTool.mockResolvedValue({ ok: true, data: { weird: 1 } })
    const { buildCustomerReports } = await import('@/server/customer-reports')
    const reports = await buildCustomerReports('serra-honda')
    expect(reports.lead_funnel.available).toBe(false)
  })
})
