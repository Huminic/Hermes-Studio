/**
 * Comms preview bundle (AC5/AC6/AC7 wiring — Serra comms recovery).
 *
 * Composes the report/alert/text cores into ONE dry-run artifact for operator
 * review — rollout step 1 ("all test artifacts to Duane: example emails, sample
 * alerts, sample text report"). Pure over injected, already-fetched data, so it
 * is unit-tested without MCP. The live shell (a script) fetches read-only data
 * inside the studio container and calls these — it NEVER sends.
 */
import {
  buildDailyManagementReport,
  type DailyMgmtMetrics,
  type DailyMgmtReport,
} from './daily-management-report'
import {
  buildLeadSourceReport,
  type SourceSummary,
  type LeadSourceRow,
} from './lead-source-report'
import { buildTextReport, type TextReportInput } from './text-report'
import type { LeadAlertBuckets } from './lead-aging'

export type AlertBundle = LeadAlertBuckets & { staleStatus: string[] }

export type PreviewBundle = {
  profile: string
  date: string
  dailyManagement: DailyMgmtReport
  leadSource: LeadSourceRow[]
  textReport: string
  alerts: AlertBundle
}

export type PreviewInput = {
  profile: string
  date: string
  dailyMetrics: DailyMgmtMetrics
  leadSource: {
    window24h: ReadonlyArray<SourceSummary>
    window7d: ReadonlyArray<SourceSummary>
    window30d: ReadonlyArray<SourceSummary>
    prev24h: ReadonlyArray<SourceSummary>
  }
  textReport: TextReportInput
  alerts: AlertBundle
}

/** Compose all artifacts into one bundle (no I/O, no send). */
export function assemblePreviewBundle(input: PreviewInput): PreviewBundle {
  return {
    profile: input.profile,
    date: input.date,
    dailyManagement: buildDailyManagementReport({
      date: input.date,
      metrics: input.dailyMetrics,
    }),
    leadSource: buildLeadSourceReport(input.leadSource),
    textReport: buildTextReport(input.textReport),
    alerts: input.alerts,
  }
}

/** Render the bundle as a plain-text preview for the operator to eyeball. */
export function renderPreviewText(b: PreviewBundle): string {
  const out: string[] = []
  out.push(`### ${b.dailyManagement.title} — ${b.profile} — ${b.date}`)
  for (const l of b.dailyManagement.lines) out.push(`  ${l.label}: ${l.value}`)
  out.push(`  (${b.dailyManagement.footnote})`)
  out.push('')
  out.push(`### Lead Source Report — ${b.profile}`)
  out.push('  source | 24h | 7d | 30d | sold24h | Δleads | Δsold')
  for (const r of b.leadSource) {
    out.push(
      `  ${r.source} | ${r.leads24h} | ${r.leads7d} | ${r.leads30d} | ${r.sold24h} | ${r.leadsDelta} | ${r.soldDelta}`,
    )
  }
  out.push('')
  out.push('### Nightly Text Report')
  out.push(`  ${b.textReport}`)
  out.push('')
  out.push('### Alerts (sample counts)')
  out.push(`  No status: ${b.alerts.noStatus.length}`)
  out.push(`  Unactioned >5 min: ${b.alerts.unactionedOver5Min.length}`)
  out.push(`  Sitting >3 days: ${b.alerts.sittingOver3Days.length}`)
  out.push(`  Same status >1 week: ${b.alerts.staleStatus.length}`)
  return out.join('\n')
}
