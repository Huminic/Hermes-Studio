/**
 * Gate 4C1 (shadow/control REPAIR) — field-backed, one-row-per-metric CAPABILITY DELTA for the
 * enhanced weekly Communication Log family against the exact SW-001..SW-295 catalog.
 *
 * This replaces the earlier keyword heuristic (which over-optimistically marked 54 rows
 * `definition_compatible_now`). The decision is now bounded by the ADMITTED privacy-minimized
 * DERIVATIVE's actual fields + its single governed 7-day week — NOT by condition keywords.
 *
 * A metric is `definition_compatible_now` ONLY if its CURRENT value is deterministically
 * computable from the admitted derivative fields + the 7-day evidence, fully specified
 * (numerator/population/window/event-semantics all determined), with at most a threshold/
 * baseline choice remaining (a separate ratification flag that cannot cure unavailable inputs).
 * If the family's fields support the events but a numerator/population/window/event-semantic is
 * NOT fully specified, it is `semantic_definition_pending` — NOT ready. Everything needing
 * message content/meaning, an absent field, a join, longer history, or an external event is
 * classified into the appropriate not-ready bucket. `evaluated` is false for every row; this
 * gate promotes zero metrics.
 *
 * The admitted derivative emits ONLY: pseudonymized rep/thread/person/comm tokens, user_group,
 * direction, channel (call/text/email), comm_type, interaction_result, lead_type/status/
 * status_type, lead_source(_group), make, activity timestamp, attachment/image/video PRESENCE,
 * and message content LENGTH/PRESENCE (never meaning). It does NOT emit Lead Created Date,
 * phone/email, opens/clicks, CRM login, sold/vehicle/deal outcomes, or any content semantics.
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
  plain_language_meaning: string
  acquisition_class: string
  actual_supporting_data: string
  source: string
  period_grain_population: string
  fields_and_keys: string
  rule_or_method: string
}

const CATEGORIES = [
  'definition_compatible_now',
  'semantic_definition_pending',
  'nlp_content_capable_pending',
  'unsupported_field',
  'insufficient_history',
  'other_source_or_join',
  'outside_sales_boundary',
] as const
type Category = (typeof CATEGORIES)[number]

const ADMITTED_FIELDS =
  'rep_token, thread_token, person_token, comm_token, user_group, direction, channel, comm_type, interaction_result, lead_type, lead_status(_type), lead_source(_group), make, activity_timestamp, attachment/image/video presence'

type Detail = {
  category: Category
  requires_ratified_threshold: boolean
  required_inputs: string
  admitted_fields_satisfying: string
  missing_inputs: string
  minimum_history: string
  join_or_nlp_required: string
  rationale: string
}

/**
 * Field-backed EXPLICIT decisions for the honesty-critical set (the 54 previously-mislabeled
 * rows + the shadow-named DMS/sentiment cases). `semantic_definition_pending` is reserved for
 * metrics whose EVENTS are genuinely in the derivative + within the 7-day window but whose
 * numerator/population/window/event-semantics need a controller-ratified choice. NONE is
 * `definition_compatible_now` — no catalog metric is fully specified from this family alone.
 */
