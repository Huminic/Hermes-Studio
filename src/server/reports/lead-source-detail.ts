/**
 * "Detailed Lead-Source" report — deeper than the dashboard's lead-source table.
 *
 * Reads the most-recent ingested Lead-Source ROI report (report_lead_source_roi,
 * populated by report-ingest) and derives per-source funnel + efficiency metrics:
 * contact rate, appt-set rate, show rate, close rate, gross/lead, good-lead %.
 * Ranks by gross and flags high-volume/low-close sources as opportunities.
 *
 * NO live-VIN dependency (so it never blocks on a broker timeout). When no report
 * has been uploaded, returns { available:false } and the HTML says so — never
 * fabricates. Generic per-profile.
 */

import { openBrain } from '../brain-store'
import type { RoiRow } from '../dashboard-metrics'

export type LeadSourceDetailRow = RoiRow & {
  contact_rate: number | null
  appt_set_rate: number | null
  show_rate: number | null
  close_rate: number | null
  gross_per_lead: number | null
  good_lead_pct: number | null
}

export type LeadSourceDetailReport =
  | {
      profile: string
      generated_at: number
      available: true
      period_start: string | null
      total_leads: number
      total_sold: number
      total_gross: number
      rows: Array<LeadSourceDetailRow>
      opportunities: Array<string>
    }
  | { profile: string; generated_at: number; available: false; reason: string }

function pct(n: number | null | undefined, d: number | null | undefined): number | null {
  if (!n || !d || d <= 0) return null
  return Math.round((n / d) * 1000) / 10
}
function per(n: number | null | undefined, d: number | null | undefined): number | null {
  if (n == null || !d || d <= 0) return null
  return Math.round((n / d) * 100) / 100
}

