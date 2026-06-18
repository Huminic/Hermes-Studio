import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ingestReport } from '@/server/report-ingest'
import {
  buildFunnelTab,
  buildPipelineTab,
  buildAiActivityTab,
  buildObservation,
  type Metric,
} from '@/server/dashboard-metrics'

let tmpHome: string

beforeEach(async () => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-metrics-test-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  delete process.env.BRAIN_PROFILES_ROOT
  const mod = await import('@/server/messaging-hub-store')
  mod._resetForTests()
})

afterEach(() => {
  vi.restoreAllMocks()
  try {
    fs.rmSync(tmpHome, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
})

const ROI_CSV = [
  'Dealer,Lead_Source,Total_Leads,Good_Leads,Bad_Leads,Duplicate_Leads,Bad_Other_Leads,Customers_Influenced,Sold_in_Timeframe,Sold_in_Timeframe_Pct,Sold_from_Leads,Sold_from_Leads_Pct,Avg_Days_to_Sale,Internet_Attempted_Contact,Internet_Attempted_Contact_Pct,Internet_Actual_Contact,Internet_Actual_Contact_Pct,Internet_Avg_Attempts_to_Contact,Appts_Set,Appts_Set_Pct,Appts_Scheduled,Appts_Scheduled_Pct,Appts_Confirmed,Appts_Confirmed_Pct,Appts_Shown,Appts_Shown_Pct,Avg_Days_to_Appt_Set,Total_Visits,Initial_Visits,Be_Back_Visits,Avg_Days_to_Initial_Visit,Avg_Days_Initial_Visit_to_Be_Back,Total_Front_Gross,Avg_Front_Gross,Total_Back_Gross,Avg_Back_Gross,Total_Gross,Avg_Gross,Total_Cost,Cost_Per_Good_Lead,Cost_Per_Sold,Profit',
  'Serra Honda of Sylacauga,Repeat Customer,100,80,20,0,0,0,25,25%,20,20%,4.0,4,100%,4,100%,0.0,30,30%,27,27%,24,88%,20,74%,6.0,42,42,0,1.5,0.0,"$6,000.00",$200,"$24,000.00",$900,"$30,000.00","$1,200.00",$0.00,$0.00,$0.00,"$30,000.00"',
  'Serra Honda of Sylacauga,Autoweb,50,30,20,0,0,0,5,10%,4,8%,10.0,30,100%,20,66%,4.0,10,20%,9,18%,8,88%,6,66%,12.0,3,3,0,4.0,0.0,$0.00,$0.00,$0.00,$0.00,$0.00,$0.00,$0.00,$0.00,$0.00,$0.00',
].join('\n')

const KPI_CSV = [
  'Dealer,Lead_Type,Salesperson,Internet_Leads,Internet_Leads_Sold_Pct,Internet_Actual_Contact,Internet_Actual_Contact_Pct,Appts_Set,Appts_Set_Pct,Appts_Shown,Appts_Shown_Pct,Appts_Shown_Sold,Appts_Shown_Sold_Pct,Calls_Out,Emails_Out,Texts_Out,Total_Comms',
  'Serra Honda of Sylacauga,Internet,Brandon Donald,26,12%,24,92%,5,4%,10,91%,3,30%,49,526,713,"1,352"',
  'Serra Honda of Sylacauga,Phone,Brandon Donald,4,0%,3,75%,1,25%,1,100%,1,100%,5,2,3,10',
  'Serra Honda of Sylacauga,Internet,Caleb Jones,26,0%,19,73%,1,4%,5,71%,0,0%,380,585,682,"1,800"',
].join('\n')

function seedReports(profile = 'fixture') {
  const r1 = ingestReport({
    profile,
    text: ROI_CSV,
    filename: 'roi_2026-05-13.csv',
    dealerName: 'Serra Honda',
    checksum: 'roi-1',
  })
  const r2 = ingestReport({
    profile,
    text: KPI_CSV,
    filename: 'kpi_2026-05-13.csv',
    dealerName: 'Serra Honda',
    checksum: 'kpi-1',
  })
  expect(r1.ok && r2.ok).toBe(true)
}

describe('buildFunnelTab', () => {
  it('sources real metrics and marks absent ones data source pending', () => {
    seedReports()
    const tab = buildFunnelTab('fixture')

    expect(tab.lead_performance).toHaveLength(7)
    const byKey = Object.fromEntries(tab.lead_performance.map((m) => [m.key, m]))

    // Sourced
    expect(byKey.lead_source_performance.status).toBe('sourced')
    expect(byKey.lead_source_performance.value).toBe(150) // 100 + 50
    expect(byKey.total_sales.value).toBe(24) // 20 + 4
    expect(byKey.time_to_sale.status).toBe('sourced')
    // lead-weighted avg days to sale: (4*100 + 10*50)/150 = 6
    expect(byKey.time_to_sale.value).toBeCloseTo(6, 5)
    expect(byKey.time_to_appt_set.value).toBeCloseTo((6 * 100 + 12 * 50) / 150, 5)

    // Pending (genuinely not in the export)
    expect(byKey.time_to_first_contact.status).toBe('pending')
    expect(byKey.time_to_first_contact.value).toBeNull()
    expect(byKey.time_to_first_discussion.status).toBe('pending')
    expect(byKey.time_to_appointment.status).toBe('pending')

    // Polarity: time metrics are "down = good"
    expect(byKey.time_to_sale.polarity).toBe('down')
    expect(byKey.total_sales.polarity).toBe('up')
  })

  it('builds the blue pipeline funnel stages and ranked lead sources', () => {
    seedReports()
    const tab = buildFunnelTab('fixture')
    const stages = Object.fromEntries(
      tab.pipeline_performance.stages.map((s) => [s.key, s.now]),
    )
    expect(stages.leads).toBe(150)
    expect(stages.opportunities).toBe(110) // 80 + 30 good_leads
    expect(stages.appointments).toBe(40) // 30 + 10
    expect(stages.sales).toBe(24) // 20 + 4
    expect(tab.pipeline_performance.comparison_label).toBe('no prior period')

    expect(tab.lead_sources[0].lead_source).toBe('Repeat Customer') // most leads first
    expect(tab.lead_sources[0].total_leads).toBe(100)
  })

  it('returns all-pending when no report is uploaded', () => {
    const tab = buildFunnelTab('fixture')
    expect(tab.lead_performance.every((m) => m.status === 'pending')).toBe(true)
    expect(tab.lead_sources).toHaveLength(0)
  })
})

describe('buildPipelineTab', () => {
  it('aggregates salesperson rows across lead types', () => {
    seedReports()
    const tab = buildPipelineTab('fixture')
    expect(tab.status).toBe('sourced')
    const brandon = tab.rows.find((r) => r.salesperson === 'Brandon Donald')!
    // Internet + Phone rows summed
    expect(brandon.leads).toBe(30) // 26 + 4
    expect(brandon.opportunities).toBe(27) // 24 + 3
    expect(brandon.appointments).toBe(6) // 5 + 1
    expect(brandon.sales).toBe(4) // 3 + 1
    expect(tab.rows.map((r) => r.salesperson)).toContain('Caleb Jones')
  })

  it('is pending with a reason when no KPI report exists', () => {
    const tab = buildPipelineTab('fixture')
    expect(tab.status).toBe('pending')
    expect(tab.rows).toHaveLength(0)
    expect(tab.reason).toBeTruthy()
  })
})

describe('buildAiActivityTab', () => {
  it('counts live comms into the 9 metrics', async () => {
    const { getOrCreateThread, appendMessage } = await import(
      '@/server/messaging-hub-store'
    )
    const t = getOrCreateThread({
      profile: 'fixture',
      domain: 'sales',
      channel: 'sms',
      contact_handle: '+15551112222',
      assigned_agent_id: 'caroline',
    })
    appendMessage({ thread_id: t.id, direction: 'outbound', role: 'assistant', channel: 'sms', content: 'hi', author: 'caroline' })
    appendMessage({ thread_id: t.id, direction: 'outbound', role: 'assistant', channel: 'sms', content: 'again', author: 'caroline' })
    appendMessage({ thread_id: t.id, direction: 'inbound', role: 'user', channel: 'voice', content: 'call', author: 'cust' })

    const tab = buildAiActivityTab('fixture', { now: Date.now(), windowDays: 30 })
    expect(tab.metrics).toHaveLength(9)
    const byKey = Object.fromEntries(tab.metrics.map((m) => [m.key, m]))
    expect(byKey.texts_sent.value).toBe(2)
    expect(byKey.calls_received.value).toBe(1)
    expect(byKey.conversations.value).toBe(1)
    expect(byKey.hunches.value).toBe(0)
    expect(byKey.infostore_updates.value).toBe(0)
    expect(byKey.texts_sent.status).toBe('sourced')
  })
})

describe('buildObservation', () => {
  const metric = (key: string, value: number, good: boolean | null): Metric => ({
    key,
    label: key,
    unit: 'count',
    value,
    polarity: 'up',
    status: 'sourced',
    source: 'test',
    trend: { current: value, prior: 0, delta: value, direction: 'up', good },
  })

  it('uses conservative, verify-first language and never asserts conclusions', () => {
    const obs = buildObservation([
      metric('conversations', 12, null),
      metric('texts_sent', 30, true),
      metric('web_chats', 2, false),
      metric('hunches', 3, null),
      metric('calls_received', 5, null),
      metric('calls_made', 5, null),
      metric('emails_sent', 5, null),
      metric('video_sessions', 0, null),
    ])
    expect(obs.overview).toMatch(/observations, not conclusions/i)
    expect(obs.what_is_good.length).toBeGreaterThan(0)
    expect(obs.opportunities.join(' ')).toMatch(/might be worth|worth reviewing/i)
  })

  it('handles a zero-activity period without fabricating', () => {
    const obs = buildObservation([
      metric('conversations', 0, null),
      metric('texts_sent', 0, null),
      metric('calls_received', 0, null),
      metric('calls_made', 0, null),
      metric('emails_sent', 0, null),
      metric('web_chats', 0, null),
      metric('video_sessions', 0, null),
      metric('hunches', 0, null),
    ])
    expect(obs.overview).toMatch(/No customer activity/i)
  })
})
