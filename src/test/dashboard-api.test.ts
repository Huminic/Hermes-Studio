import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ingestReport } from '@/server/report-ingest'

let tmpHome: string
const PROFILE = 'serra-honda'

beforeEach(async () => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-api-'))
  vi.spyOn(os, 'homedir').mockReturnValue(tmpHome)
  delete process.env.BRAIN_PROFILES_ROOT
  const dir = path.join(tmpHome, '.hermes', 'profiles', PROFILE)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'studio.yaml'),
    'branding:\n  persona_name: Serra Honda\n',
  )
  const mod = await import('@/server/messaging-hub-store')
  mod._resetForTests()
})
afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

const ROI_CSV = [
  'Dealer,Lead_Source,Total_Leads,Good_Leads,Bad_Leads,Duplicate_Leads,Bad_Other_Leads,Customers_Influenced,Sold_in_Timeframe,Sold_in_Timeframe_Pct,Sold_from_Leads,Sold_from_Leads_Pct,Avg_Days_to_Sale,Internet_Attempted_Contact,Internet_Attempted_Contact_Pct,Internet_Actual_Contact,Internet_Actual_Contact_Pct,Internet_Avg_Attempts_to_Contact,Appts_Set,Appts_Set_Pct,Appts_Scheduled,Appts_Scheduled_Pct,Appts_Confirmed,Appts_Confirmed_Pct,Appts_Shown,Appts_Shown_Pct,Avg_Days_to_Appt_Set,Total_Visits,Initial_Visits,Be_Back_Visits,Avg_Days_to_Initial_Visit,Avg_Days_Initial_Visit_to_Be_Back,Total_Front_Gross,Avg_Front_Gross,Total_Back_Gross,Avg_Back_Gross,Total_Gross,Avg_Gross,Total_Cost,Cost_Per_Good_Lead,Cost_Per_Sold,Profit',
  'Serra Honda of Sylacauga,Repeat Customer,100,80,20,0,0,0,25,25%,20,20%,4.0,4,100%,4,100%,0.0,30,30%,27,27%,24,88%,20,74%,6.0,42,42,0,1.5,0.0,"$6,000.00",$200,"$24,000.00",$900,"$30,000.00","$1,200.00",$0.00,$0.00,$0.00,"$30,000.00"',
].join('\n')

async function dashboardHandlers() {
  const { Route } = await import('@/routes/api/customer/dashboard')
  return Route.options.server.handlers
}
async function queryHandlers() {
  const { Route } = await import('@/routes/api/customer/dashboard-queries')
  return Route.options.server.handlers
}

describe('/api/customer/dashboard', () => {
  it('returns all four tabs and surfaces ingested funnel data', async () => {
    ingestReport({
      profile: PROFILE,
      text: ROI_CSV,
      filename: 'roi_2026-05-13.csv',
      dealerName: 'Serra Honda',
      checksum: 'api-roi-1',
    })
    const h = await dashboardHandlers()
    const res = await h.GET({
      request: new Request(
        `http://localhost/api/customer/dashboard?profile=${PROFILE}&window_days=30`,
      ),
    } as never)
    const body = (await res.json()) as {
      ok: boolean
      dashboard: {
        window_days: number
        funnel: { lead_performance: { stages: Array<{ key: string; status: string; now: number | null }> } }
        leads: { source: string }
        pipeline: { status: string }
        ai_activity: { metrics: Array<unknown>; observation: { overview: string } }
      }
    }
    expect(body.ok).toBe(true)
    expect(body.dashboard.window_days).toBe(30)
    const stages = Object.fromEntries(
      body.dashboard.funnel.lead_performance.stages.map((s) => [s.key, s]),
    )
    // Metric-split: Leads come from the live API. VIN scope is absent in this
    // studio.yaml → the API is unavailable → Leads is pending, never fabricated
    // from the report's inflated total_leads.
    expect(stages.leads.status).toBe('pending')
    expect(stages.leads.now).toBeNull()
    // The ingested report still surfaces in the downstream stages.
    expect(stages.contacted.status).toBe('sourced')
    expect(stages.contacted.now).toBe(4) // internet_actual_contact
    expect(stages.sold.now).toBe(20) // sold_from_leads
    // Leads TAB funnel is VIN-live → pending here too.
    expect(body.dashboard.leads.source).toBe('pending')
    expect(body.dashboard.pipeline.status).toBe('pending') // no KPI uploaded
    expect(body.dashboard.ai_activity.metrics).toHaveLength(9)
    expect(body.dashboard.ai_activity.observation.overview).toBeTruthy()
  })

  it('defaults an out-of-range window to 30', async () => {
    const h = await dashboardHandlers()
    const res = await h.GET({
      request: new Request(
        `http://localhost/api/customer/dashboard?profile=${PROFILE}&window_days=999`,
      ),
    } as never)
    const body = (await res.json()) as { dashboard: { window_days: number } }
    expect(body.dashboard.window_days).toBe(30)
  })

  it('400s without a profile', async () => {
    const h = await dashboardHandlers()
    const res = await h.GET({
      request: new Request('http://localhost/api/customer/dashboard'),
    } as never)
    expect(res.status).toBe(400)
  })
})

describe('/api/customer/dashboard-queries', () => {
  it('saves, lists, and deletes saved Ask-AI queries', async () => {
    const h = await queryHandlers()
    const post = await h.POST({
      request: new Request('http://localhost/api/customer/dashboard-queries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: PROFILE, text: 'Which lead source sold the most?' }),
      }),
    } as never)
    const postBody = (await post.json()) as {
      ok: boolean
      query: { id: string; text: string }
      queries: Array<{ id: string }>
    }
    expect(postBody.ok).toBe(true)
    expect(postBody.query.text).toBe('Which lead source sold the most?')
    expect(postBody.queries).toHaveLength(1)

    const list = await h.GET({
      request: new Request(
        `http://localhost/api/customer/dashboard-queries?profile=${PROFILE}`,
      ),
    } as never)
    const listBody = (await list.json()) as { queries: Array<{ id: string }> }
    expect(listBody.queries).toHaveLength(1)

    const del = await h.DELETE({
      request: new Request('http://localhost/api/customer/dashboard-queries', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: PROFILE, id: postBody.query.id }),
      }),
    } as never)
    const delBody = (await del.json()) as { ok: boolean; queries: Array<unknown> }
    expect(delBody.ok).toBe(true)
    expect(delBody.queries).toHaveLength(0)
  })

  it('rejects an empty query', async () => {
    const h = await queryHandlers()
    const post = await h.POST({
      request: new Request('http://localhost/api/customer/dashboard-queries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: PROFILE, text: '   ' }),
      }),
    } as never)
    expect(post.status).toBe(400)
  })
})