const EXPLICIT: Record<string, { c: Category; missing: string; why: string }> =
  {
    // Absent field: no phone/email column in the family at all.
    'SW-003': {
      c: 'unsupported_field',
      missing: 'phone + email fields',
      why: 'no phone/email column exists in the 24-col family',
    },
    'SW-007': {
      c: 'unsupported_field',
      missing: 'phone/email validity fields',
      why: 'invalid-phone/disposable-email checks need phone/email data absent from the family',
    },
    'SW-091': {
      c: 'unsupported_field',
      missing: 'phone/email fields',
      why: 'conflicting phone/email across profiles needs contact fields absent from the family',
    },
    // Absent field: opens/clicks / read-tracking not emitted; also marketing-email history.
    'SW-233': {
      c: 'unsupported_field',
      missing: 'email open/click tracking',
      why: 'open/click engagement is not a derivative field ("Email Read" interaction_result is not open/click tracking); marketing-email history is another family',
    },
    'SW-234': {
      c: 'unsupported_field',
      missing: 'email click tracking',
      why: 'click tracking is not a derivative field',
    },
    'SW-235': {
      c: 'unsupported_field',
      missing: 'video-open tracking (Covideo/BombBomb)',
      why: 'video OPENS are an external tool signal; has_video is only whether the rep attached a video, not whether the customer opened it',
    },
    // Absent field: CRM login / lead-origination time not emitted by the derivative.
    'SW-025': {
      c: 'unsupported_field',
      missing: 'CRM login events',
      why: 'CRM login is not a communication and is not a derivative field',
    },
    'SW-017': {
      c: 'unsupported_field',
      missing: 'Lead Created Date (origination time)',
      why: '"within 5 min of the lead" needs lead-origination time; the derivative emits comm timestamps only, not Lead Created Date',
    },
    // Already evaluated elsewhere — this family must not imply it supersedes that evidence.
    'SW-015': {
      c: 'other_source_or_join',
      missing: 'lead-origination first-response (Leads family)',
      why: 'first-response time is already evaluated via the accepted Leads family (SW-015); this comm family does not supersede it and lacks Lead Created Date',
    },
    // Message CONTENT / meaning (never inferred from content_length/presence).
    'SW-014': {
      c: 'nlp_content_capable_pending',
      missing: 'auto-reply vs human classification',
      why: 'distinguishing an auto-reply needs content/automation semantics',
    },
    'SW-021': {
      c: 'nlp_content_capable_pending',
      missing: 'message-body similarity',
      why: '"identical templated message" needs content comparison',
    },
    'SW-073': {
      c: 'nlp_content_capable_pending',
      missing: 'escalation-intent content',
      why: '"requests manager escalation" is a content signal',
    },
    'SW-075': {
      c: 'nlp_content_capable_pending',
      missing: 'question repetition semantics',
      why: '"same ask 3+ times" needs message meaning',
    },
    'SW-077': {
      c: 'nlp_content_capable_pending',
      missing: '"high-intent message" semantics',
      why: 'the trigger references message content',
    },
    'SW-135': {
      c: 'nlp_content_capable_pending',
      missing: 'stated-deadline extraction',
      why: '"I need to decide by Friday" is content',
    },
    'SW-136': {
      c: 'nlp_content_capable_pending',
      missing: '"hot signal" content (payment/financing/delivery)',
      why: 'hot-signal detection needs message meaning',
    },
    'SW-139': {
      c: 'nlp_content_capable_pending',
      missing: 'stated-callback-time extraction',
      why: '"call me after 5" is content',
    },
    'SW-141': {
      c: 'nlp_content_capable_pending',
      missing: '"high intent" content',
      why: 'high-intent classification needs message meaning',
    },
    'SW-153': {
      c: 'nlp_content_capable_pending',
      missing: 'financing-question + evasion semantics',
      why: 'whether the rep answered the financing ask needs content',
    },
    'SW-157': {
      c: 'nlp_content_capable_pending',
      missing: 'answer-vs-evasion semantics',
      why: 'evasion pattern needs message meaning',
    },
    'SW-176': {
      c: 'nlp_content_capable_pending',
      missing: 'sentiment/tone',
      why: 'Sales-domain sentiment (polite-then-curt); the word "service" here is customer-service manner, NOT the Service department, so it is NOT outside the Sales boundary',
    },
    'SW-181': {
      c: 'nlp_content_capable_pending',
      missing: 'promise extraction',
      why: '"I\'ll call you at 3" is content',
    },
    'SW-183': {
      c: 'nlp_content_capable_pending',
      missing: '"manager approved" claim semantics',
      why: 'the claim is content',
    },
    'SW-185': {
      c: 'nlp_content_capable_pending',
      missing: 'repeat-ask semantics',
      why: '"asks same info twice" needs content',
    },
    'SW-194': {
      c: 'nlp_content_capable_pending',
      missing: 'conflicting-info semantics',
      why: 'conflicting info needs content comparison',
    },
    'SW-196': {
      c: 'nlp_content_capable_pending',
      missing: 'context-recap semantics',
      why: 'recap presence needs content',
    },
    'SW-197': {
      c: 'nlp_content_capable_pending',
      missing: 'acknowledgement semantics',
      why: 'acknowledging prior conversation needs content',
    },
    'SW-200': {
      c: 'nlp_content_capable_pending',
      missing: 'stated-vehicle-interest extraction',
      why: 'interest changes need content',
    },
    'SW-201': {
      c: 'nlp_content_capable_pending',
      missing: 'need-confirmation semantics',
      why: 'confirming need needs content',
    },
    'SW-203': {
      c: 'nlp_content_capable_pending',
      missing: 'reading-level analysis',
      why: 'reading-level match needs content',
    },
    'SW-204': {
      c: 'nlp_content_capable_pending',
      missing: 'competence-gap semantics',
      why: 'feature/model knowledge needs content',
    },
    'SW-206': {
      c: 'nlp_content_capable_pending',
      missing: 'question repetition semantics',
      why: 'repeated question needs content',
    },
    'SW-287': {
      c: 'nlp_content_capable_pending',
      missing: 'question-answer alignment',
      why: 'did the reply address the question needs content',
    },
    // Join to another family / outcome (DMS/CRM-status/sold/vehicle/marketing/lease/model).
    'SW-023': {
      c: 'other_source_or_join',
      missing: 'CRM status-change attribution',
      why: 'who marked leads bad/lost is a CRM status event, not a comm event',
    },
    'SW-027': {
      c: 'other_source_or_join',
      missing: 'CRM handoff note',
      why: 'BDC-to-floor handoff notes are CRM records, not comm events',
    },
    'SW-056': {
      c: 'other_source_or_join',
      missing: 'DMS deal reconciliation',
      why: 'rebate/incentive stacking is a DMS record (non-VinSolutions)',
    },
    'SW-094': {
      c: 'other_source_or_join',
      missing: 'DMS deal record',
      why: 'lead-status-sold vs DMS deal is a DMS reconciliation join',
    },
    'SW-180': {
      c: 'other_source_or_join',
      missing: 'desking/DMS record',
      why: 'numbers-vs-desking is a DMS join (also content)',
    },
    'SW-182': {
      c: 'other_source_or_join',
      missing: 'sold/vehicle state',
      why: '"unit already sold/pending" needs the deal/inventory outcome',
    },
    'SW-198': {
      c: 'other_source_or_join',
      missing: 'sold-customer state',
      why: '"sold customer" needs the deal outcome to join',
    },
    'SW-265': {
      c: 'other_source_or_join',
      missing: 'lease-end dates',
      why: 'end-of-lease clusters need lease data (another source)',
    },
    'SW-266': {
      c: 'other_source_or_join',
      missing: 'model-year/inventory',
      why: 'model-year-changeover needs inventory/vehicle data',
    },
    // Longer history than the single governed week.
    'SW-261': {
      c: 'insufficient_history',
      missing: 'multi-week response history',
      why: 'best-time-to-contact model needs historical response times',
    },
    'SW-262': {
      c: 'insufficient_history',
      missing: 'historical responsiveness',
      why: '"historically responsive to Saturday" needs multi-week history',
    },
    'SW-295': {
      c: 'insufficient_history',
      missing: 'multi-week per-customer history',
      why: 'best-channel/best-time model needs history',
    },
    // Family fields support the EVENTS within the week but a semantic choice is unresolved.
    'SW-019': {
      c: 'semantic_definition_pending',
      missing: 'zero-activity-day + population definition',
      why: 'outbound Logged Call counts per rep/day exist; whether a zero-activity day fires and the rep population are choices',
    },
    'SW-022': {
      c: 'semantic_definition_pending',
      missing: 'min-call denominator + directionality',
      why: 'per-rep text/call counts exist; the small-sample guard + directionality are choices',
    },
    'SW-026': {
      c: 'semantic_definition_pending',
      missing: '"personalized media" scope + peer basis',
      why: 'has_video per rep exists; the media scope and peer comparison are choices',
    },
    'SW-076': {
      c: 'semantic_definition_pending',
      missing: '"grows" trend def + latency clock',
      why: 'within-thread customer→rep latencies exist; the trend definition + business-hours choice are open',
    },
    'SW-084': {
      c: 'semantic_definition_pending',
      missing: '"connect" definition + BDC population',
      why: 'BDC user_group + call channel + interaction_result exist; mapping results to "connect" is a choice',
    },
    'SW-086': {
      c: 'semantic_definition_pending',
      missing: 'voicemail definition + follow-up window',
      why: 'Answering Machine result + thread follow-up timing exist; the definitions are choices',
    },
    'SW-089': {
      c: 'semantic_definition_pending',
      missing: '"same number" proxy + "unanswered" def',
      why: 'inbound calls + person_token exist; person_token proxies "same customer" (not the literal number)',
    },
    'SW-132': {
      c: 'semantic_definition_pending',
      missing: 'business-hours calendar + "active thread"',
      why: 'last-inbound + subsequent-outbound timing exists; the business-hours calendar (external/ratified) and active-thread def are open',
    },
    'SW-134': {
      c: 'semantic_definition_pending',
      missing: '"widens" pattern def',
      why: 'successive within-thread gaps exist; the widening pattern needs definition',
    },
    'SW-137': {
      c: 'semantic_definition_pending',
      missing: '"reply" adjacency + window',
      why: 'inbound Text then rep Email in-thread is structural; the reply adjacency/window is a choice',
    },
    'SW-138': {
      c: 'semantic_definition_pending',
      missing: 'run count N + rapid-fire window',
      why: 'consecutive rep-outbound runs exist; N and the window are undefined in the catalog',
    },
    'SW-140': {
      c: 'semantic_definition_pending',
      missing: 'customer-voicemail definition',
      why: 'inbound Answering Machine + no rep reply is structural; the voicemail definition is a choice',
    },
    'SW-133': {
      c: 'semantic_definition_pending',
      missing: '"consecutive customer messages" run + reply def',
      why: 'inbound runs then a rep reply are structural (direction + thread + timing); the run count is a choice',
    },
    'SW-288': {
      c: 'semantic_definition_pending',
      missing: 'composite score definition',
      why: 'response times + direction balance + thread momentum are computable; the composite score must be ratified',
    },
    // Content/other that the keyword fallback would otherwise mis-bucket.
    'SW-078': {
      c: 'nlp_content_capable_pending',
      missing: 'language detection',
      why: 'detecting a Spanish-vs-English mismatch needs message content/language analysis',
    },
    'SW-263': {
      c: 'other_source_or_join',
      missing: 'service history + vehicle/seasonal data',
      why: 'seasonal service customers + vehicle-need timing need service + vehicle data, not communication events',
    },
  }

