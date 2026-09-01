/**
 * Gate 4C1 — deterministic, one-row-per-metric CAPABILITY DELTA for the enhanced weekly
 * Communication Log family against the exact SW-001..SW-295 catalog.
 *
 * This is a machine-readable capability MAP, NOT a promotion. `evaluated` is false for every
 * row. Each row is classified into exactly one of the controller's six categories with an
 * explicit, auditable `basis`; a `requires_ratified_threshold` flag marks structurally-
 * computable metrics that still need a controller-ratified threshold/semantic choice before
 * any future promotion (e.g. the seven structured candidates). Non-PII.
 *
 * Categories (controller-defined):
 *   definition_compatible_now      — this family provides the fields + grain to compute the
 *                                    metric's definition for the governed week (a
 *                                    requires_ratified_threshold flag says whether a threshold/
 *                                    semantic choice still needs ratification before promotion)
 *   nlp_content_capable_pending    — needs Message Content NLP/sentiment/deterministic content
 *                                    scoring that is not yet agreed
 *   unsupported_field              — communication-adjacent but a required field is absent from
 *                                    this family's 24 columns
 *   insufficient_history           — needs multi-week trend/history beyond this single week
 *   other_source_or_join           — fundamentally belongs to another family (appointments,
 *                                    deals, inventory, marketing, CRM gross, dashboard) or needs
 *                                    a join this family cannot supply
 *   outside_sales_boundary         — Service / cross-rooftop / compliance / external boundary
 */
import fs from 'node:fs'
import path from 'node:path'
import { formatJsonFile } from '../m1r-evaluator/serialize'
import { COMM_WEEKLY_FAMILY } from '@/server/reports/comms/comm-family-contract'

const REPO = process.cwd()

type Cond = {
  metric_id: string
  section: string
  subsection: string
  condition: string
  source: string
  acquisition_class: string
}

/** The seven shadow-identified structured candidates (structurally computable from this
 *  family but every one carries a semantic choice → requires_ratified_threshold). */
const STRUCTURED_CANDIDATES = new Set([
  'SW-019',
  'SW-022',
  'SW-076',
  'SW-132',
  'SW-134',
  'SW-137',
  'SW-138',
])

const NLP_RE =
  /sentiment|tone|content|keyword|phrase|language|transcript|script|mentions?|apolog|frustrat|complain|urgen|emoji|profan|competitor name|negative word|positive word|intent detect|topic|summar/i
const BOUNDARY_SECTION_RE = /service-to-sales|compliance|equity mining/i
const BOUNDARY_COND_RE =
  /\bservice\b|\bparts\b|cross-rooftop|another rooftop|other store|dms\b|repair order|\bRO\b/i
const HISTORY_RE =
  /consecutive|trailing|week-over-week|month-over-month|\bWoW\b|\bMoM\b|over (?:the )?(?:past|last) \d|\bstreak\b|\d+\s*weeks?\b|trend|declin(?:e|ing)|rising|quarter|30-day|60-day|90-day|year-over-year|\bYoY\b/i
// Communication-structural signal computable from this family's NON-content fields.
const COMM_STRUCT_RE =
  /\b(call|calls|text|texts|sms|email|emails|outbound|inbound|response time|response latency|reply|replies|contact attempt|cadence|follow-?up|voicemail|answering machine|channel|dials?)\b/i
const COMM_SECTIONS =
  /Sales Rep Activity & Communication Behavior|Customer Communication Sentiment & Content|BDC \/ Call Center|Red Flags in Sales-to-Customer Communications/i
// Fields NOT present in this comm family (belong to other families).
const OTHER_FAMILY_RE =
  /appointment|showroom|test drive|walk-?in visit|be-?back|demo\b|write-?up|desk(?:ing)?|gross|front gross|back gross|deal|F&I|finance|inventory|VIN\b|stock|vehicle age|aging|days? (?:in|on) lot|price|discount|trade|equity|ROI|cost per|ad spend|marketing spend|attribution|GA4|analytics|website|form fill|CRM hygiene|duplicate lead|data integrity|missing field/i

