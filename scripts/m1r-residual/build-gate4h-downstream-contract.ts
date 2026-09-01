/**
 * Gate 4H — DOWNSTREAM customer-contract generator.
 *
 * Turns the already-committed Gate 4E/4F/4G HOLD evidence into three deterministic, aggregate-only,
 * non-PII artifacts. Gate 4H claims ZERO new evaluations: the portfolio stays 17 evaluated / 278
 * unresolved (70 Gate-4E content-HOLD + 86 Gate-4F + 122 Gate-4G).
 *
 *   - gate4h-internal-accountability-ledger.json  (all 295 IDs; full traceable record + domain/route)
 *   - gate4h-downstream-customer-contract.json     (the 242 customer-display-eligible rows + contracts)
 *   - gate4h-crm-devils-advocate-ledger.json       (material-extreme CRM re-check control; 5 seeds)
 *
 * Every count, domain, and eligibility flag is DERIVED from committed artifacts and fails closed on
 * any partition / eligibility / leakage / PII divergence. Byte-identical on rerun. No CSV / message
 * content / identifier is read; no browser or CRM is opened.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { formatJsonFile } from '../m1r-evaluator/serialize'
import type {
  CustomerDomain,
  Domain,
  NormalizedRow,
} from '@/server/reports/residual/gate4h-downstream-contract'
import {
  CLAIM_LAYER_CONTRACT,
  CRM_CHECK_CONTRACT,
  CUSTOMER_DOMAINS,
  FIELD_CLAIM_LAYER,
  GOVERNED_ROOFTOPS,
  OUTSIDE_SALES_BOUNDARY,
  SERVICE_PARTS_DATA,
  WITHHELD_DOMAINS,
  assertCustomerSafe,
  buildCustomerCopy,
  classifyDomain,
  isCustomerDomain,
  renderCrmState,
} from '@/server/reports/residual/gate4h-downstream-contract'

const REPO = process.cwd()
const CONTRACT = path.join(REPO, 'docs/halo/contract')
const OUT = path.join(REPO, 'docs/halo/evidence/m1r/residual')
const CATALOG = path.join(
  CONTRACT,
  'semantic-watchdog-feasibility-matrix-295.json',
)
const CAP_DELTA = path.join(CONTRACT, 'sw295-comm-capability-delta.json')
const GATE4F_MATRIX = path.join(
  CONTRACT,
  'sw295-gate4f-scheduled-residual-matrix.json',
)
const GATE4G_MATRIX = path.join(
  CONTRACT,
  'sw295-gate4g-final-residual-matrix.json',
)
const SPINE = path.join(
  REPO,
  'docs/halo/evidence/m1r/evaluator/spine-summary.json',
)
const COMM_LEDGER = path.join(
  REPO,
  'docs/halo/evidence/m1r/comms/comm-evaluation-ledger.json',
)
const CONTENT_RECON = path.join(
  REPO,
  'docs/halo/evidence/m1r/comms/comm-content-portfolio-reconciliation.json',
)

const ACCEPTED_WEEK = '2026-08-24..2026-08-30'
const CONDITIONS = 295

const sha256File = (p: string) =>
  createHash('sha256').update(fs.readFileSync(p)).digest('hex')
const first16 = (p: string) => sha256File(p).slice(0, 16)

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T
}
function must(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`Gate 4H: ${msg}`)
}
const swIndex = (id: string) => Number.parseInt(id.replace('SW-', ''), 10)

type CatalogRow = {
  metric_id: string
  section: string
  subsection: string
  condition: string
}
type CapDeltaRow = {
  metric_id: string
  section: string
  subsection: string
  category: string
  required_inputs: string
  missing_inputs: string
  join_or_nlp_required: string
}
type Gate4fRow = {
  metric_id: string
  section: string
  subsection: string
  condition: string
  source: string
  blocker_class: string
  primary_blocker: string
  prerequisites: Array<string>
  owner: string
  next_action: string
}
type Gate4gRow = {
  metric_id: string
  section: string
  subsection: string
  condition: string
  source: string
  blocker_class: string
  boundary_lane: string
  primary_blocker: string
  classification: {
    source: string
    field: string
    history: string
    join: string
  }
  owner: string
  next_safe_action: string
  observed_evidence?: {
    metric_ratio?: string
    relation_to_primary_blocker?: string
    observed_denominator_statement?: string
    eligible_denominator_observed?: Record<
      string,
      {
        new_deals: number
        new_negative_front: number
        new_front_blank: number
        denominator_status: string
      }
    >
  }
}

/** Extract the missing-field detail from a committed 4F prerequisites list, if present and clean. */
function missingInputFromPrereqs(prereqs: Array<string>): string | undefined {
  const line = prereqs.find((p) => /^missing_inputs:/i.test(p))
  if (!line) return undefined
  const detail = line.replace(/^missing_inputs:\s*/i, '').trim()
  return detail || undefined
}