export function buildLeadSourceDetail(
  profile: string,
  opts: { now?: number } = {},
): LeadSourceDetailReport {
  const now = opts.now ?? Date.now()
  const handle = openBrain(profile)
  try {
    let imp: { id: string; period_start: string | null } | null = null
    let raw: Array<RoiRow> = []
    try {
      imp =
        handle.get<{ id: string; period_start: string | null }>(
          `SELECT id, period_start FROM report_imports WHERE report_kind = 'lead_source_roi'
           ORDER BY (period_start IS NULL), period_start DESC, ts DESC LIMIT 1`,
        ) ?? null
      if (imp) {
        raw = handle.all<RoiRow>(
          `SELECT lead_source, total_leads, good_leads, customers_influenced,
                  sold_in_timeframe, sold_from_leads, sold_from_leads_pct,
                  avg_days_to_sale, avg_days_to_appt_set, internet_actual_contact,
                  appts_set, appts_shown, total_gross
             FROM report_lead_source_roi WHERE import_id = ?`,
          imp.id,
        )
      }
    } catch {
      /* tables not present yet → treated as no-report below */
    }
    if (!imp || raw.length === 0) {
      return {
        profile,
        generated_at: now,
        available: false,
        reason: 'No lead-source report uploaded yet — upload a Lead-Source ROI report in InfoStore.',
      }
    }

    const rows: Array<LeadSourceDetailRow> = raw.map((r) => ({
      ...r,
      contact_rate: pct(r.internet_actual_contact, r.total_leads),
      appt_set_rate: pct(r.appts_set, r.total_leads),
      show_rate: pct(r.appts_shown, r.appts_set),
      close_rate: pct(r.sold_from_leads, r.total_leads),
      gross_per_lead: per(r.total_gross, r.total_leads),
      good_lead_pct: pct(r.good_leads, r.total_leads),
    }))
    rows.sort((a, b) => (b.total_gross ?? 0) - (a.total_gross ?? 0))

    const sum = (f: (r: RoiRow) => number | null) =>
      raw.reduce((t, r) => t + (f(r) ?? 0), 0)

    // Opportunities: high volume (>= median leads) but low close (< half the avg close rate).
    const closeRates = rows.map((r) => r.close_rate ?? 0)
    const avgClose = closeRates.reduce((a, b) => a + b, 0) / Math.max(1, closeRates.length)
    const leadCounts = raw.map((r) => r.total_leads ?? 0).sort((a, b) => a - b)
    const medianLeads = leadCounts[Math.floor(leadCounts.length / 2)] ?? 0
    const opportunities = rows
      .filter((r) => (r.total_leads ?? 0) >= medianLeads && (r.close_rate ?? 0) < avgClose / 2 && (r.total_leads ?? 0) > 0)
      .map(
        (r) =>
          `${r.lead_source}: ${r.total_leads} leads but only ${r.close_rate ?? 0}% close (avg ${Math.round(avgClose * 10) / 10}%) — worth reviewing`,
      )

    return {
      profile,
      generated_at: now,
      available: true,
      period_start: imp.period_start,
      total_leads: sum((r) => r.total_leads),
      total_sold: sum((r) => r.sold_from_leads),
      total_gross: sum((r) => r.total_gross),
      rows,
      opportunities,
    }
  } finally {
    handle.close()
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
const n = (v: number | null | undefined) => (v == null ? '—' : String(v))
const p = (v: number | null | undefined) => (v == null ? '—' : `${v}%`)
const money = (v: number | null | undefined) =>
  v == null ? '—' : `$${Math.round(v).toLocaleString('en-US')}`

export function renderLeadSourceDetailHtml(report: LeadSourceDetailReport): string {
  const head = (body: string) => `<!doctype html><html><head><meta charset="utf-8">
<title>Lead-Source Detail — ${esc(report.profile)}</title>
<style>
 body{font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;max-width:980px;margin:2rem auto;padding:0 1rem}
 h1{font-size:22px;margin:0 0 .25rem}.sub{color:#64748b;margin:0 0 1.25rem}
 table{width:100%;border-collapse:collapse;font-size:13px}
 th,td{text-align:right;padding:.4rem .5rem;border-bottom:1px solid #e2e8f0}
 th:first-child,td:first-child{text-align:left}
 th{color:#475569;font-weight:600;position:sticky;top:0;background:#fff}
 .op{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:.6rem 1rem;margin:.4rem 0}
 .foot{color:#94a3b8;font-size:12px;margin-top:2rem}
</style></head><body>${body}
<p class="foot">Observations, not conclusions — verify against your own records.</p></body></html>`

  if (!report.available) {
    return head(
      `<h1>Lead-Source Detail — ${esc(report.profile)}</h1><p class="sub">${esc(report.reason)}</p>`,
    )
  }
  const rows = report.rows
    .map(
      (r) =>
        `<tr><td>${esc(r.lead_source)}</td><td>${n(r.total_leads)}</td><td>${p(r.good_lead_pct)}</td><td>${p(r.contact_rate)}</td><td>${p(r.appt_set_rate)}</td><td>${p(r.show_rate)}</td><td>${n(r.sold_from_leads)}</td><td>${p(r.close_rate)}</td><td>${money(r.total_gross)}</td><td>${money(r.gross_per_lead)}</td></tr>`,
    )
    .join('')
  const ops = report.opportunities.length
    ? report.opportunities.map((o) => `<div class="op">${esc(o)}</div>`).join('')
    : '<p class="sub">No obvious high-volume/low-close sources this period.</p>'
  return head(`
  <h1>Lead-Source Detail — ${esc(report.profile)}</h1>
  <p class="sub">Per-source funnel &amp; ROI · period ${esc(report.period_start ?? 'latest upload')} ·
    ${report.total_leads} leads · ${report.total_sold} sold · ${money(report.total_gross)} gross</p>
  <table><thead><tr>
    <th>Source</th><th>Leads</th><th>Good%</th><th>Contact%</th><th>Appt-set%</th><th>Show%</th><th>Sold</th><th>Close%</th><th>Gross</th><th>$/lead</th>
  </tr></thead><tbody>${rows}</tbody></table>
  <h2 style="font-size:16px;margin:1.5rem 0 .5rem">Opportunities</h2>
  ${ops}`)
}
