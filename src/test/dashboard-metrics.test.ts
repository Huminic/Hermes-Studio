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
  buildWidgetUsage,
  type Metric,
  type LeadSourceRow,
} from '@/server/dashboard-metrics'
import type { OpportunitySummary } from '@/server/lead-opportunities'

/** Synthetic API opportunity summary — the defensible Leads counts. */
function opp(
  bySource: Array<{ lead_source: string; opportunities: number }>,
  sold = 0,
): OpportunitySummary {
  const total = bySource.reduce((a, b) => a + b.opportunities, 0)
  return {
    raw_total: total,
    opportunities: total,
    sold,
    by_source: bySource,
    dropped: { non_sales: 0, bad: 0, duplicates: 0, no_contact: 0, unrecognized_types: [] },
  }
}

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
  it('builds a lead conversion funnel + timings, marking absent timings pending', () => {
    seedReports()
    // Leads count comes from the API (metric-split); the report supplies the
    // downstream stages + timings.
    const tab = buildFunnelTab('fixture', {
      opportunities: opp([
        { lead_source: 'Repeat Customer', opportunities: 100 },
        { lead_source: 'Autoweb', opportunities: 50 },
      ]),
    })

    // Conversion funnel stages: Leads from API, the rest from the report.
    const stages = Object.fromEntries(tab.lead_performance.stages.map((s) => [s.key, s]))
    expect(stages.leads.now).toBe(150) // API opportunities (100 + 50)
    expect(stages.contacted.now).toBe(24) // 4 + 20 internet_actual_contact
    expect(stages.appt_set.now).toBe(40) // 30 + 10
    expect(stages.appt_shown.now).toBe(26) // 20 + 6 appts_shown
    expect(stages.sold.now).toBe(24) // 20 + 4
    expect(stages.leads.conversion).toBeNull() // first layer
    // Contacted sits under the API Leads stage — no defensible cross-source %.
    expect(stages.contacted.conversion).toBeNull()
    // Report→report conversion is computed: appts set / contacted.
    expect(stages.appt_set.conversion).toBeCloseTo(40 / 24, 4)

    // Secondary timings: sourced ones present, absent ones pending.
    const t = Object.fromEntries(tab.lead_performance.timings.map((m) => [m.key, m]))
    expect(t.time_to_sale.status).toBe('sourced')
    expect(t.time_to_sale.value).toBeCloseTo(6, 5) // (4*100 + 10*50)/150
    expect(t.time_to_appt_set.value).toBeCloseTo((6 * 100 + 12 * 50) / 150, 5)
    expect(t.time_to_sale.polarity).toBe('down')
    expect(t.time_to_first_contact.status).toBe('pending')
    expect(t.time_to_first_contact.value).toBeNull()
    expect(t.time_to_first_discussion.status).toBe('pending')
    expect(t.time_to_appointment.status).toBe('pending')
  })

  it('builds the blue pipeline funnel stages and ranked lead sources', () => {
    seedReports()
    const tab = buildFunnelTab('fixture', {
      opportunities: opp([
        { lead_source: 'Repeat Customer', opportunities: 100 },
        { lead_source: 'Autoweb', opportunities: 50 },
      ]),
    })
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
    expect(tab.lead_performance.stages.every((s) => s.status === 'pending')).toBe(true)
    expect(tab.lead_performance.timings.every((m) => m.status === 'pending')).toBe(true)
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

  it('weaves table continuity: top source in good, alarm source in opportunities', () => {
    const leadSources = [
      { lead_source: 'Repeat Customer', sold_from_leads: 24, rating: 'good', total_leads: 100 },
      { lead_source: 'Thirdparty Honda', sold_from_leads: 0, rating: 'alarm', total_leads: 71 },
    ] as unknown as Array<LeadSourceRow>
    const obs = buildObservation([metric('conversations', 5, null)], {
      leadSources,
      pipelineRows: [
        { salesperson: 'Brandon', leads: 26, opportunities: 24, appointments: 1, sales: 3, alarm: false, trend: { current: 3, prior: 0, delta: 3, direction: 'up', good: true } },
        { salesperson: 'Caleb', leads: 26, opportunities: 19, appointments: 1, sales: 0, alarm: true, trend: { current: 0, prior: 0, delta: 0, direction: 'flat', good: null } },
      ],
    })
    expect(obs.what_is_good.join(' ')).toMatch(/Repeat Customer.*top-selling/i)
    expect(obs.what_is_good.join(' ')).toMatch(/Brandon leads the team/i)
    expect(obs.opportunities.join(' ')).toMatch(/Thirdparty Honda.*no sales/i)
    expect(obs.opportunities.join(' ')).toMatch(/leads but no sales yet/i)
  })
})

