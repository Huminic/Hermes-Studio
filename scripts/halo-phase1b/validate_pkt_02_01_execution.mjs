/**
 * PKT-02-01 execution validator (governance evidence generator).
 *
 * Re-checks the COMMITTED execution evidence against the frozen authorities without
 * re-running the engine: frozen binding sha + packet authority pointer; the run
 * manifest values/statuses; independent reconciliation; deterministic content hash
 * (tamper check); customer-report jargon absence; alert non-delivery; lifecycle
 * partition; missing-not-zero invariant; source-investigation pending fields.
 *
 * Emits PKT-02-01_EXECUTION_CHECKS.json and exits non-zero on any error.
 *
 * Usage: node scripts/halo-phase1b/validate_pkt_02_01_execution.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const REPO = process.cwd()
const EVID = path.join(
  REPO,
  'docs/halo/evidence/honda-watchdog/phase1b/pkt-02-01',
)
const FROZEN_BINDING_SHA =
  '1c1c98a2e7b3be8d10eea9495861b7a33e65a00020ab7c9e756da363b69f2082'
const CANONICAL_BINDING_REF =
  'docs/halo/contract/phase1b/pkt-02-01-binding.json'
const FROZEN_SOURCE_SHA =
  '39f0577400c912b8e0f0db4a37a35726c1a460c32df88f231aaa39aff9d100ae'

const errors = []
const checks = []
const ok = (name, cond, detail = '') => {
  checks.push({ name, pass: !!cond, detail })
  if (!cond) errors.push(`${name}${detail ? `: ${detail}` : ''}`)
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const sha256 = (s) => createHash('sha256').update(s).digest('hex')
function canonicalize(v) {
  if (Array.isArray(v)) return v.map(canonicalize)
  if (v && typeof v === 'object') {
    const o = {}
    for (const k of Object.keys(v).sort())
      if (v[k] !== undefined) o[k] = canonicalize(v[k])
    return o
  }
  return v
}
const canonicalJson = (v) => JSON.stringify(canonicalize(v))

// 1. Frozen binding sha + packet authority pointer.
const bindingBytes = fs.readFileSync(path.join(REPO, CANONICAL_BINDING_REF))
ok(
  'binding_frozen_sha',
  sha256(bindingBytes) === FROZEN_BINDING_SHA,
  sha256(bindingBytes),
)
const packet = readJson(
  path.join(REPO, 'docs/halo/contract/phase1b/packets/PKT-02-01.json'),
)
ok(
  'packet_authority_ref',
  packet.authority_binding?.ref === CANONICAL_BINDING_REF,
  packet.authority_binding?.ref,
)
ok(
  'packet_authority_sha',
  packet.authority_binding?.sha256 === FROZEN_BINDING_SHA,
)

// 2. Committed run manifest present.
const manPath = path.join(EVID, 'PKT-02-01_run_manifest.json')
ok('run_manifest_present', fs.existsSync(manPath))
if (fs.existsSync(manPath)) {
  const man = readJson(manPath)
  const c = man.content
  ok('manifest_packet_id', c.packet_id === 'PKT-02-01')
  ok('manifest_period', c.period === '2026-08-24..2026-08-30', c.period)
  ok('manifest_binding_sha', c.binding_sha256 === FROZEN_BINDING_SHA)
  ok('manifest_source_sha', c.source_sha256 === FROZEN_SOURCE_SHA)

  // deterministic content hash (tamper detection)
  ok(
    'content_sha256_integrity',
    sha256(canonicalJson(c)) === man.content_sha256,
    `${sha256(canonicalJson(c))} vs ${man.content_sha256}`,
  )

  const obs = Object.fromEntries(c.observations.map((o) => [o.metric_id, o]))
  const evl = Object.fromEntries(c.evaluations.map((e) => [e.metric_id, e]))

  // measured values (exact)
  ok('SW-011_value', obs['SW-011'].value === 6)
  ok(
    'SW-011_num_den',
    obs['SW-011'].numerator === 27 && obs['SW-011'].denominator === 76,
  )
  ok(
    'SW-011_missing_not_zero',
    obs['SW-011'].numerator + obs['SW-011'].missing ===
      obs['SW-011'].denominator,
  )
  ok('SW-012_value', obs['SW-012'].value === 0.19736842105263158)
  ok(
    'SW-012_num_den',
    obs['SW-012'].numerator === 15 && obs['SW-012'].denominator === 76,
  )
  ok('SW-015_value', obs['SW-015'].value === 0.5)
  ok(
    'SW-015_num_den',
    obs['SW-015'].numerator === 2 && obs['SW-015'].denominator === 4,
  )

  // ratings
  ok('SW-011_healthy', evl['SW-011'].rating === 'healthy')
  ok('SW-012_breach', evl['SW-012'].rating === 'breach')
  ok('SW-015_breach', evl['SW-015'].rating === 'breach')

  // pending withheld (never graded, never fabricated)
  for (const id of ['SW-013', 'SW-014']) {
    ok(`${id}_pending`, obs[id].status === 'source_investigation_pending')
    ok(`${id}_value_null`, obs[id].value === null)
    ok(
      `${id}_withheld`,
      evl[id].gradable_state === 'withheld' && evl[id].rating === 'withheld',
    )
    ok(
      `${id}_missing_fields`,
      Array.isArray(obs[id].source_investigation?.missing_fields) &&
        obs[id].source_investigation.missing_fields.length > 0,
    )
  }

  // reconciliation
  ok('reconciliation_ok', c.reconciliation.ok === true)
  for (const m of c.reconciliation.metrics) {
    ok(
      `reconcile_${m.metric_id}`,
      m.independent === m.evaluator &&
        m.independent === m.persisted_accepted &&
        m.match,
    )
  }

  // alert simulations: measured only, none delivered, none for pending
  const alertIds = c.alert_simulations.map((a) => a.metric_id).sort()
  ok(
    'alerts_measured_only',
    JSON.stringify(alertIds) === JSON.stringify(['SW-011', 'SW-012', 'SW-015']),
  )
  ok(
    'alerts_unsent',
    c.alert_simulations.every(
      (a) => a.delivered === false && a.unsent === true,
    ),
  )

  // lifecycle partition equals the packet
  ok(
    'lifecycle_partition_matches_packet',
    canonicalJson(c.lifecycle_partition) ===
      canonicalJson(packet.lifecycle_partition),
  )

  // no Sales Rep name persisted (structural: no name/identity keys in SW-015 detail)
  const s15keys = Object.keys(obs['SW-015'].detail ?? {})
  ok(
    'no_rep_identity_key',
    !s15keys.some((k) => /name|rep_id|identity/i.test(k)),
  )
}

// 3. Customer report is free of internal control jargon.
const CUSTOMER_FORBIDDEN = [
  /quarantine/i,
  /source_investigation_pending/i,
  /\bwithheld\b/i,
  /\bbreach\b/i,
  /binding/i,
  /sha256/i,
  /adversarial/i,
  /lifecycle/i,
  /\bprobe\b/i,
  /run_key/i,
  /content_sha/i,
  /disposition/i,
  /SW-0\d\d/,
]
// SIP content (held checks + required fields + future-export ask) is internal-only.
const SIP_FORBIDDEN = [
  /after[-\s]?hours?/i,
  /opening/i,
  /next opens?/i,
  /(\+\s*15|\b15\s*min)/i,
  /\bhuman\b/i,
  /(from|by)\s+a\s+(real\s+)?person/i,
  /automat/i,
  /auto[-\s]?repl/i,
  /not\s+(yet\s+)?captur/i,
  /future\s+.*export|lead\s+export|\bexport\b/i,
  /flagged\s+(these|them|to)/i,
  /added\s+to\s+a\b/i,
  /not\s+included|not\s+available|\bunavailable\b/i,
]
const custPath = path.join(EVID, 'PKT-02-01_customer_mini_report.md')
ok('customer_report_present', fs.existsSync(custPath))
if (fs.existsSync(custPath)) {
  const md = fs.readFileSync(custPath, 'utf8')
  const leaks = CUSTOMER_FORBIDDEN.filter((re) => re.test(md)).map(
    (re) => re.source,
  )
  ok('customer_no_jargon', leaks.length === 0, leaks.join(', '))
  const sipLeaks = SIP_FORBIDDEN.filter((re) => re.test(md)).map(
    (re) => re.source,
  )
  ok(
    'customer_measured_only_no_sip',
    sipLeaks.length === 0,
    sipLeaks.join(', '),
  )
  ok(
    'customer_states_period',
    md.includes('2026-08-24') && md.includes('2026-08-30'),
  )
  ok(
    'customer_has_measured',
    md.includes('6 min') && md.includes('19.7%') && md.includes('50%'),
  )
}

// Internal companion RETAINS the SIP facts (they moved here, not deleted).
const compPath = path.join(EVID, 'PKT-02-01_internal_companion.md')
ok('internal_companion_present', fs.existsSync(compPath))
if (fs.existsSync(compPath)) {
  const md = fs.readFileSync(compPath, 'utf8')
  ok(
    'internal_retains_sip_fields',
    md.includes('authoritative_opening_schedule') &&
      md.includes('first_response_actor_classification'),
  )
}

const overall_pass = errors.length === 0
const out = {
  artifact: 'honda-watchdog-pkt-02-01-execution-checks',
  packet_id: 'PKT-02-01',
  frozen_binding_sha256: FROZEN_BINDING_SHA,
  frozen_source_sha256: FROZEN_SOURCE_SHA,
  checks_run: checks.length,
  checks_passed: checks.filter((c) => c.pass).length,
  errors,
  checks,
  adversarial_probe_suite:
    'src/test/pkt-02-01-adversarial.test.ts (9 probes: Service/Parts, dealer isolation, strict-AND, reps_with_numeric denom, missing-not-zero, withholding, frozen thresholds, binding tamper, source tamper)',
  overall_pass,
}
fs.writeFileSync(
  path.join(EVID, 'PKT-02-01_EXECUTION_CHECKS.json'),
  JSON.stringify(out, null, 2) + '\n',
)
process.stdout.write(
  `RESULT: ${overall_pass ? 'PASS' : 'FAIL'} (checks ${out.checks_passed}/${out.checks_run}, errors ${errors.length})\n`,
)
if (!overall_pass) {
  process.stderr.write(errors.join('\n') + '\n')
  process.exit(1)
}
