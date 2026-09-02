/**
 * PKT-02-01 reports.
 *
 * `buildCustomerReport` — a Honda customer-safe mini-report. It states the measured
 * Sales response findings in plain business language and explains the two checks
 * that are not yet available WITHOUT exposing quarantine mechanics or internal
 * control jargon (no metric ids, no shas, no "pending/withheld/binding/probe/…",
 * no Sales Rep names).
 *
 * `buildInternalCompanion` — the internal evidence companion: full lineage, exact
 * shas, reconciliation, detection rules, source-investigation missing fields, and
 * the UNSENT alert simulations.
 */
import type { Observation, PacketRun } from './engine'

/** Tokens/patterns that must NEVER appear in customer-facing copy. */
export const CUSTOMER_FORBIDDEN: Array<RegExp> = [
  /quarantine/i,
  /source_investigation_pending/i,
  /\bwithheld\b/i,
  /\bbreach\b/i,
  /binding/i,
  /sha256/i,
  /adversarial/i,
  /lifecycle/i,
  /\bprobe\b/i,
  /\bSIP\b/,
  /run_key/i,
  /content_sha/i,
  /disposition/i,
  /SW-0\d\d/,
]

/** Plain, customer-facing labels — metric ids never appear in customer copy. */
const CUSTOMER_LABEL: Record<string, string> = {
  'SW-011': 'Median first-response time (business hours)',
  'SW-012': 'Business-hours leads with no tracked response',
  'SW-015': "Sales reps much slower than the store's typical response",
}

function fmtPercent(value: number): string {
  const pct = value * 100
  const s = pct.toFixed(1)
  return `${s.endsWith('.0') ? s.slice(0, -2) : s}%`
}

function customerLine(o: Observation, rating: string): string {
  const status = rating === 'healthy' ? 'on target' : 'needs attention'
  const label = CUSTOMER_LABEL[o.metric_id] ?? 'Response measure'
  if (o.unit === 'minutes') {
    return `- **${label}:** ${o.value} min — ${status} (target 10 min or less).`
  }
  return `- **${label}:** ${fmtPercent(o.value ?? 0)} of ${
    o.metric_id === 'SW-015' ? 'sales reps' : 'business-hours leads'
  } — ${status} (target: none).`
}

export function buildCustomerReport(run: PacketRun): string {
  const [start, end] = run.period.split('..')
  const ratingOf = (id: string): string =>
    run.evaluations.find((e) => e.metric_id === id)?.rating ?? 'healthy'
  const measured = run.observations.filter((o) => o.status === 'measured')

  const lines: Array<string> = []
  lines.push('# Serra Honda of Sylacauga — Sales Lead Response Summary')
  lines.push('')
  lines.push(`**Rooftop:** Serra Honda of Sylacauga (Sales)`)
  lines.push(`**Week reviewed:** ${start} through ${end}`)
  lines.push('')
  lines.push('## How quickly are new Sales leads being answered?')
  lines.push('')
  for (const o of measured) lines.push(customerLine(o, ratingOf(o.metric_id)))
  lines.push('')
  lines.push('## What these numbers mean')
  lines.push('')
  lines.push(
    'Your typical first-response time is well within a healthy range. The gap to close is ' +
      'consistency: some business-hours leads show no tracked response, and a portion of the ' +
      'sales team responds much more slowly than the store typically does. Evening out ' +
      'coverage — so every lead gets a timely first touch — is the opportunity here.',
  )
  lines.push('')
  lines.push('## Not included in this summary')
  lines.push('')
  lines.push(
    'Two further response checks are **not included** in this summary because the current ' +
      'lead export does not yet capture the information they need:',
  )
  lines.push('')
  lines.push(
    '- Whether after-hours leads get a first reply shortly after the store next opens — this ' +
      'needs the dealership’s **opening hours** and a marker for the first reply from a person.',
  )
  lines.push(
    '- Whether a lead’s first reply was an **automated** message with no follow-up from a ' +
      'person — this needs a marker showing whether each reply was automated or sent by a person.',
  )
  lines.push('')
  lines.push(
    'We have flagged these to be added to a future lead export so they can be reported ' +
      'accurately. We do not estimate or guess these figures from data we do not have.',
  )
  lines.push('')
  return lines.join('\n')
}

export function buildInternalCompanion(run: PacketRun): string {
  const L: Array<string> = []
  L.push('# PKT-02-01 — Internal Evidence Companion')
  L.push('')
  L.push(`- Packet: ${run.packet_id} (module ${run.module})`)
  L.push(`- Dealer: ${run.dealer_id} (Serra Honda of Sylacauga, Sales-only)`)
  L.push(`- Period: ${run.period}`)
  L.push(`- Binding sha256: \`${run.binding_sha256}\``)
  L.push(`- Source sha256: \`${run.source_sha256}\``)
  L.push(`- Engine: ${run.engine_version}; as_of ${run.as_of}`)
  L.push(`- run_key: \`${run.run_key}\``)
  L.push(`- content_sha256: \`${run.content_sha256}\``)
  L.push('')
  L.push('## Evidence delta (raw → normalized)')
  const ed = run.two_delta.evidence_delta
  L.push(
    `- Artifact bytes: ${ed.bytes}; row reconciliation: ${ed.row_reconciliation}`,
  )
  L.push(`- Schema contract sha256: \`${ed.schema_contract_sha256}\``)
  L.push(`- Receipt sha256: \`${ed.receipt_sha256}\``)
  L.push(`- Sales-only proof: ${ed.sales_only_proof}`)
  L.push(`- Missing rule: ${ed.missing_rule}`)
  L.push('')
  L.push('## Per-metric observations & evaluations')
  L.push('')
  L.push(
    '| Metric | Status | Value | Unit | Num | Den | Grade target | Detection | Rating |',
  )
  L.push('|---|---|---|---|---|---|---|---|---|')
  for (const o of run.observations) {
    const e = run.evaluations.find((x) => x.metric_id === o.metric_id)!
    L.push(
      `| ${o.metric_id} | ${o.status} | ${o.value ?? '—'} | ${o.unit} | ${
        o.numerator ?? '—'
      } | ${o.denominator ?? '—'} | ${e.grade_target_id ?? '—'} | ${
        e.detection_rule ?? '—'
      } | ${e.rating} |`,
    )
  }
  L.push('')
  L.push(
    '## Independent reconciliation (recompute == evaluator == persisted accepted)',
  )
  L.push(`- reconciliation.ok: ${run.reconciliation.ok}`)
  for (const m of run.reconciliation.metrics) {
    L.push(
      `- ${m.metric_id}: independent=${m.independent}, evaluator=${m.evaluator}, persisted=${m.persisted_accepted}, match=${m.match}`,
    )
  }
  L.push('')
  L.push('## Source-investigation-pending (no proxy / no derivation)')
  for (const o of run.observations.filter((x) => x.source_investigation)) {
    const inv = o.source_investigation!
    L.push(`- ${o.metric_id}: ${inv.disposition}`)
    L.push(`  - missing fields: ${inv.missing_fields.join(', ')}`)
    L.push(`  - evidence: ${inv.evidence}`)
  }
  L.push('')
  L.push('## Alert simulations (UNSENT — no delivery, no email, no schedule)')
  for (const a of run.alert_simulations) {
    L.push(
      `- ${a.metric_id}: would_fire=${a.would_fire}, delivered=${a.delivered}, channel=${a.channel} — ${a.message}`,
    )
  }
  L.push('')
  return L.join('\n')
}
