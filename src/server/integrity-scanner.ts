/**
 * Integrity scanner — the read-time (cadenced) half of the Semantic Guardian
 * (GAP-KSG-SCANNER-001). The write-time gate (ksg-gate.ts / dsg-gate.ts) blocks
 * bad writes synchronously; this scanner runs periodically over a profile's
 * already-committed wiki and surfaces drift the gate can't catch at write time:
 *
 *   - broken wikilinks   (a [[target]] that no longer resolves)
 *   - orphan pages       (no inbound links; entry pages exempt)
 *   - missing frontmatter (required type + status absent)
 *
 * Shipping this is what flips the *-data-governor SOULs off `status: stub`:
 * the governor now has a real cadenced integrity capability, not just the
 * write-time gate.
 *
 * Findings are classified by severity and (best-effort) memorialized into the
 * profile Brain so they show up in audit + the engagement deployment-notes
 * surface. Memorialization never throws — a missing/locked Brain degrades to a
 * pure in-memory report.
 */

import { scanWikiIntegrity, type WikiIntegrityFindings } from './knowledge-browser'
import { listProfiles } from './profiles-browser'

export type IntegritySeverity = 'clean' | 'info' | 'important'

export type IntegrityReport = {
  profile: string
  scanned_at: number
  pages_scanned: number
  severity: IntegritySeverity
  counts: {
    broken_links: number
    orphans: number
    missing_frontmatter: number
  }
  findings: WikiIntegrityFindings
}

function classify(f: WikiIntegrityFindings): IntegritySeverity {
  if (f.broken_links.length > 0 || f.missing_frontmatter.length > 0)
    return 'important'
  if (f.orphans.length > 0) return 'info'
  return 'clean'
}

/**
 * Best-effort memorialization into the profile Brain. Imported lazily so a
 * portable build / missing Brain never blocks the scan, and wrapped so any
 * failure is swallowed (the report is still returned to the caller).
 */
async function memorialize(report: IntegrityReport): Promise<void> {
  try {
    const { recordAudit } = await import('./metadata-substrate')
    const { insertOutput, insertEvent } = await import('./brain-record-families')
    const { now, uuid } = await import('./brain-store')
    const actor = 'agent:integrity-scanner'
    const gateEventId = uuid()
    recordAudit(report.profile, {
      ts: now(),
      surface: 'brain',
      actor,
      action: 'integrity_scan',
      target_type: 'wiki',
      target_id: report.profile,
      reason: `integrity scan severity=${report.severity} broken=${report.counts.broken_links} orphans=${report.counts.orphans} missing_fm=${report.counts.missing_frontmatter}`,
      outcome: report.severity === 'important' ? 'finding' : 'ok',
      gate_event_id: gateEventId,
    })
    if (report.severity !== 'clean') {
      insertOutput({
        profile: report.profile,
        actor,
        producer_actor: actor,
        output_type: 'integrity_findings',
        content: JSON.stringify(report.findings).slice(0, 8000),
        metadata: { severity: report.severity, counts: report.counts },
        source_refs: [{ kind: 'internal', value: 'integrity-scanner' }],
      })
      insertEvent({
        profile: report.profile,
        actor,
        type: 'integrity_scan',
        source: 'integrity-scanner',
        subject_type: 'wiki',
        subject_id: report.profile,
        payload: { severity: report.severity, counts: report.counts },
        source_refs: [{ kind: 'internal', value: 'integrity-scanner' }],
      })
    }
  } catch {
    // Brain unavailable — report is still valid; memorialization is advisory.
  }
}

/**
 * Run one integrity scan for a profile. `memorializeFindings` (default true)
 * records into the Brain best-effort; pass false in tests to isolate the
 * analysis. `now` is injectable for deterministic tests.
 */
export async function runIntegrityScan(
  profile: string,
  opts: { memorializeFindings?: boolean; now?: number } = {},
): Promise<IntegrityReport> {
  const findings = scanWikiIntegrity(profile)
  const severity = classify(findings)
  const report: IntegrityReport = {
    profile,
    scanned_at: opts.now ?? Date.now(),
    pages_scanned: findings.pages_scanned,
    severity,
    counts: {
      broken_links: findings.broken_links.length,
      orphans: findings.orphans.length,
      missing_frontmatter: findings.missing_frontmatter.length,
    },
    findings,
  }
  if (opts.memorializeFindings !== false) await memorialize(report)
  return report
}

/**
 * Scan every profile. Used by the cadenced cron. A failing profile is skipped
 * (recorded as severity 'clean' with a note would be misleading, so it's simply
 * omitted from the returned array) so one bad profile never blocks the rest.
 */
export async function runIntegrityScanAllProfiles(opts: {
  memorializeFindings?: boolean
  now?: number
} = {}): Promise<Array<IntegrityReport>> {
  const reports: Array<IntegrityReport> = []
  let profiles: Array<{ name: string }> = []
  try {
    profiles = listProfiles()
  } catch {
    return reports
  }
  for (const p of profiles) {
    try {
      reports.push(await runIntegrityScan(p.name, opts))
    } catch {
      // skip a profile that can't be scanned
    }
  }
  return reports
}
