/**
 * "Salesperson Effectiveness" report.
 *
 * Reads the most-recent ingested salesperson KPI report (report_kpi_salesperson,
 * populated by report-ingest) and derives per-rep efficiency: contact rate,
 * appt-set rate, and appts-shown/sold. Ranks by shown/sold. Honest
 * "needs supplemental data" when no KPI report has been uploaded — never
 * fabricates. NO live-VIN dependency. Generic per-profile.
 */

import { openBrain } from '../brain-store'

type KpiRaw = {
  salesperson: string
  internet_leads: number | null
  internet_actual_contact: number | null
  appts_set: number | null
  appts_shown_sold: number | null
}

export type SalespersonRow = KpiRaw & {
  contact_rate: number | null
  appt_set_rate: number | null
  close_rate: number | null
}

export type SalespersonEffectivenessReport =
  | {
      profile: string
      generated_at: number
      available: true
      period_start: string | null
      rows: Array<SalespersonRow>
      totals: { leads: number; contacted: number; appts_set: number; shown_sold: number }
    }
  | { profile: string; generated_at: number; available: false; reason: string }

function pct(n: number | null | undefined, d: number | null | undefined): number | null {
  if (!n || !d || d <= 0) return null
  return Math.round((n / d) * 1000) / 10
}

export function buildSalespersonEffectiveness(
  profile: string,
  opts: { now?: number } = {},
): SalespersonEffectivenessReport {
  const now = opts.now ?? Date.now()
  const handle = openBrain(profile)
  try {
    let imp: { id: string; period_start: string | null } | null = null
    let raw: Array<KpiRaw> = []
    try {
      imp =
        handle.get<{ id: string; period_start: string | null }>(
          `SELECT id, period_start FROM report_imports WHERE report_kind = 'kpi_salesperson'
           ORDER BY (period_start IS NULL), period_start DESC, ts DESC LIMIT 1`,
        ) ?? null
      if (imp) {
        raw = handle.all<KpiRaw>(
          `SELECT salesperson, internet_leads, internet_actual_contact, appts_set, appts_shown_sold
             FROM report_kpi_salesperson WHERE import_id = ?`,
          imp.id,
        )
      }
    } catch {
      /* tables not present → no report */
    }
    if (!imp || raw.length === 0) {
      return {
        profile,
        generated_at: now,
        available: false,
        reason: 'No salesperson KPI report uploaded yet — upload a Salesperson KPI report in InfoStore.',
      }
    }

    const rows: Array<SalespersonRow> = raw.map((r) => ({
      ...r,
      contact_rate: pct(r.internet_actual_contact, r.internet_leads),
      appt_set_rate: pct(r.appts_set, r.internet_leads),
      close_rate: pct(r.appts_shown_sold, r.internet_leads),
    }))
    rows.sort((a, b) => (b.appts_shown_sold ?? 0) - (a.appts_shown_sold ?? 0))

    const sum = (f: (r: KpiRaw) => number | null) => raw.reduce((t, r) => t + (f(r) ?? 0), 0)
    return {
      profile,
      generated_at: now,
      available: true,
      period_start: imp.period_start,
      rows,
      totals: {
        leads: sum((r) => r.internet_leads),
        contacted: sum((r) => r.internet_actual_contact),
        appts_set: sum((r) => r.appts_set),
        shown_sold: sum((r) => r.appts_shown_sold),
      },
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

export function renderSalespersonEffectivenessHtml(report: SalespersonEffectivenessReport): string {
  const head = (body: string) => `<!doctype html><html><head><meta charset="utf-8">
<title>Salesperson Effectiveness — ${esc(report.profile)}</title>
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
      `<h1>Salesperson Effectiveness — ${esc(report.profile)}</h1><p class="sub">${esc(report.reason)}</p>`,
    )
  }
  const rows = report.rows
    .map(
      (r) =>
        `<tr><td>${esc(r.salesperson)}</td><td>${n(r.internet_leads)}</td><td>${p(r.contact_rate)}</td><td>${n(r.appts_set)}</td><td>${p(r.appt_set_rate)}</td><td>${n(r.appts_shown_sold)}</td><td>${p(r.close_rate)}</td></tr>`,
    )
    .join('')
  const t = report.totals
  return head(`
  <h1>Salesperson Effectiveness — ${esc(report.profile)}</h1>
  <p class="sub">Per-rep internet-lead funnel · period ${esc(report.period_start ?? 'latest upload')} ·
    ${t.leads} leads · ${t.contacted} contacted · ${t.appts_set} appts · ${t.shown_sold} shown/sold</p>
  <table><thead><tr>
    <th>Salesperson</th><th>Leads</th><th>Contact%</th><th>Appts set</th><th>Appt-set%</th><th>Shown/Sold</th><th>Close%</th>
  </tr></thead><tbody>${rows}</tbody></table>`)
}