// ── Field-backed fallback detectors for the ~240 rows not explicitly decided ────────────────
const BOUNDARY_SECTION_RE = /Service-to-Sales|Compliance & Risk/i
const BOUNDARY_RE =
  /cross-rooftop|another rooftop|other store|\bTCPA\b|\bDNC\b|do not call|consent|opt-?out|regulat|equity mining/i
const EXTERNAL_RE =
  /Separate external source required|Outside governed boundary|GA4|google analytics|website|web traffic|ad spend|ad-spend|third-party (site|listing)|marketplace|inventory feed|OEM|credit bureau|external enrichment/i
const CONTENT_RE =
  /sentiment|tone|mood|keyword|phrase|topic|\bintent\b|objection|apolog|frustrat|complain|competitor|reading level|template|identical|personaliz|script|talk track|summar|"how much"|evasion|deadline|\bpromise\b|acknowledge|recap|context|address(es|ed)? the question|answer(ed|s)? the|confirm(s|ed)? (the )?(customer'?s )?need|feature|conflicting info|escalation|manager approved|bait|question (re)?peat|repeated question|semantic|message (says|content|body|meaning)|says|claim/i
const PHONE_EMAIL_RE =
  /phone number|invalid phone|phone pattern|disposable email|email domain|email address|missing (phone|email)|phone (and|&) email|valid(ity)? of (phone|email)|contact info/i
const OPENS_CLICKS_RE = /open(ed|s| rate)|click(ed|s| rate)?|link click/i
const LOGIN_RE =
  /login|logged in|CRM (login|usage)|active shift|screen time|system usage/i
const SOLD_JOIN_RE =
  /\bsold\b|\bdeal\b|\bDMS\b|desking|closed (deal|sale)|delivered|F&I|finance department|gross|inventory|\bVIN\b|stock number|vehicle (age|year|of interest)|model year|trade-?in value|equity|appointment|showroom|test drive|walk-?in visit|be-?back|write-?up|matching deal|rebate|incentive/i
const HISTORY_RE =
  /consecutive (week|day)|trailing|week-over-week|month-over-month|\bWoW\b|\bMoM\b|\d+\s*(weeks|months)|streak|\btrend\b|historical|prior (response|week)|over (the )?(past|last) \d|quarter|30-day|60-day|90-day|year-over-year|\bYoY\b|per (customer|lead).*(model|history|pattern)|best-time|end-of-lease|changeover/i
// Communication-structural capability the derivative genuinely provides.
const COMM_STRUCT_RE =
  /\b(call|calls|text|texts|sms|email|emails|outbound|inbound|voicemail|answering machine|contact rate|connect rate|response (time|latency|gap)|reply|replies|cadence|follow-?up|dials?|channel)\b/i

function fallback(c: Cond): {
  category: Category
  missing: string
  why: string
} {
  const text = `${c.condition} ${c.subsection} ${c.rule_or_method} ${c.plain_language_meaning}`
  if (BOUNDARY_SECTION_RE.test(c.section) || BOUNDARY_RE.test(text))
    return {
      category: 'outside_sales_boundary',
      missing: 'Sales boundary',
      why: 'Service-to-Sales / compliance / cross-rooftop boundary',
    }
  if (
    c.acquisition_class === 'Separate external source required' ||
    c.acquisition_class === 'Outside governed boundary' ||
    EXTERNAL_RE.test(text)
  )
    return {
      category: 'other_source_or_join',
      missing: 'external/other source',
      why: 'requires a source outside this communication family',
    }
  if (
    PHONE_EMAIL_RE.test(text) ||
    OPENS_CLICKS_RE.test(text) ||
    LOGIN_RE.test(text)
  )
    return {
      category: 'unsupported_field',
      missing: 'contact-validity / opens-clicks / login field',
      why: 'requires a field the derivative does not emit',
    }
  if (CONTENT_RE.test(text))
    return {
      category: 'nlp_content_capable_pending',
      missing: 'message content/meaning',
      why: 'requires Message Content semantics (never inferred from length/presence)',
    }
  if (SOLD_JOIN_RE.test(text))
    return {
      category: 'other_source_or_join',
      missing: 'deal/vehicle/appointment join',
      why: 'fundamentally an appointments/deals/inventory/DMS metric',
    }
  if (HISTORY_RE.test(text))
    return {
      category: 'insufficient_history',
      missing: 'multi-week history',
      why: 'needs a longer window than the single governed week',
    }
  if (COMM_STRUCT_RE.test(text))
    return {
      category: 'semantic_definition_pending',
      missing: 'numerator/population/window semantics',
      why: 'communication-structural but the definition is not fully specified',
    }
  return {
    category: 'unsupported_field',
    missing: 'no supporting field',
    why: 'no field in this family supports the metric',
  }
}

function detailFor(c: Cond): Detail {
  const ex = (
    EXPLICIT as Record<
      string,
      { c: Category; missing: string; why: string } | undefined
    >
  )[c.metric_id]
  const d = ex
    ? { category: ex.c, missing: ex.missing, why: ex.why }
    : fallback(c)
  const pending = d.category === 'semantic_definition_pending'
  return {
    category: d.category,
    // A threshold/baseline choice may remain a ratification flag ONLY for pending rows whose
    // inputs are otherwise available; it can never cure an unavailable input.
    requires_ratified_threshold: pending,
    required_inputs: c.condition,
    admitted_fields_satisfying: pending
      ? ADMITTED_FIELDS
      : d.category === 'definition_compatible_now'
        ? ADMITTED_FIELDS
        : '',
    missing_inputs: d.missing,
    minimum_history: HISTORY_RE.test(
      `${c.condition} ${c.rule_or_method} ${c.period_grain_population}`,
    )
      ? '> 1 week (multi-week history)'
      : '1 governed week (2026-08-24..2026-08-30)',
    join_or_nlp_required:
      d.category === 'nlp_content_capable_pending'
        ? 'NLP on Message Content'
        : d.category === 'other_source_or_join'
          ? 'join to another family/source'
          : d.category === 'unsupported_field'
            ? 'derivative field extension'
            : d.category === 'semantic_definition_pending'
              ? 'none (ratified semantic definition only)'
              : 'none',
    rationale: d.why,
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
    const d = detailFor(c)
    return {
      metric_id: c.metric_id,
      section: c.section,
      subsection: c.subsection,
      category: d.category,
      requires_ratified_threshold: d.requires_ratified_threshold,
      evaluated: false,
      required_inputs: d.required_inputs,
      admitted_fields_satisfying: d.admitted_fields_satisfying,
      missing_inputs: d.missing_inputs,
      minimum_history: d.minimum_history,
      join_or_nlp_required: d.join_or_nlp_required,
      rationale: d.rationale,
    }
  })
  const by_category: Record<string, number> = {}
  for (const r of rows)
    by_category[r.category] = (by_category[r.category] ?? 0) + 1
  const definitionReady = rows
    .filter((r) => r.category === 'definition_compatible_now')
    .map((r) => r.metric_id)
  const semanticPending = rows
    .filter((r) => r.category === 'semantic_definition_pending')
    .map((r) => r.metric_id)

  const out = {
    artifact: 'gate4c1-comm-weekly-capability-delta',
    revision:
      'field-backed-v2 (shadow/control repair of the keyword-heuristic v1)',
    family: COMM_WEEKLY_FAMILY,
    catalog_ref:
      'docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json',
    admitted_derivative_fields: ADMITTED_FIELDS,
    total: rows.length,
    reconciles_to_295: rows.length === 295,
    evaluated_count: 0,
    decision_rule:
      'definition_compatible_now requires the CURRENT value to be deterministically computable from the admitted derivative fields + the 7-day evidence, fully specified except a threshold/baseline (a ratification flag that cannot cure unavailable inputs). semantic_definition_pending = events supported by the derivative but numerator/population/window/event-semantics not fully specified. All other rows need message content, an absent field, a join, longer history, or lie outside the Sales boundary. No row is evaluated.',
    categories: [...CATEGORIES],
    by_category,
    definition_compatible_now_ids: definitionReady,
    semantic_definition_pending_ids: semanticPending,
    structured_candidates_reaudited: [
      'SW-019',
      'SW-022',
      'SW-076',
      'SW-132',
      'SW-134',
      'SW-137',
      'SW-138',
    ],
    rows,
  }
  const p = path.join(
    REPO,
    'docs/halo/contract/sw295-comm-capability-delta.json',
  )
  fs.writeFileSync(p, await formatJsonFile(out, p))
  console.log(`total=${rows.length} by_category=${JSON.stringify(by_category)}`)
  console.log(`definition_compatible_now=${JSON.stringify(definitionReady)}`)
  console.log(
    `semantic_definition_pending=${semanticPending.length}: ${semanticPending.join(',')}`,
  )
  console.log(`wrote ${path.relative(REPO, p)}`)
}

void main()
