/**
 * "Store Performance by Pipeline over time" report.
 *
 * Trends store-level pipeline characteristics (leads → appts set → appts shown →
 * sold → gross) across every ingested Lead-Source ROI report period. No new
 * snapshot infrastructure required — each uploaded report is one period; the
 * trend accrues as more periods are uploaded. Fewer than two periods →
 * honest "needs more history". No live-VIN dependency. Generic per-profile.
 */

import { openBrain } from '../brain-store'

export type PeriodPoint = {
  period: string
  leads: number
  appts_set: number
  appts_shown: number
  sold: number
  gross: number
  close_rate: number | null // sold / leads
  appt_set_rate: number | null // appts_set / leads
}

export type StorePerformanceTrendReport =
  | { profile: string; generated_at: number; available: true; points: Array<PeriodPoint> }
  | { profile: string; generated_at: number; available: false; reason: string }

function rate(n: number, d: number): number | null {
  if (!d) return null
  return Math.round((n / d) * 1000) / 10
}

export function buildStorePerformanceTrend(
  profile: string,
  opts: { now?: number } = {},
): StorePerformanceTrendReport {
  const now = opts.now ?? Date.now()
  const handle = openBrain(profile)
  try {
    let rows: Array<{
      period: string | null
      leads: number | null
      appts_set: number | null
      appts_shown: number | null
      sold: number | null
      gross: number | null
    }> = []
    try {
      rows = handle.all(
        `SELECT COALESCE(i.period_start, CAST(i.ts AS TEXT)) AS period,
                SUM(r.total_leads)     AS leads,
                SUM(r.appts_set)       AS appts_set,
                SUM(r.appts_shown)     AS appts_shown,
                SUM(r.sold_from_leads) AS sold,
                SUM(r.total_gross)     AS gross
           FROM report_imports i
           JOIN report_lead_source_roi r ON r.import_id = i.id
          WHERE i.report_kind = 'lead_source_roi'
          GROUP BY i.id
          ORDER BY (i.period_start IS NULL), i.period_start ASC, i.ts ASC`,
      )
    } catch {
      /* tables not present → no history */
    }
    const points: Array<PeriodPoint> = rows.map((r) => {
      const leads = r.leads ?? 0
      return {
        period: r.period ?? 'unknown',
        leads,
        appts_set: r.appts_set ?? 0,
        appts_shown: r.appts_shown ?? 0,
        sold: r.sold ?? 0,
        gross: r.gross ?? 0,
        close_rate: rate(r.sold ?? 0, leads),
        appt_set_rate: rate(r.appts_set ?? 0, leads),
      }
    })
    if (points.length < 2) {
      return {
        profile,
        generated_at: now,
        available: false,
        reason:
          'Not enough history yet — upload Lead-Source ROI reports across at least two periods to see a trend.',
      }
    }
    return { profile, generated_at: now, available: true, points }
  } finally {
    handle.close()
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
const money = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`
const p = (v: number | null) => (v == null ? '—' : `${v}%`)
function arrow(cur: number, prev: number): string {
  if (cur > prev) return `▲`
  if (cur < prev) return `▼`
  return `→`
}

export function renderStorePerformanceTrendHtml(report: StorePerformanceTrendReport): string {
  const head = (body: string) => `<!doctype html><html><head><meta charset="utf-8">
<title>Store Performance Over Time — ${esc(report.profile)}</title>
<style>
 body{font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;max-width:900px;margin:2rem auto;padding:0 1rem}
 h1{font-size:22px;margin:0 0 .25rem}.sub{color:#64748b;margin:0 0 1.25rem}
 table{width:100%;border-collapse:collapse;font-size:13px}
 th,td{text-align:right;padding:.4rem .5rem;border-bottom:1px solid #e2e8f0}
 th:first-child,td:first-child{text-align:left}
 th{color:#475569;font-weight:600}
 .foot{color:#94a3b8;font-size:12px;margin-top:2rem}
</style></head><body>${body}
<p class="foot">Observations, not conclusions — verify against your own records.</p></body></html>`

  if (!report.available) {
    return head(
      `<h1>Store Performance Over Time — ${esc(report.profile)}</h1><p class="sub">${esc(report.reason)}</p>`,
    )
  }
  const rows = report.points
    .map((pt, idx) => {
      const prev = idx > 0 ? report.points[idx - 1] : null
      const soldTrend = prev ? ` ${arrow(pt.sold, prev.sold)}` : ''
      const grossTrend = prev ? ` ${arrow(pt.gross, prev.gross)}` : ''
      return `<tr><td>${esc(pt.period)}</td><td>${pt.leads}</td><td>${pt.appts_set}</td><td>${p(pt.appt_set_rate)}</td><td>${pt.appts_shown}</td><td>${pt.sold}${soldTrend}</td><td>${p(pt.close_rate)}</td><td>${money(pt.gross)}${grossTrend}</td></tr>`
    })
    .join('')
  return head(`
  <h1>Store Performance Over Time — ${esc(report.profile)}</h1>
  <p class="sub">Pipeline by report period · ${report.points.length} periods</p>
  <table><thead><tr>
    <th>Period</th><th>Leads</th><th>Appts set</th><th>Set%</th><th>Shown</th><th>Sold</th><th>Close%</th><th>Gross</th>
  </tr></thead><tbody>${rows}</tbody></table>`)
}