function classify(c: Cond): {
  category: string
  requires_ratified_threshold: boolean
  basis: string
} {
  const text = `${c.condition} ${c.subsection}`
  // 1. Boundary first (never route Service/compliance/cross-rooftop into Sales values).
  if (BOUNDARY_SECTION_RE.test(c.section) || BOUNDARY_COND_RE.test(c.condition))
    return {
      category: 'outside_sales_boundary',
      requires_ratified_threshold: false,
      basis:
        'section or condition references Service / compliance / cross-rooftop boundary',
    }
  if (c.acquisition_class === 'Outside governed boundary')
    return {
      category: 'outside_sales_boundary',
      requires_ratified_threshold: false,
      basis: 'catalog acquisition_class = Outside governed boundary',
    }
  if (c.acquisition_class === 'Separate external source required')
    return {
      category: 'other_source_or_join',
      requires_ratified_threshold: false,
      basis: 'catalog acquisition_class = Separate external source required',
    }
  // 2. The seven ratified structured candidates.
  if (STRUCTURED_CANDIDATES.has(c.metric_id))
    return {
      category: 'definition_compatible_now',
      requires_ratified_threshold: true,
      basis:
        'shadow structured candidate — computable from this family but carries a semantic choice (see enhanced-comm-structured-candidates.json)',
    }
  // 3. Content/NLP metrics.
  if (NLP_RE.test(text))
    return {
      category: 'nlp_content_capable_pending',
      requires_ratified_threshold: true,
      basis:
        'requires Message Content NLP/sentiment/deterministic content scoring (not yet agreed)',
    }
  // 4. History/trend metrics that this single week cannot satisfy.
  if (HISTORY_RE.test(text))
    return {
      category: 'insufficient_history',
      requires_ratified_threshold: false,
      basis:
        'requires multi-week trend/history beyond the single governed week',
    }
  // 5. Communication-structural metrics from this family's non-content fields.
  if (COMM_STRUCT_RE.test(text) && !OTHER_FAMILY_RE.test(text))
    return {
      category: 'definition_compatible_now',
      requires_ratified_threshold: true,
      basis:
        'communication-structural signal (call/text/email/timing/cadence) computable from this family; threshold/population choice still needs ratification',
    }
  if (COMM_SECTIONS.test(c.section) && !OTHER_FAMILY_RE.test(text))
    return {
      category: 'definition_compatible_now',
      requires_ratified_threshold: true,
      basis:
        'communication section metric computable from this family; threshold/definition still needs ratification',
    }
  // 6. Belongs to another family / needs a field this family lacks.
  if (OTHER_FAMILY_RE.test(text))
    return {
      category: 'other_source_or_join',
      requires_ratified_threshold: false,
      basis:
        'fundamentally an appointments/deals/inventory/marketing/CRM metric — not this communication family',
    }
  return {
    category: 'unsupported_field',
    requires_ratified_threshold: false,
    basis: 'no field in this family supports the metric definition',
  }
}

async function main(): Promise<void> {
  const catalog = JSON.parse(
    fs.readFileSync(
      path.join(
        REPO,
        'docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json',
      ),
      'utf8',
    ),
  ) as Array<Cond>
  if (!Array.isArray(catalog) || catalog.length !== 295)
    throw new Error(`expected 295 catalog rows, got ${catalog.length}`)

  const rows = catalog.map((c) => {
    const v = classify(c)
    return {
      metric_id: c.metric_id,
      section: c.section,
      subsection: c.subsection,
      category: v.category,
      requires_ratified_threshold: v.requires_ratified_threshold,
      evaluated: false,
      basis: v.basis,
    }
  })
  const by_category: Record<string, number> = {}
  for (const r of rows)
    by_category[r.category] = (by_category[r.category] ?? 0) + 1

  const out = {
    artifact: 'gate4c1-comm-weekly-capability-delta',
    family: COMM_WEEKLY_FAMILY,
    catalog_ref:
      'docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json',
    total: rows.length,
    reconciles_to_295: rows.length === 295,
    evaluated_count: 0,
    none_evaluated_note:
      'This is a capability MAP. No category is counted as evaluated; this gate promotes zero SW metrics. requires_ratified_threshold=true marks a structurally-computable metric that still needs a controller-ratified threshold/semantic choice.',
    categories: [
      'definition_compatible_now',
      'nlp_content_capable_pending',
      'unsupported_field',
      'insufficient_history',
      'other_source_or_join',
      'outside_sales_boundary',
    ],
    by_category,
    structured_candidates: [...STRUCTURED_CANDIDATES].sort(),
    rows,
  }
  const p = path.join(
    REPO,
    'docs/halo/contract/sw295-comm-capability-delta.json',
  )
  fs.writeFileSync(p, await formatJsonFile(out, p))
  console.log(`total=${rows.length} by_category=${JSON.stringify(by_category)}`)
  console.log(`wrote ${path.relative(REPO, p)}`)
}

void main()