async function main(): Promise<void> {
  // ── Load committed artifacts ──
  const catalog = readJson<Array<CatalogRow>>(CATALOG)
  must(catalog.length === CONDITIONS, `catalog length ${catalog.length} != 295`)
  const catById = new Map(catalog.map((r) => [r.metric_id, r]))

  const capDelta = readJson<{ rows: Array<CapDeltaRow> }>(CAP_DELTA)
  const gate4f = readJson<{ rows: Array<Gate4fRow> }>(GATE4F_MATRIX)
  const gate4g = readJson<{ rows: Array<Gate4gRow> }>(GATE4G_MATRIX)
  const spine = readJson<{ evaluated_ids: Array<string> }>(SPINE)
  const comm = readJson<{ evaluated_ids: Array<string> }>(COMM_LEDGER)
  const contentRecon = readJson<{ content_promoted_ids: Array<string> }>(
    CONTENT_RECON,
  )

  // ── Prior evaluated IDs (17) = spine 10 + comm 2 + content 5 ──
  must(
    spine.evaluated_ids.length === 10,
    `spine ${spine.evaluated_ids.length} != 10`,
  )
  must(
    comm.evaluated_ids.length === 2,
    `comm ${comm.evaluated_ids.length} != 2`,
  )
  must(
    contentRecon.content_promoted_ids.length === 5,
    `content promoted ${contentRecon.content_promoted_ids.length} != 5`,
  )
  const evaluatedIds = new Set([
    ...spine.evaluated_ids,
    ...comm.evaluated_ids,
    ...contentRecon.content_promoted_ids,
  ])
  must(evaluatedIds.size === 17, `evaluated union ${evaluatedIds.size} != 17`)

  // ── Gate 4E content-HOLD (70) = capability-delta content candidates (75) − evaluated ──
  const contentCandidates = capDelta.rows.filter(
    (r) => r.category === 'nlp_content_capable_pending',
  )
  must(
    contentCandidates.length === 75,
    `content candidates ${contentCandidates.length} != 75`,
  )
  const contentHold = contentCandidates.filter(
    (r) => !evaluatedIds.has(r.metric_id),
  )
  must(contentHold.length === 70, `content HOLD ${contentHold.length} != 70`)
  must(gate4f.rows.length === 86, `gate4f rows ${gate4f.rows.length} != 86`)
  must(gate4g.rows.length === 122, `gate4g rows ${gate4g.rows.length} != 122`)

  // ── Normalize every unresolved ID (278) + carry the unlock specifics/owner/next ──
  type Extras = {
    unlock_detail?: string
    next_action_raw?: string
    owner_raw?: string
  }
  const normalized: Array<{ row: NormalizedRow; extras: Extras }> = []

  for (const r of contentHold) {
    normalized.push({
      row: {
        metric_id: r.metric_id,
        gate_origin: '4E',
        section: r.section,
        subsection: r.subsection,
        condition: r.required_inputs,
        blocker_class: 'nlp_content_capable_pending',
        primary_blocker: `content/tone analysis required (${r.join_or_nlp_required || 'NLP on Message Content'})`,
      },
      extras: { unlock_detail: r.missing_inputs || undefined },
    })
  }
  for (const r of gate4f.rows) {
    normalized.push({
      row: {
        metric_id: r.metric_id,
        gate_origin: '4F',
        section: r.section,
        subsection: r.subsection,
        condition: r.condition,
        blocker_class: r.blocker_class,
        primary_blocker: r.primary_blocker,
      },
      extras: {
        unlock_detail: missingInputFromPrereqs(r.prerequisites),
        next_action_raw: r.next_action,
        owner_raw: r.owner,
      },
    })
  }
  for (const r of gate4g.rows) {
    const cs = String(r.classification.source || '')
    const external = /non-vinsolutions|separate external|external source/i.test(
      cs,
    )
    const field = r.classification.field
    const unlockDetail =
      !external && field && field !== 'not_applicable (held)'
        ? field
        : undefined
    normalized.push({
      row: {
        metric_id: r.metric_id,
        gate_origin: '4G',
        section: r.section,
        subsection: r.subsection,
        condition: r.condition,
        blocker_class: r.blocker_class,
        primary_blocker: r.primary_blocker,
        committed_boundary_lane: r.boundary_lane,
      },
      extras: {
        unlock_detail: unlockDetail,
        next_action_raw: r.next_safe_action,
        owner_raw: r.owner,
      },
    })
  }
  must(
    normalized.length === 278,
    `normalized unresolved ${normalized.length} != 278`,
  )

  // ── Classify domain + build internal record for every unresolved ID ──
  const domainTally = new Map<Domain, number>()
  const overrides: Array<{
    metric_id: string
    keyword_lane: string | null
    domain_lane: string
    override_reason: string
  }> = []
  type InternalRow = {
    metric_id: string
    section: string
    subsection: string
    status: 'evaluated' | 'unresolved'
    gate_origin: string
    domain: string
    domain_lane: string
    keyword_lane: string | null
    override_reason: string | null
    customer_display_eligible: boolean
    route_to: string
    display_mode: string
    internal_explanation: {
      blocker_class: string
      primary_blocker: string
      committed_boundary_lane: string | null
    } | null
  }
  const internalRows: Array<InternalRow> = []
  type CustomerRow = {
    metric_id: string
    section: string
    domain: CustomerDomain
    display_mode: string
    customer: ReturnType<typeof buildCustomerCopy>
    claim_layers: typeof FIELD_CLAIM_LAYER
  }
  const customerRows: Array<CustomerRow> = []

  for (const { row, extras } of normalized) {
    const c = classifyDomain(row)
    domainTally.set(c.domain, (domainTally.get(c.domain) ?? 0) + 1)
    if (c.override_reason)
      overrides.push({
        metric_id: row.metric_id,
        keyword_lane: c.keyword_lane,
        domain_lane: c.domain_lane,
        override_reason: c.override_reason,
      })
    internalRows.push({
      metric_id: row.metric_id,
      section: row.section,
      subsection: row.subsection,
      status: 'unresolved',
      gate_origin: row.gate_origin,
      domain: c.domain,
      domain_lane: c.domain_lane,
      keyword_lane: c.keyword_lane,
      override_reason: c.override_reason,
      customer_display_eligible: c.customer_display_eligible,
      route_to: c.route_to,
      display_mode: c.display_mode,
      internal_explanation: {
        blocker_class: row.blocker_class,
        primary_blocker: row.primary_blocker,
        committed_boundary_lane: row.committed_boundary_lane ?? null,
      },
    })
    if (c.customer_display_eligible && isCustomerDomain(c.domain)) {
      const copy = buildCustomerCopy(row, c.domain, extras)
      assertCustomerSafe(row.metric_id, c.domain, copy)
      customerRows.push({
        metric_id: row.metric_id,
        section: row.section,
        domain: c.domain,
        display_mode: c.display_mode,
        customer: copy,
        claim_layers: FIELD_CLAIM_LAYER,
      })
    }
  }

  // ── Evaluated IDs (17) → internal record only (measured; route to the PDF's measured section) ──
  for (const id of [...evaluatedIds].sort((a, b) => swIndex(a) - swIndex(b))) {
    const cat = catById.get(id)
    must(!!cat, `evaluated id ${id} missing from catalog`)
    internalRows.push({
      metric_id: id,
      section: cat!.section,
      subsection: cat!.subsection,
      status: 'evaluated',
      gate_origin: 'evaluated',
      domain: 'sales',
      domain_lane: 'sales',
      keyword_lane: null,
      override_reason: null,
      customer_display_eligible: true,
      route_to: 'sales_customer_pdf_measured',
      display_mode: 'measured',
      internal_explanation: null,
    })
  }
  internalRows.sort((a, b) => swIndex(a.metric_id) - swIndex(b.metric_id))
  customerRows.sort((a, b) => swIndex(a.metric_id) - swIndex(b.metric_id))

  // ── Fail-closed invariants (partition / eligibility / leakage / no service-eligible) ──
  must(
    internalRows.length === 295,
    `internal rows ${internalRows.length} != 295`,
  )
  const ids = new Set(internalRows.map((r) => r.metric_id))
  must(ids.size === 295, `internal ids not unique/complete (${ids.size})`)
  const unresolvedCount = internalRows.filter(
    (r) => r.status === 'unresolved',
  ).length
  must(unresolvedCount === 278, `unresolved ${unresolvedCount} != 278`)

  const domainCounts = Object.fromEntries(
    [...CUSTOMER_DOMAINS, ...WITHHELD_DOMAINS].map((d) => [
      d,
      domainTally.get(d) ?? 0,
    ]),
  )
  must(
    domainCounts.sales === 233 &&
      domainCounts.cross_rooftop === 3 &&
      domainCounts.enrichment_external === 6 &&
      domainCounts.service_parts === 20 &&
      domainCounts.compliance_legal === 16 &&
      domainCounts.withheld_unclassified === 0,
    `domain tally ${JSON.stringify(domainCounts)} != expected 233/3/6/20/16/0`,
  )
  const eligibleUnresolved = internalRows.filter(
    (r) => r.status === 'unresolved' && r.customer_display_eligible,
  ).length
  const withheldUnresolved = internalRows.filter(
    (r) => r.status === 'unresolved' && !r.customer_display_eligible,
  ).length
  must(
    eligibleUnresolved === 242,
    `eligible unresolved ${eligibleUnresolved} != 242`,
  )
  must(
    withheldUnresolved === 36,
    `withheld unresolved ${withheldUnresolved} != 36`,
  )
  must(
    customerRows.length === 242,
    `customer rows ${customerRows.length} != 242`,
  )

  // No Service/Parts or compliance-domain metric may be customer-display eligible.
  for (const r of internalRows)
    if (
      r.domain === 'service_parts' ||
      r.domain === 'compliance_legal' ||
      r.domain === 'withheld_unclassified'
    )
      must(
        !r.customer_display_eligible,
        `${r.metric_id} (${r.domain}) must not be customer-display eligible`,
      )

  // The SW-270 override must be present (domain evidence beats an incidental "rooftop" keyword).
  const sw270 = overrides.find((o) => o.metric_id === 'SW-270')
  must(
    !!sw270 &&
      sw270.keyword_lane === 'cross_rooftop' &&
      sw270.domain_lane === 'service',
    'SW-270 override missing or wrong (expected keyword cross_rooftop → domain service)',
  )
  const sw270Internal = internalRows.find((r) => r.metric_id === 'SW-270')
  must(
    sw270Internal!.domain === 'service_parts' &&
      !sw270Internal!.customer_display_eligible,
    'SW-270 must resolve to service_parts and be ineligible',
  )
  // SW-079/080: 4G not_applicable lane, Service-domain rationale → service_parts, ineligible.
  for (const id of ['SW-079', 'SW-080']) {
    const rr = internalRows.find((r) => r.metric_id === id)
    must(
      rr!.domain === 'service_parts' && !rr!.customer_display_eligible,
      `${id} must resolve to service_parts and be ineligible`,
    )
  }

  // Deep leakage sweep over every emitted customer string (defense in depth vs the per-row assert).
  const PII =
    /\b(\d{3}-\d{2}-\d{4}|\(\d{3}\)\s*\d{3}-\d{4}|\d{3}-\d{4}@|@[a-z0-9.-]+\.[a-z]{2,})\b/i
  for (const cr of customerRows)
    for (const [field, value] of Object.entries(cr.customer)) {
      must(
        !SERVICE_PARTS_DATA.test(value),
        `${cr.metric_id}.${field} leaks Service/Parts data`,
      )
      must(!PII.test(value), `${cr.metric_id}.${field} contains PII-like text`)
    }

  // ── CRM devil's-advocate control: seed from committed observed_evidence (exactly 5) ──
  const observedRows = gate4g.rows.filter((r) => r.observed_evidence)
  must(
    observedRows.length === 5,
    `observed_evidence rows ${observedRows.length} != 5`,
  )
  const crmChecks = observedRows
    .map((r) => {
      const oe = r.observed_evidence!
      let observed_extreme = (oe.observed_denominator_statement ?? '').trim()
      if (!observed_extreme && oe.eligible_denominator_observed) {
        const counts = GOVERNED_ROOFTOPS.map((d) => {
          const c = oe.eligible_denominator_observed![d]
          return `${d}: eligible new-car deals ${c.new_deals} (${c.denominator_status})`
        }).join('; ')
        observed_extreme = `Observed eligible denominator per rooftop — ${counts}.`
      }
      return {
        metric_id: r.metric_id,
        metric: oe.metric_ratio ?? '',
        relation_to_primary_blocker:
          oe.relation_to_primary_blocker ?? 'primary',
        observed_extreme,
        primary_domain: 'sales',
        alternate_check_required: {
          same_dealer_same_period_same_definition: true,
          method:
            'Re-read the same field for the same dealer and governed week via an alternate in-boundary VinSolutions view (e.g. the deal/desking log or the Sales Gross detail), under the identical metric definition, and compare. Sales-only; aggregate-only; no PII.',
        },
        state: 'required_not_performed',
        performed: false,
        renders_as: renderCrmState('required_not_performed'),
        never_zero: true,
      }
    })
    .sort((a, b) => swIndex(a.metric_id) - swIndex(b.metric_id))
  must(
    crmChecks.every(
      (c) => c.state === 'required_not_performed' && c.never_zero,
    ),
    'every seeded CRM check must be required_not_performed and never_zero',
  )

  // ── Emit artifacts ──
  fs.mkdirSync(OUT, { recursive: true })
  const partition = {
    evaluated: 17,
    gate4e_content_hold: 70,
    gate4f_hold: 86,
    gate4g_hold: 122,
  }
  const eligibilityTally = {
    customer_display_eligible: eligibleUnresolved,
    withheld: withheldUnresolved,
    by_domain: domainCounts,
  }

  const internalLedger = {
    artifact: 'gate4h-internal-accountability-ledger',
    revision: 'H1',
    accepted_week: ACCEPTED_WEEK,
    governed_rooftops: [...GOVERNED_ROOFTOPS],
    promotion_statement:
      'Gate 4H claims 0 new evaluations. Portfolio unchanged: 17 evaluated / 278 unresolved.',
    coverage: { conditions: 295, evaluated: 17, unresolved: 278 },
    id_partition: partition,
    id_partition_reconciles_to: 295,
    eligibility_tally: eligibilityTally,
    domain_derivation_note:
      'customer_display_eligible is a pure function of the evidence DOMAIN (committed blocker_class + primary_blocker + boundary_lane), never an incidental condition word. Service/Parts and compliance/legal/PII domains are withheld and routed to a separate governed workspace.',
    overrides,
    rows: internalRows,
  }
  const internalPath = path.join(
    OUT,
    'gate4h-internal-accountability-ledger.json',
  )
  fs.writeFileSync(
    internalPath,
    await formatJsonFile(internalLedger, internalPath),
  )

  const customerContract = {
    artifact: 'gate4h-downstream-customer-contract',
    revision: 'H1',
    accepted_week: ACCEPTED_WEEK,
    governed_rooftops: [...GOVERNED_ROOFTOPS],
    promotion_statement:
      'Gate 4H claims 0 new evaluations. 17 evaluated / 278 unresolved unchanged.',
    coverage: { conditions: 295, evaluated: 17, unresolved: 278 },
    eligibility: eligibilityTally,
    renderer_contract: {
      consume_only: 'customer_display_eligible === true',
      must_not: [
        'read or render any row routed to a separate workspace',
        'import any Service/Parts data',
        'render any unresolved value as 0 (missing is never zero)',
        'surface internal blocker vocabulary in customer copy',
      ],
    },
    claim_layer_contract: CLAIM_LAYER_CONTRACT,
    rows: customerRows,
  }
  const customerPath = path.join(
    OUT,
    'gate4h-downstream-customer-contract.json',
  )
  fs.writeFileSync(
    customerPath,
    await formatJsonFile(customerContract, customerPath),
  )

  const crmLedger = {
    artifact: 'gate4h-crm-devils-advocate-ledger',
    revision: 'H1',
    accepted_week: ACCEPTED_WEEK,
    ...CRM_CHECK_CONTRACT,
    seeded_ids: crmChecks.map((c) => c.metric_id),
    checks: crmChecks,
  }
  const crmPath = path.join(OUT, 'gate4h-crm-devils-advocate-ledger.json')
  fs.writeFileSync(crmPath, await formatJsonFile(crmLedger, crmPath))

  console.log(
    `Gate 4H: 295 coverage (17 evaluated / 278 unresolved); eligible ${eligibleUnresolved} / withheld ${withheldUnresolved}`,
  )
  console.log(`domains: ${JSON.stringify(domainCounts)}`)
  console.log(`overrides: ${JSON.stringify(overrides.map((o) => o.metric_id))}`)
  console.log(`CRM seeds: ${JSON.stringify(crmChecks.map((c) => c.metric_id))}`)
  console.log(
    `hashes: internal ${first16(internalPath)}, customer ${first16(customerPath)}, crm ${first16(crmPath)}`,
  )
  console.log(
    `wrote ${path.relative(REPO, internalPath)}, ${path.relative(REPO, customerPath)}, ${path.relative(REPO, crmPath)}`,
  )
}

void main()
