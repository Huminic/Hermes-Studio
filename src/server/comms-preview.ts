/**
 * Comms preview bundle (AC5/AC6/AC7 wiring — Serra comms recovery).
 *
 * Composes the report/alert/text cores into ONE dry-run artifact for operator
 * review — rollout step 1 ("all test artifacts to Duane: example emails, sample
 * alerts, sample text report"). Pure over injected, already-fetched data, so it
 * is unit-tested without MCP. The live shell (a script) fetches read-only data
 * inside the studio container and calls these — it NEVER sends.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
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

/**
 * Per-lead detail the runner attaches to each alert bucket so the report email
 * can render "Needs attention" rows (identity + stats) instead of bare ids
 * (N2.1). Read-only enrichment: firstName/source are resolved from the same VIN
 * data, never invented. Optional so fixture bundles without it still validate.
 */
export type AlertLeadDetail = {
  leadId: string
  firstName: string | null
  source: string | null
  createdUtc: string | null
  leadStatus: string | null
  leadType: string | null
}

export type AlertBundle = LeadAlertBuckets & {
  staleStatus: string[]
  /** Per-bucket enriched rows (N2.1); absent in older/fixture bundles. */
  details?: {
    noStatus: AlertLeadDetail[]
    unactionedOver5Min: AlertLeadDetail[]
    sittingOver3Days: AlertLeadDetail[]
  }
}

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

/**
 * Free-form provenance the runner attaches so a supervisor can reconcile every
 * figure by hand (raw counts, ISO window bounds, the query used, any caveats).
 */
export type PreviewRawCounts = Record<string, unknown>

/** Injected file writer (default: fs.writeFileSync) — kept injectable for tests. */
export type WriteFileFn = (path: string, contents: string) => void

/**
 * Write the six preview artifacts for `input.profile` into `outDir`. Pure over
 * the injected bundle input + rawCounts; the writer is injectable, so this never
 * touches the network and never sends. Returns the paths written.
 */
export function writePreviewArtifacts(input: {
  bundle: PreviewInput
  outDir: string
  rawCounts: PreviewRawCounts
  writeFile?: WriteFileFn
}): { files: string[] } {
  const bundle = assemblePreviewBundle(input.bundle)
  const write = input.writeFile ?? ((p: string, c: string) => writeFileSync(p, c))
  const profile = input.bundle.profile
  const files: string[] = []
  const emit = (suffix: string, contents: string) => {
    const path = join(input.outDir, `${profile}-${suffix}`)
    write(path, contents)
    files.push(path)
  }
  const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n'
  emit('preview.txt', renderPreviewText(bundle) + '\n')
  emit('daily-management.json', json(bundle.dailyManagement))
  emit('lead-source.json', json(bundle.leadSource))
  emit('text-report.txt', bundle.textReport + '\n')
  emit('alerts.json', json(bundle.alerts))
  emit('raw-counts.json', json(input.rawCounts))
  return { files }
}