const RATING_CSV = [
  'Dealer,Lead_Source,Total_Leads,Good_Leads,Bad_Leads,Duplicate_Leads,Bad_Other_Leads,Customers_Influenced,Sold_in_Timeframe,Sold_in_Timeframe_Pct,Sold_from_Leads,Sold_from_Leads_Pct,Avg_Days_to_Sale,Internet_Attempted_Contact,Internet_Attempted_Contact_Pct,Internet_Actual_Contact,Internet_Actual_Contact_Pct,Internet_Avg_Attempts_to_Contact,Appts_Set,Appts_Set_Pct,Appts_Scheduled,Appts_Scheduled_Pct,Appts_Confirmed,Appts_Confirmed_Pct,Appts_Shown,Appts_Shown_Pct,Avg_Days_to_Appt_Set,Total_Visits,Initial_Visits,Be_Back_Visits,Avg_Days_to_Initial_Visit,Avg_Days_Initial_Visit_to_Be_Back,Total_Front_Gross,Avg_Front_Gross,Total_Back_Gross,Avg_Back_Gross,Total_Gross,Avg_Gross,Total_Cost,Cost_Per_Good_Lead,Cost_Per_Sold,Profit',
  // good: 30% sold (above store avg)
  'Serra Honda of Sylacauga,Repeat Customer,100,90,10,0,0,0,30,30%,30,30%,4.0,4,100%,4,100%,0.0,40,40%,30,30%,24,80%,20,74%,6.0,42,42,0,1.5,0.0,"$30,000.00",$300,"$0.00",$0,"$30,000.00","$1,000.00",$0.00,$0.00,$0.00,"$30,000.00"',
  // alarm: 20 leads, 0 sold
  'Serra Honda of Sylacauga,Dead Source,20,5,15,0,0,0,0,0%,0,0%,0.0,5,100%,2,40%,3.0,1,5%,1,5%,0,0%,0,0%,9.0,0,0,0,0,0,$0.00,$0.00,$0.00,$0.00,$0.00,$0.00,$0.00,$0.00,$0.00,$0.00',
].join('\n')

describe('lead-source rating + pipeline conversion', () => {
  it('rates sources (good / alarm) and computes pipeline conversions', () => {
    ingestReport({
      profile: 'fixture',
      text: RATING_CSV,
      filename: 'roi_2026-05-13.csv',
      dealerName: 'Serra Honda',
      checksum: 'rating-1',
    })
    const tab = buildFunnelTab('fixture', {
      opportunities: opp([
        { lead_source: 'Repeat Customer', opportunities: 100 },
        { lead_source: 'Dead Source', opportunities: 20 },
      ]),
    })
    const bySrc = Object.fromEntries(tab.lead_sources.map((r) => [r.lead_source, r]))
    expect(bySrc['Repeat Customer'].rating).toBe('good')
    expect(bySrc['Dead Source'].rating).toBe('alarm')

    const stages = tab.pipeline_performance.stages
    expect(stages[0].conversion).toBeNull() // first layer (API Leads), no conversion
    // Opportunities sits under the API Leads stage — no defensible cross-source %.
    expect(stages[1].conversion).toBeNull()
    // Sales (30+0) / Appointments (40+1) — report→report conversion.
    expect(stages[3].conversion).toBeCloseTo(30 / 41, 4)
  })
})

describe('buildWidgetUsage', () => {
  it('counts inbound engagements per widget surface', async () => {
    const { getOrCreateThread, appendMessage } = await import(
      '@/server/messaging-hub-store'
    )
    const mk = (channel: string, handle: string) => {
      const t = getOrCreateThread({
        profile: 'fixture',
        domain: 'sales',
        channel,
        contact_handle: handle,
        assigned_agent_id: 'caroline',
      })
      appendMessage({ thread_id: t.id, direction: 'inbound', role: 'user', channel, content: 'hi', author: handle })
    }
    mk('chat', '+1a')
    mk('chat', '+1b')
    mk('form', '+1c')
    mk('video', '+1d')

    const widgets = buildWidgetUsage('fixture', { now: Date.now(), windowDays: 30 })
    const byKey = Object.fromEntries(widgets.map((w) => [w.key, w.engagements]))
    expect(byKey.web_chat).toBe(2)
    expect(byKey.lead_form).toBe(1)
    expect(byKey.video_chat).toBe(1)
    expect(byKey.voice).toBe(0)
  })
})
