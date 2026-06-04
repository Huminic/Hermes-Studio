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

function configWithScopes(scopes: Array<string>, vin?: Record<string, unknown>) {
  return {
    config: {
      federation: { read_scopes: scopes },
      // A VIN scope implies the profile's Nexxus org UUID is configured.
      vin: vin ?? (scopes.some((s) => s.includes('vin')) ? { org_id: 'org-uuid-test' } : {}),
    },
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

  it('surfaces calls-in (inbound voice) and texts-out (outbound sms)', async () => {
    const { getOrCreateThread, appendMessage } = await import(
      '@/server/messaging-hub-store'
    )
    const voice = getOrCreateThread({
      profile: 'serra-honda',
      domain: 'sales',
      channel: 'voice',
      contact_handle: '+15555550111',
    })
    appendMessage({
      thread_id: voice.id,
      direction: 'inbound',
      role: 'user',
      channel: 'voice',
      content: 'inbound call',
      author: '+15555550111',
    })
    const sms = getOrCreateThread({
      profile: 'serra-honda',
      domain: 'sales',
      channel: 'sms',
      contact_handle: '+15555550122',
    })
    appendMessage({
      thread_id: sms.id,
      direction: 'outbound',
      role: 'assistant',
      channel: 'sms',
      content: 'follow up',
      author: 'caroline',
    })
    const { buildCustomerReports } = await import('@/server/customer-reports')
    const reports = await buildCustomerReports('serra-honda')
    expect(reports.comms.calls_in).toBe(1)
    expect(reports.comms.texts_out).toBe(1)
  })

  it('reports vin-watcher follow-up performance (ledger + authored sends)', async () => {
    const { getOrCreateThread, appendMessage } = await import(
      '@/server/messaging-hub-store'
    )
    const { openBrain } = await import('@/server/brain-store')
    const { WATCHER_AUTHOR } = await import('@/server/vin-watcher')
    // Seed the per-profile Brain trigger ledger (immediate + checkin).
    const h = openBrain('serra-honda')
    h.exec(
      `CREATE TABLE IF NOT EXISTS vin_watcher_trigger (
         phone TEXT, kind TEXT, ts INTEGER, PRIMARY KEY (phone, kind)
       )`,
    )
    h.run(
      `INSERT INTO vin_watcher_trigger (phone, kind, ts) VALUES (?,?,?)`,
      '+15555550100',
      'immediate',
      1_000,
    )
    h.run(
      `INSERT INTO vin_watcher_trigger (phone, kind, ts) VALUES (?,?,?)`,
      '+15555550101',
      'immediate',
      2_000,
    )
    h.run(
      `INSERT INTO vin_watcher_trigger (phone, kind, ts) VALUES (?,?,?)`,
      '+15555550100',
      'checkin',
      3_000,
    )
    // Seed a watcher-authored outbound hub message.
    const t = getOrCreateThread({
      profile: 'serra-honda',
      domain: 'sales',
      channel: 'sms',
      contact_handle: '+15555550100',
    })
    appendMessage({
      thread_id: t.id,
      direction: 'outbound',
      role: 'assistant',
      channel: 'sms',
      content: 'Hi Pat, this is Caroline…',
      author: WATCHER_AUTHOR,
    })
    const { buildCustomerReports } = await import('@/server/customer-reports')
    const reports = await buildCustomerReports('serra-honda')
    expect(reports.followups.immediate_triggers).toBe(2)
    expect(reports.followups.checkin_triggers).toBe(1)
    expect(reports.followups.last_fire).toBe(3_000)
    expect(reports.followups.sends.outbound).toBe(1)
    expect(reports.followups.sends.by_channel.sms).toBe(1)
  })

  it('reports zero follow-ups when the watcher never ran', async () => {
    const { buildCustomerReports } = await import('@/server/customer-reports')
    const reports = await buildCustomerReports('serra-honda')
    expect(reports.followups.immediate_triggers).toBe(0)
    expect(reports.followups.checkin_triggers).toBe(0)
    expect(reports.followups.last_fire).toBeNull()
    expect(reports.followups.sends.total).toBe(0)
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
      { orgId: 'org-uuid-test' },
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
