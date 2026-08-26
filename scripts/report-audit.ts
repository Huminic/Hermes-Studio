/**
 * Custom-report audit CLI — audits a store's current metrics against best-practice
 * benchmarks and prints a categorized dealership audit in the report's tentative
 * voice. Read-only. Metrics with no source on this branch (VinSolutions-report
 * families) show "no data"; unsourced-benchmark metrics show "compare to own trend".
 *
 *   pnpm tsx scripts/report-audit.ts --profile=serra-honda --window=30 [--json]
 */
import { resolveMetricValues } from '../src/server/watchdog/metric-values'
import { auditMetrics, type AuditFinding } from '../src/server/reports/report-audit'

const arg = (name: string, dflt = ''): string => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : dflt
}

const profile = arg('profile', 'serra-honda')
const windowDays = Number(arg('window', '30')) || 30
const asJson = process.argv.includes('--json')

const values = resolveMetricValues(profile, windowDays)
const report = auditMetrics(values)

if (asJson) {
  console.log(JSON.stringify(report, null, 2))
  process.exit(0)
}

const badge = (f: AuditFinding): string => {
  switch (f.status) {
    case 'below_target': return '▼ below target'
    case 'above_target': return '▲ above guide'
    case 'within_target': return '✓ within target'
    case 'no_benchmark': return '· no benchmark'
    case 'no_data': return '— no data'
  }
}

console.log(`\nDealership audit — ${profile} · last ${windowDays} days`)
console.log(`Coverage: ${report.covered}/${report.total} metrics have current data\n`)
for (const cat of report.categories) {
  console.log(`## ${cat.category}`)
  for (const f of cat.findings) {
    console.log(`  [${badge(f)}] ${f.label}: ${f.display}${f.target ? `  (target ${f.target})` : ''}`)
    console.log(`      ${f.phrasing}`)
  }
  console.log('')
}
console.log('Note: benchmarks are directional and contested; gross and count metrics are best judged against this dealer’s own trend. Sourced in docs/watchdog-platform/BEST_PRACTICES_AUDIT_REFERENCE.md.\n')
