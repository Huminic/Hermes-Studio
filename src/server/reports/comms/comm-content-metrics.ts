/**
 * Gate 4E — Enhanced Sales Communication Log (weekly) CONTENT metric evaluator + explicit 75-ID
 * disposition table. Pure compute over the isolated content reader's NON-PII feature rows; emits
 * ONLY aggregate cells (integer numerator/denominator + derived rate) — never a name, customer,
 * rep/thread token, or message content. Separate from the 4-family core spine AND the Gate 4C2
 * comm overlay; nothing here changes the prior 36 evaluated cells.
 *
 * Scope (semantically exact, NO proxies): promotes exactly five DEFINITION-EXACT DETERMINISTIC
 * content conditions — SW-021, SW-142, SW-145, SW-149, SW-150 — each a literal surface pattern
 * (identical body, unfilled merge tag, word count, link-only). Denominators are LITERAL (every
 * eligible unit; no invented minimum-sample floor); small samples are disclosed as CONFIDENCE, and
 * never excluded. The other 70 of the 75 `nlp_content_capable_pending` IDs are EXPLICIT HOLDs whose
 * meaning requires a semantic model, an external source, a ratified definition/threshold, or an
 * unavailable join/history — and NO in-boundary governed semantic provider exists (see
 * PROVIDER_VERDICT), so no semantic condition is proxied into a keyword rule. Missing is never zero.
 */
import {
  confidenceLabel,
  rankByDirection,
  signedVariance,
} from '../evaluator/metrics'
import { MERGE_TAG_SYNTAXES } from './comm-content-features'
import type { Baseline } from '../evaluator/types'
import type { CommContentRow } from './comm-content-reader'

export const COMM_CONTENT_FORMULA_VERSION = 'comm-content-metric-v1' as const

/**
 * Read-only provider-governance verdict (directive step 4). The repository's only AI paths are the
 * customer-facing chat route (external OpenAI-direct / Hermes inference) and an external-LLM
 * conversation-insights prompt; the deterministic leads classifier and lead-flow explicitly use
 * "no NLP". None is an in-boundary governed semantic provider approved to classify this restricted
 * tenant's communication content, and routing bodies through the external chat provider would send
 * customer text outside the approved boundary. Therefore NO live model is called in this gate and
 * every genuinely-semantic condition is HELD with this documented provider/privacy gap.
 */
export const PROVIDER_VERDICT =
  'no in-boundary governed semantic provider is approved to classify this tenant’s restricted communication content; the only AI paths transmit customer text to an external provider (out of boundary). No live model call is made in Gate 4E; semantic conditions are HELD, not proxied.'

export type ContentCategory =
  | 'definition_exact_deterministic_now'
  | 'definition_exact_via_governed_semantic_provider'
  | 'requires_unavailable_join_history_or_field'
  | 'requires_ratified_semantic_definition_or_threshold'
  | 'outside_accepted_evidence'

export type ContentDisposition = 'promote_deterministic' | 'hold'

export type ContentMetricId =
  | 'SW-021'
  | 'SW-142'
  | 'SW-145'
  | 'SW-149'
  | 'SW-150'

/** Full spec for a promoted deterministic content metric (drives the evaluated cell + matrix row). */
export type PromotedSpec = {
  metric_id: ContentMetricId
  title: string
  population: string
  numerator: string
  denominator: string
  detection_threshold: string // LITERAL, from the SW condition (embedded in the numerator rule)
  window: string
  zero_denominator: string
  source_fields: Array<string>
  baseline_basis: string
  rank_direction: 'lower_is_better'
  false_positive_controls: string
  false_negative_controls: string
  limitations: string
}

/** One explicit hand-authored decision per pending ID (no inference; mirrors the 4C1 table style). */
export type ContentDecision = {
  metric_id: string
  category: ContentCategory
  disposition: ContentDisposition
  hold_reason?: string
  missing_item?: string
}

const ONE_WEEK = 'one governed week (2026-08-24..2026-08-30, America/New_York)'
const OPTARGET =
  'internal operational target (red-flag rate ideal = 0); NOT an industry benchmark'
const WRITTEN =
  'outbound rep messages on a written channel (Comm Channel Text or Email) with non-blank Message Content; Logged Call notes are excluded (a call is not a written message)'

// ── The five DEFINITION-EXACT DETERMINISTIC promotions ────────────────────────
export const CONTENT_PROMOTED_SPECS: Array<PromotedSpec> = [
  {
    metric_id: 'SW-021',
    title:
      'Rep sends identical templated message to >70% of leads (no personalization)',
    population:
      'reps with at least one distinct lead that received an eligible written message this week (literal population; NO minimum-lead floor)',
    numerator:
      'reps whose single most-frequent identical (trim-normalized) body was sent across >70% of that rep’s distinct leads',
    denominator: 'reps with >=1 eligible written lead',
    detection_threshold: '>70% of the rep’s distinct leads (literal)',
    window: ONE_WEEK,
    zero_denominator: 'unresolved (missing is not zero)',
    source_fields: ['rep_token', 'thread_token', 'body_identity_hash'],
    baseline_basis: OPTARGET,
    rank_direction: 'lower_is_better',
    false_positive_controls:
      'exact trim-normalized body equality (not a similarity proxy); "identical" is literal',
    false_negative_controls:
      'a near-identical body differing by one character is (correctly, literally) NOT identical and not flagged',
    limitations:
      'DEGENERATE FOR LOW LEAD COUNTS: a rep with 1–2 distinct leads trivially reaches >70% (100%/50%); such flags are disclosed as low-confidence, never excluded (no invented floor). Interpret low-lead flags as low-sample.',
  },
  {
    metric_id: 'SW-142',
    title:
      "Rep uses generic template with unfilled merge tags ('Hi {{FirstName}}')",
    population: WRITTEN,
    numerator:
      'eligible written messages containing an UNFILLED merge-tag delimiter of an enumerated syntax',
    denominator: 'eligible written messages',
    detection_threshold: `presence of an unfilled merge-tag delimiter ∈ {${MERGE_TAG_SYNTAXES.join(', ')}} (literal)`,
    window: ONE_WEEK,
    zero_denominator: 'unresolved (missing is not zero)',
    source_fields: ['has_unfilled_merge_tag'],
    baseline_basis: OPTARGET,
    rank_direction: 'lower_is_better',
    false_positive_controls:
      'delimiter+field-token regex per enumerated syntax; a FILLED value (no delimiters) never matches',
    false_negative_controls:
      'detection is exact for the enumerated syntaxes; a novel delimiter outside the set is a DISCLOSED recall limitation (not silently treated as impossible)',
    limitations:
      'recall bounded to the enumerated merge-tag syntaxes; a zero result means "no enumerated unfilled delimiter", with eligibility (message population) proved',
  },
  {
    metric_id: 'SW-145',
    title:
      'Same message body sent to >5 customers in a day (copy-paste factory)',
    population:
      'distinct (trim-normalized body, calendar day) groups among eligible written messages',
    numerator:
      'distinct (body, day) groups delivered to >5 DISTINCT customers (person_token) that day',
    denominator: 'distinct (body, day) groups',
    detection_threshold:
      '>5 distinct customers for one identical body in one day (literal)',
    window: ONE_WEEK,
    zero_denominator: 'unresolved (missing is not zero)',
    source_fields: ['body_identity_hash', 'activity_date', 'person_token'],
    baseline_basis: OPTARGET,
    rank_direction: 'lower_is_better',
    false_positive_controls:
      'distinct customers counted by person_token (a repeat to the same customer is one customer); exact identical body',
    false_negative_controls:
      'identical bodies split across two calendar days are (literally) two day-groups; conservative, never over-counts a single day',
    limitations:
      'LITERAL over-capture disclosed: a short generic acknowledgement ("Thank you!") or an automated outbound identical body sent to >5 customers in a day counts, because the condition is body-identity + reach (not substance). No minimum-length/rep-scoping is invented.',
  },
  {
    metric_id: 'SW-149',
    title: "Rep's messages average <15 words (low-effort replies)",
    population:
      'reps with at least one eligible written message this week (literal population; NO minimum-message floor)',
    numerator:
      'reps whose mean word count over eligible written messages is < 15',
    denominator: 'reps with >=1 eligible written message',
    detection_threshold: '< 15 words mean (literal)',
    window: ONE_WEEK,
    zero_denominator: 'unresolved (missing is not zero)',
    source_fields: ['rep_token', 'word_count'],
    baseline_basis: OPTARGET,
    rank_direction: 'lower_is_better',
    false_positive_controls:
      'word = whitespace token containing a Unicode letter/number (bare punctuation/emoji do not count as words)',
    false_negative_controls:
      'mean over all eligible written messages (not a truncated sample)',
    limitations:
      'small per-rep message counts yield a low-confidence mean; disclosed as confidence, never excluded (no invented floor).',
  },
  {
    metric_id: 'SW-150',
    title: 'Rep only sends links, no conversational context',
    population:
      'reps with at least one eligible written message this week (literal population; NO minimum-message floor)',
    numerator:
      'reps for whom EVERY eligible written message is link-only (>=1 URL and no other letters/numbers)',
    denominator: 'reps with >=1 eligible written message',
    detection_threshold:
      'every eligible written message is link-only (literal "only")',
    window: ONE_WEEK,
    zero_denominator: 'unresolved (missing is not zero)',
    source_fields: ['rep_token', 'is_link_only'],
    baseline_basis: OPTARGET,
    rank_direction: 'lower_is_better',
    false_positive_controls:
      'a single message carrying any conversational word alongside a link is NOT link-only, so the rep is not flagged',
    false_negative_controls:
      'link detection covers http(s):// and www. URLs; "only" is evaluated over ALL eligible written messages',
    limitations:
      'a rep with a single eligible written message that is link-only satisfies "only sends links" literally; disclosed as low-confidence, never excluded (no invented floor).',
  },
]

// ── The 70 explicit HOLDs ─────────────────────────────────────────────────────
// Category B (definition_exact_via_governed_semantic_provider): the condition IS a semantic
// judgement (sentiment/intent/objection/entity/language/keyword-meaning); a governed semantic
// provider would evaluate it exactly, but none is approved in-boundary (PROVIDER_VERDICT) — HELD.
const B = 'definition_exact_via_governed_semantic_provider' as const
// Category C (requires_unavailable_join_history_or_field).
// Category D (requires_ratified_semantic_definition_or_threshold).
const D = 'requires_ratified_semantic_definition_or_threshold' as const
// Category E (outside_accepted_evidence): needs a source outside the accepted communication log.
const E = 'outside_accepted_evidence' as const

const sem = (missing: string): Omit<ContentDecision, 'metric_id'> => ({
  category: B,
  disposition: 'hold',
  hold_reason: `requires semantic understanding of message meaning (${missing}); no in-boundary governed semantic provider exists, so it cannot be evaluated without proxying meaning as keywords.`,
  missing_item: missing,
})

export const CONTENT_HELD_DECISIONS: Array<ContentDecision> = [
  {
    metric_id: 'SW-014',
    ...sem('auto-reply vs human classification of the first response'),
  },
  { metric_id: 'SW-029', ...sem('outbound sentiment (negative/pushy) trend') },
  {
    metric_id: 'SW-030',
    category: E,
    disposition: 'hold',
    hold_reason:
      'requires a customer complaint / CSI verbatim source and a named-rep match — neither is in the accepted Sales communication log.',
    missing_item:
      'external complaint/CSI verbatim source + rep-name attribution',
  },
  {
    metric_id: 'SW-070',
    ...sem('inbound customer sentiment (spike detection)'),
  },
  { metric_id: 'SW-071', ...sem('churn/competitor language in customer text') },
  { metric_id: 'SW-072', ...sem('price/payment objection detection') },
  {
    metric_id: 'SW-073',
    category: E,
    disposition: 'hold',
    hold_reason:
      'requires detecting a manager-escalation request (semantic) AND a manager note logged in the CRM — the CRM manager note is outside the accepted communication log.',
    missing_item: 'CRM manager-note source + escalation-request semantics',
  },
  {
    metric_id: 'SW-074',
    ...sem('profanity/complaint keyword MEANING and an escalation flag'),
  },
  {
    metric_id: 'SW-075',
    ...sem('repeated-question equivalence (same ask 3+ times)'),
  },
  {
    metric_id: 'SW-077',
    ...sem(
      '"high-intent message" classification that triggers the silence window',
    ),
  },
  {
    metric_id: 'SW-078',
    ...sem('language detection of customer vs rep messages'),
  },
  {
    metric_id: 'SW-131',
    category: D,
    disposition: 'hold',
    hold_reason:
      'architecture note ("semantic layer: NLP over notes/messages"), not a single ratified metric with a numerator/population/threshold.',
    missing_item: 'a ratified concrete metric definition',
  },
  {
    metric_id: 'SW-135',
    ...sem(
      'extracting a customer-stated deadline and comparing reply timing to it',
    ),
  },
  {
    metric_id: 'SW-136',
    ...sem(
      '"hot" signal (payment/financing/delivery) classification that triggers the silence window',
    ),
  },
  { metric_id: 'SW-139', ...sem('extracting a customer-stated callback time') },
  {
    metric_id: 'SW-141',
    ...sem(
      '"high intent" classification of the weekend/evening inbound message',
    ),
  },
  {
    metric_id: 'SW-143',
    ...sem(
      'whether a reply answers the specific question asked (Q-A alignment)',
    ),
  },
  {
    metric_id: 'SW-144',
    ...sem('whether a reply ignores information the customer already provided'),
  },
  {
    metric_id: 'SW-146',
    ...sem(
      'whether the rep asked a question (a "?" count is a proxy, not the concept "question")',
    ),
  },
  {
    metric_id: 'SW-147',
    ...sem(
      'the customer’s stated vehicle of interest and whether the rep mentions it',
    ),
  },
  {
    metric_id: 'SW-148',
    ...sem('pricing/payment/next-step CTA presence in a message'),
  },
  {
    metric_id: 'SW-151',
    ...sem(
      'greeting/sign-off style vs the store’s top performers (peer style model)',
    ),
  },
  {
    metric_id: 'SW-152',
    ...sem(
      'a customer price/payment concern and whether the reply addresses it',
    ),
  },
  {
    metric_id: 'SW-153',
    ...sem('a financing/credit question and whether the rep pivots away'),
  },
  {
    metric_id: 'SW-154',
    ...sem(
      'buying-signal phrases ("I’m ready") and an appointment-set join within 1h',
    ),
  },
  {
    metric_id: 'SW-155',
    ...sem('voluntary trade info and a trade-appraisal offer'),
  },
  {
    metric_id: 'SW-156',
    ...sem('an out-the-door price ask repeated without an answer'),
  },
  {
    metric_id: 'SW-157',
    ...sem(
      'an evasion pattern ("come in and let’s talk" answering "how much")',
    ),
  },
  {
    metric_id: 'SW-158',
    ...sem('a credit-challenge mention and a special-finance handoff'),
  },
  {
    metric_id: 'SW-159',
    ...sem('customer urgency and whether the rep mirrors it'),
  },
  {
    metric_id: 'SW-160',
    ...sem('a discount offered before the customer objects on price'),
  },
  {
    metric_id: 'SW-161',
    ...sem(
      'a competitor dealer/brand named in customer text (entity recognition)',
    ),
  },
  { metric_id: 'SW-162', ...sem('shopping-around phrases in customer text') },
  {
    metric_id: 'SW-163',
    ...sem('exit-intent phrases ("not interested", "take me off your list")'),
  },
  {
    metric_id: 'SW-164',
    ...sem('a specific competing offer referenced by the customer'),
  },
  {
    metric_id: 'SW-165',
    ...sem(
      'an OTD/final-number ask after previously-warm intent (state + semantics)',
    ),
  },
  {
    metric_id: 'SW-166',
    ...sem('a tone shift from questions to short replies'),
  },
  {
    metric_id: 'SW-168',
    ...sem('pause/defer phrases ("think about it", "revisit next month")'),
  },
  {
    metric_id: 'SW-169',
    ...sem('a life event that delays purchase (job change, move, medical)'),
  },
  {
    metric_id: 'SW-170',
    ...sem('negative sentiment on the customer’s last messages'),
  },
  {
    metric_id: 'SW-171',
    category: D,
    disposition: 'hold',
    hold_reason:
      'repeated !!!/??? are deterministic, but the disjunct "ALL CAPS" cannot be separated from auto-domain acronyms (SUV, VIN, AWD, MSRP, APR) without a ratified caps rule; promoting only the punctuation part would drop a named disjunct and change the condition.',
    missing_item: 'a ratified ALL-CAPS rule that excludes domain acronyms',
  },
  {
    metric_id: 'SW-172',
    ...sem('profanity/slurs/complaint keyword MEANING (either direction)'),
  },
  {
    metric_id: 'SW-173',
    ...sem('rep tone flagged pushy/aggressive by a sentiment model'),
  },
  {
    metric_id: 'SW-174',
    ...sem(
      'emotion words ("frustrated", "misled") as customer sentiment, not literal substrings',
    ),
  },
  { metric_id: 'SW-175', ...sem('sarcasm / passive-aggression detection') },
  {
    metric_id: 'SW-176',
    ...sem('rep sentiment consistency (polite then curt) across a thread'),
  },
  {
    metric_id: 'SW-177',
    ...sem('a request to speak to a manager / "someone else"'),
  },
  {
    metric_id: 'SW-178',
    ...sem(
      'apology detection ("apology" is a meaning, not a fixed keyword list)',
    ),
  },
  {
    metric_id: 'SW-179',
    ...sem(
      'quoted prices/payments across messages and whether they differ without explanation',
    ),
  },
  {
    metric_id: 'SW-181',
    ...sem('an explicit promise ("I’ll call at 3") and a follow-through join'),
  },
  {
    metric_id: 'SW-183',
    category: E,
    disposition: 'hold',
    hold_reason:
      'requires detecting a "manager approved" claim (semantic) AND a backing manager note in the CRM — the CRM note is outside the accepted communication log.',
    missing_item: 'CRM manager-note source + claim semantics',
  },
  {
    metric_id: 'SW-185',
    ...sem('the rep asking for the same info twice (semantic equivalence)'),
  },
  {
    metric_id: 'SW-193',
    ...sem('an unsubstantiable compliance promise ("guaranteed approval")'),
  },
  {
    metric_id: 'SW-194',
    ...sem(
      'two reps giving CONFLICTING info within 24h (the conflict is semantic)',
    ),
  },
  {
    metric_id: 'SW-195',
    ...sem('a floor-rep self-introduction and a BDC-appointment/role join'),
  },
  {
    metric_id: 'SW-196',
    ...sem('a manager takeover with no context recap to the customer'),
  },
  {
    metric_id: 'SW-197',
    ...sem('a reassigned rep failing to acknowledge the prior conversation'),
  },
  {
    metric_id: 'SW-200',
    ...sem('the customer’s stated vehicle interest changing 3+ times'),
  },
  {
    metric_id: 'SW-201',
    ...sem(
      'whether the rep confirms the customer’s actual need (family size, use, budget)',
    ),
  },
  {
    metric_id: 'SW-202',
    ...sem(
      'language detection (customer writes Spanish, rep replies English only)',
    ),
  },
  {
    metric_id: 'SW-203',
    category: D,
    disposition: 'hold',
    hold_reason:
      'reading-level is computable, but "far above/below the customer (mismatch)" has no ratified threshold or comparison basis.',
    missing_item: 'a ratified reading-level mismatch threshold',
  },
  {
    metric_id: 'SW-204',
    ...sem(
      'a competence gap (rep clearly doesn’t know a feature/model the customer asks about)',
    ),
  },
  {
    metric_id: 'SW-205',
    ...sem(
      'an emotional-escalation curve (sentiment worsening across messages)',
    ),
  },
  {
    metric_id: 'SW-206',
    ...sem('a repeated customer question (same ask 3+ times)'),
  },
  {
    metric_id: 'SW-239',
    ...sem('a past mention of family/friend interest (referral mining)'),
  },
  {
    metric_id: 'SW-256',
    ...sem('a past mention of baby/marriage/move/new job (life-event mining)'),
  },
  {
    metric_id: 'SW-285',
    ...sem(
      'an intent classifier (buying-signal/info/objection/complaint/exit)',
    ),
  },
  {
    metric_id: 'SW-286',
    ...sem('a sentiment tracker (per-message + thread-trend deltas)'),
  },
  {
    metric_id: 'SW-287',
    ...sem('question-answer alignment (did the reply address the question?)'),
  },
  {
    metric_id: 'SW-289',
    category: D,
    disposition: 'hold',
    hold_reason:
      'a "personalization score" (template-vs-custom ratio) is an unratified composite; its deterministic components (identical body / merge tags) are promoted separately as SW-021/SW-142/SW-145, but the score formula/threshold is not ratified.',
    missing_item: 'a ratified personalization-score formula + threshold',
  },
]

// ── The full ordered 75-ID candidate list (frozen; derived-from and asserted against the artifact) ──
export const CONTENT_CANDIDATE_IDS: ReadonlyArray<string> = [
  ...CONTENT_PROMOTED_SPECS.map((s) => s.metric_id),
  ...CONTENT_HELD_DECISIONS.map((d) => d.metric_id),
]

export const CONTENT_PROMOTED_IDS: ReadonlyArray<ContentMetricId> =
  CONTENT_PROMOTED_SPECS.map((s) => s.metric_id)

// ── Schema-complete per-ID spec for a HELD row ────────────────────────────────
// Gate 4E-R1: every candidate row (promoted AND held) carries a spec object with the SAME key set
// as the promoted spec. A HELD spec populates fields KNOWN from the literal catalog/capability
// decision (title, population, window, false-positive controls, limitations) and uses EXPLICIT
// `unresolved (held)` / `not_applicable (held)` sentinels for every field that would define an
// executable computation (numerator, denominator, detection_threshold, source_fields, baseline,
// rank direction, false-negative controls) — nothing is invented, and a held spec can never
// masquerade as an executable/promoted definition.
export type HeldSpec = {
  metric_id: string
  title: string
  population: string
  numerator: string
  denominator: string
  detection_threshold: string
  window: string
  zero_denominator: string
  source_fields: Array<string>
  baseline_basis: string
  rank_direction: string
  false_positive_controls: string
  false_negative_controls: string
  limitations: string
}

/** The required per-ID spec schema, DERIVED from the promoted spec (not guessed). Both promoted
 *  and held specs must carry exactly these keys. */
export const CONTENT_SPEC_KEYS: Array<keyof PromotedSpec> = Object.keys(
  CONTENT_PROMOTED_SPECS[0],
) as Array<keyof PromotedSpec>

/** The explicit sentinel marking a field whose executable value is NOT resolved (held). */
export const HELD_UNRESOLVED = 'unresolved (held)' as const

/** Literal catalog/capability facts a held spec may populate from (no inference). */
export type CatalogFacts = {
  condition: string
  period_grain_population: string
  limitations_false_positives: string
  minimum_history: string
}

/** Build a schema-complete held spec: literal catalog/capability where known; explicit
 *  held/not-applicable sentinels for every executable field. */
export function buildHeldSpec(d: ContentDecision, f: CatalogFacts): HeldSpec {
  return {
    metric_id: d.metric_id,
    title: f.condition,
    population: f.period_grain_population || HELD_UNRESOLVED,
    numerator: HELD_UNRESOLVED,
    denominator: HELD_UNRESOLVED,
    detection_threshold: HELD_UNRESOLVED,
    window: f.minimum_history || HELD_UNRESOLVED,
    zero_denominator: 'not evaluated (held); missing is never zero',
    source_fields: [HELD_UNRESOLVED],
    baseline_basis: HELD_UNRESOLVED,
    rank_direction: 'not_applicable (held)',
    false_positive_controls: f.limitations_false_positives || HELD_UNRESOLVED,
    false_negative_controls: HELD_UNRESOLVED,
    limitations: `HELD [${d.category}]: ${d.hold_reason ?? ''}${d.missing_item ? ` Missing: ${d.missing_item}.` : ''}`,
  }
}

// ── FROZEN E1 governing spec contract (Gate 4E-R2) ────────────────────────────
// The GOVERNING per-ID spec schema is this hardcoded literal 14-key set — the frozen E1 contract.
// It is deliberately DISTINCT from the evaluator-metadata `spec` (PromotedSpec) above; that spec is
// evaluator metadata only and does NOT satisfy this contract. Both the generator and the tests hold
// this list literally (the tests declare it independently); a drift fails the suite.
export const FROZEN_E1_SPEC_KEYS = [
  'population',
  'numerator',
  'denominator',
  'event_sequence',
  'window',
  'threshold',
  'minimum_sample',
  'minimum_history',
  'exclusions',
  'ambiguity_handling',
  'join_requirements',
  'unit',
  'rank_direction',
  'missing_data_behavior',
] as const

export type FrozenE1Spec = Record<(typeof FROZEN_E1_SPEC_KEYS)[number], string>

const HELD_NA = 'not_applicable (held)' as const
const SALES_ONLY_EXCL =
  'Service/Parts and service leads/sources permanently excluded (Sales-only boundary)'
const PROMOTE_MISSING_BEHAVIOR =
  'unresolved, not zero (zero eligible population ⇒ unresolved cell; missing is never zero)'
const PROMOTE_MIN_HISTORY =
  'one governed week is sufficient; no history beyond the governed week required'
const PROMOTE_MIN_SAMPLE =
  'none (literal population; no minimum-sample floor — small samples disclosed as confidence, never excluded)'

/** The five PROMOTE frozen specs — every field mapped explicitly from the actual evaluator /
 *  literal condition (values preserved; these describe the executable definition). */
export const PROMOTED_FROZEN_E1: Record<ContentMetricId, FrozenE1Spec> = {
  'SW-142': {
    population:
      'eligible written messages (outbound, Comm Channel Text or Email, non-blank Message Content)',
    numerator:
      'eligible written messages containing an unfilled merge-tag delimiter of an enumerated syntax',
    denominator: 'eligible written messages',
    event_sequence:
      'per-message presence test (no ordering / no thread sequence)',
    window: ONE_WEEK,
    threshold:
      'presence of an unfilled merge-tag delimiter ∈ the enumerated syntaxes (literal)',
    minimum_sample: PROMOTE_MIN_SAMPLE,
    minimum_history: PROMOTE_MIN_HISTORY,
    exclusions: `Logged Call notes, inbound messages, and blank-content rows excluded; ${SALES_ONLY_EXCL}`,
    ambiguity_handling:
      'none (deterministic delimiter regex; enumerated syntaxes disclosed as the recall bound)',
    join_requirements:
      'none (single communication-log family; no cross-source join)',
    unit: 'ratio',
    rank_direction: 'lower_is_better',
    missing_data_behavior: PROMOTE_MISSING_BEHAVIOR,
  },
  'SW-149': {
    population:
      'reps with >=1 eligible written message (literal population; no minimum-message floor)',
    numerator:
      'reps whose mean word count over eligible written messages is < 15',
    denominator: 'reps with >=1 eligible written message',
    event_sequence:
      'per-rep aggregate of per-message word counts (no ordering)',
    window: ONE_WEEK,
    threshold: '< 15 words mean (literal)',
    minimum_sample: PROMOTE_MIN_SAMPLE,
    minimum_history: PROMOTE_MIN_HISTORY,
    exclusions: `Logged Call notes, inbound messages, and blank-content rows excluded; ${SALES_ONLY_EXCL}`,
    ambiguity_handling:
      'word = whitespace token containing a Unicode letter/number (bare punctuation/emoji not counted)',
    join_requirements:
      'none (single communication-log family; no cross-source join)',
    unit: 'ratio',
    rank_direction: 'lower_is_better',
    missing_data_behavior: PROMOTE_MISSING_BEHAVIOR,
  },
  'SW-150': {
    population:
      'reps with >=1 eligible written message (literal population; no minimum-message floor)',
    numerator:
      'reps for whom EVERY eligible written message is link-only (>=1 URL and no other letters/numbers)',
    denominator: 'reps with >=1 eligible written message',
    event_sequence:
      'per-rep universal test over all eligible written messages (no ordering)',
    window: ONE_WEEK,
    threshold: 'every eligible written message is link-only (literal "only")',
    minimum_sample: PROMOTE_MIN_SAMPLE,
    minimum_history: PROMOTE_MIN_HISTORY,
    exclusions: `Logged Call notes, inbound messages, and blank-content rows excluded; ${SALES_ONLY_EXCL}`,
    ambiguity_handling:
      'a message carrying any conversational word alongside a link is not link-only',
    join_requirements:
      'none (single communication-log family; no cross-source join)',
    unit: 'ratio',
    rank_direction: 'lower_is_better',
    missing_data_behavior: PROMOTE_MISSING_BEHAVIOR,
  },
  'SW-145': {
    population:
      'distinct (trim-normalized body, calendar day) groups among eligible written messages',
    numerator:
      'distinct (body, day) groups delivered to > 5 distinct customers (person_token) that day',
    denominator: 'distinct (body, day) groups',
    event_sequence:
      'group eligible written messages by (body-identity, activity_date); count distinct customers per group',
    window: ONE_WEEK,
    threshold:
      '> 5 distinct customers for one identical body in one day (literal)',
    minimum_sample: 'none (literal population; no minimum-sample floor)',
    minimum_history: PROMOTE_MIN_HISTORY,
    exclusions: `Logged Call notes, inbound, and blank-content rows excluded; identical bodies split across days are separate day-groups; ${SALES_ONLY_EXCL}`,
    ambiguity_handling:
      'distinct customers by person_token (a repeat to the same customer counts once); exact trim-normalized body identity',
    join_requirements:
      'none (single communication-log family; no cross-source join)',
    unit: 'ratio',
    rank_direction: 'lower_is_better',
    missing_data_behavior: PROMOTE_MISSING_BEHAVIOR,
  },
  'SW-021': {
    population:
      'reps with >=1 eligible written lead (literal population; no minimum-lead floor)',
    numerator:
      'reps whose single most-frequent identical (trim-normalized) body was sent across > 70% of that rep’s distinct leads',
    denominator: 'reps with >=1 eligible written lead',
    event_sequence:
      'per-rep: group eligible written messages by body-identity, count distinct leads per body, take the modal body’s lead share',
    window: ONE_WEEK,
    threshold: '> 70% of the rep’s distinct leads (literal)',
    minimum_sample:
      'none (literal population; degenerate low-lead flags disclosed, never excluded)',
    minimum_history: PROMOTE_MIN_HISTORY,
    exclusions: `Logged Call notes, inbound, blank-content, and blank-lead rows excluded; ${SALES_ONLY_EXCL}`,
    ambiguity_handling:
      'exact trim-normalized body identity; the single modal body’s distinct-lead share',
    join_requirements:
      'none (single communication-log family; no cross-source join)',
    unit: 'ratio',
    rank_direction: 'lower_is_better',
    missing_data_behavior: PROMOTE_MISSING_BEHAVIOR,
  },
}

/** Governed known facts a HELD frozen spec may populate from (no inference). */
export type FrozenE1HeldFacts = {
  period_grain_population: string // catalog (explicit) or ''
  join_or_nlp_required: string // capability (explicit) or ''
  missing_item: string // decision (explicit) or ''
}

/**
 * Build a HELD frozen E1 spec. Only governed KNOWN facts are populated: catalog population (if
 * explicit), the capability join/NLP requirement + missing item (join_requirements), and the
 * permanent Sales-only exclusions. EVERY other field — including window and minimum_history (the
 * universal one-week is NOT a condition-specific window/history) — is an explicit
 * `unresolved (held)` / `not_applicable (held)` sentinel. Non-executable by construction.
 */
export function buildFrozenE1HeldSpec(f: FrozenE1HeldFacts): FrozenE1Spec {
  return {
    population: f.period_grain_population || HELD_UNRESOLVED,
    numerator: HELD_UNRESOLVED,
    denominator: HELD_UNRESOLVED,
    event_sequence: HELD_UNRESOLVED,
    window: HELD_UNRESOLVED,
    threshold: HELD_UNRESOLVED,
    minimum_sample: HELD_UNRESOLVED,
    minimum_history: HELD_UNRESOLVED,
    exclusions: SALES_ONLY_EXCL,
    ambiguity_handling: HELD_UNRESOLVED,
    join_requirements: f.join_or_nlp_required
      ? `requires ${f.join_or_nlp_required}${f.missing_item ? ` (missing: ${f.missing_item})` : ''}`
      : HELD_UNRESOLVED,
    unit: HELD_UNRESOLVED,
    rank_direction: HELD_NA,
    // missing_data_behavior is a GOVERNED standing rule (not condition-specific), so it is known
    // even while the metric is held.
    missing_data_behavior: 'unresolved; missing is never zero',
  }
}

// ── Evaluators (pure; over the reader's NON-PII content-feature rows) ──────────
const DIR_OUT = 'Outbound'
const WRITTEN_CHANNELS = new Set(['Text', 'Email'])
const LOW_SAMPLE = 5 // DISCLOSURE ONLY threshold (never an exclusion): flag units below this as low-sample

export type ContentCount = {
  numerator: number
  denominator: number
  population_grain: string
  low_sample_flagged: number
  disclosure: string
}

function writtenOutbound(rows: Array<CommContentRow>): Array<CommContentRow> {
  return rows.filter(
    (r) =>
      r.direction === DIR_OUT &&
      WRITTEN_CHANNELS.has(r.channel) &&
      r.content_present,
  )
}

function byKey(
  rows: Array<CommContentRow>,
  key: (r: CommContentRow) => string,
): Map<string, Array<CommContentRow>> {
  const m = new Map<string, Array<CommContentRow>>()
  for (const r of rows) {
    const k = key(r)
    if (k === '') continue // blank id ⇒ no group (absence is never fabricated as identity)
    const a = m.get(k) ?? []
    a.push(r)
    m.set(k, a)
  }
  return m
}

/** SW-142: share of eligible written messages carrying an unfilled merge-tag delimiter. */
export function sw142(rows: Array<CommContentRow>): ContentCount {
  const w = writtenOutbound(rows)
  const num = w.filter((r) => r.has_unfilled_merge_tag).length
  return {
    numerator: num,
    denominator: w.length,
    population_grain: 'eligible written messages',
    low_sample_flagged: 0,
    disclosure: `${num} of ${w.length} eligible written messages carried an unfilled merge-tag delimiter (${MERGE_TAG_SYNTAXES.length} enumerated syntaxes).`,
  }
}

/** SW-149: share of reps whose mean written-message word count is < 15. */
export function sw149(rows: Array<CommContentRow>): ContentCount {
  const byRep = byKey(writtenOutbound(rows), (r) => r.rep_token)
  let flagged = 0
  let lowSample = 0
  for (const [, msgs] of byRep) {
    const mean = msgs.reduce((a, r) => a + r.word_count, 0) / msgs.length
    if (mean < 15) {
      flagged++
      if (msgs.length < LOW_SAMPLE) lowSample++
    }
  }
  return {
    numerator: flagged,
    denominator: byRep.size,
    population_grain: 'reps with >=1 eligible written message',
    low_sample_flagged: lowSample,
    disclosure: `${flagged} of ${byRep.size} reps averaged < 15 words; ${lowSample} flagged rep(s) had < ${LOW_SAMPLE} messages (low sample — disclosed, not excluded).`,
  }
}

/** SW-150: share of reps for whom EVERY eligible written message is link-only. */
export function sw150(rows: Array<CommContentRow>): ContentCount {
  const byRep = byKey(writtenOutbound(rows), (r) => r.rep_token)
  let flagged = 0
  let lowSample = 0
  for (const [, msgs] of byRep) {
    if (msgs.every((r) => r.is_link_only)) {
      flagged++
      if (msgs.length < LOW_SAMPLE) lowSample++
    }
  }
  return {
    numerator: flagged,
    denominator: byRep.size,
    population_grain: 'reps with >=1 eligible written message',
    low_sample_flagged: lowSample,
    disclosure: `${flagged} of ${byRep.size} reps sent only link-only messages; ${lowSample} flagged rep(s) had < ${LOW_SAMPLE} messages (low sample — disclosed, not excluded).`,
  }
}

/** SW-145: share of distinct (body, day) groups delivered to > 5 distinct customers. */
export function sw145(rows: Array<CommContentRow>): ContentCount {
  const w = writtenOutbound(rows).filter((r) => r.body_identity_hash !== '')
  const groups = byKey(w, (r) => `${r.activity_date}|${r.body_identity_hash}`)
  let flagged = 0
  for (const [, msgs] of groups) {
    const customers = new Set(
      msgs.map((r) => r.person_token).filter((p) => p !== ''),
    )
    if (customers.size > 5) flagged++
  }
  return {
    numerator: flagged,
    denominator: groups.size,
    population_grain: 'distinct (body, day) groups',
    low_sample_flagged: 0,
    disclosure: `${flagged} of ${groups.size} distinct (body, day) groups reached > 5 distinct customers.`,
  }
}

/** SW-021: share of reps whose modal identical body covers > 70% of their distinct leads. */
export function sw021(rows: Array<CommContentRow>): ContentCount {
  const w = writtenOutbound(rows).filter((r) => r.body_identity_hash !== '')
  const byRep = byKey(w, (r) => r.rep_token)
  let flagged = 0
  let lowSample = 0
  let denom = 0
  for (const [, msgs] of byRep) {
    const leads = new Set(
      msgs.map((r) => r.thread_token).filter((t) => t !== ''),
    )
    if (leads.size === 0) continue // no distinct lead ⇒ not in the literal population
    denom++
    const bodyLeads = new Map<string, Set<string>>()
    for (const r of msgs) {
      if (r.thread_token === '') continue
      const s = bodyLeads.get(r.body_identity_hash) ?? new Set<string>()
      s.add(r.thread_token)
      bodyLeads.set(r.body_identity_hash, s)
    }
    let modal = 0
    for (const [, s] of bodyLeads) modal = Math.max(modal, s.size)
    if (modal / leads.size > 0.7) {
      flagged++
      if (leads.size < LOW_SAMPLE) lowSample++
    }
  }
  return {
    numerator: flagged,
    denominator: denom,
    population_grain: 'reps with >=1 eligible written lead',
    low_sample_flagged: lowSample,
    disclosure: `${flagged} of ${denom} reps sent one identical body to > 70% of their distinct leads; ${lowSample} flagged rep(s) had < ${LOW_SAMPLE} leads (degenerate low sample — disclosed, not excluded).`,
  }
}

const COMPUTE: Record<
  ContentMetricId,
  { fn: (rows: Array<CommContentRow>) => ContentCount; formula: string }
> = {
  'SW-021': {
    fn: sw021,
    formula:
      'reps whose modal identical (trim-normalized) body covers > 70% of distinct leads / reps with >=1 written lead',
  },
  'SW-142': {
    fn: sw142,
    formula:
      'eligible written messages with an unfilled merge-tag delimiter / eligible written messages',
  },
  'SW-145': {
    fn: sw145,
    formula:
      'distinct (identical body, day) groups delivered to > 5 distinct customers / distinct (body, day) groups',
  },
  'SW-149': {
    fn: sw149,
    formula:
      'reps whose mean written word count < 15 / reps with >=1 written message',
  },
  'SW-150': {
    fn: sw150,
    formula:
      'reps for whom every eligible written message is link-only / reps with >=1 written message',
  },
}

export type ContentRooftopInput = {
  dealer_id: string
  profile: string
  dealer_name: string
  reporting_period: { start: string; end: string; timezone: string }
  content: Array<CommContentRow>
  lineage: {
    capture_id: string
    raw_sha256: string
    manifest_sha256: string
    transform_version: string
    transform_hash: string
    source_url: string
    report_url: string
    family: string
    captured_at: string
  }
}

export type ContentCell = {
  metric_id: ContentMetricId
  dealer_id: string
  profile: string
  status: 'evaluated'
  source_family: string
  source_fields: Array<string>
  formula: string
  formula_version: string
  value: number
  unit: 'ratio'
  numerator: number
  denominator: number
  detection_threshold: string
  baseline: Baseline
  variance: number | null
  rating: 'healthy' | 'watch' | 'breach'
  rank: number
  evaluation_confidence: { label: string; basis: string }
  evaluation_detail: {
    population_grain: string
    low_sample_flagged: number
    disclosure: string
  }
  reporting_period: { start: string; end: string; timezone: string }
  captured_at: string
  lineage: {
    capture_id: string
    raw_sha256: string
    manifest_sha256: string
    transform_version: string
    transform_hash: string
    source_url: string
    report_url: string
  }
  limitations: string
}

export type ContentHeldRow = ContentDecision & {
  status: 'held_unresolved'
  owner: string
  next_action: string
}

export type ContentEvaluation = {
  formula_version: string
  cells: Array<ContentCell>
  held: Array<ContentHeldRow>
  evaluated_ids: Array<ContentMetricId>
}

export class CommContentMetricError extends Error {}

function baselineFor(id: ContentMetricId, title: string): Baseline {
  return {
    basis: 'operational_target',
    id: `comm-content-${id}-red-flag-target-0`,
    label: `${title} — operational target 0`,
    unit: 'ratio',
    value: 0,
    comparator: '>',
    direction: 'lower_is_better',
    source: OPTARGET,
    publication_date: null,
    url: null,
    confidence: 'operational',
    definition:
      'red-flag rate; the operational ideal is 0. The DETECTION threshold inside the numerator (<15 words, >5 customers, >70% of leads, merge-tag present, link-only) is LITERAL from the SW condition; this baseline is the rate target, not an industry benchmark.',
  }
}

/**
 * Evaluate the five promoted deterministic content metrics across the (already provenance- and
 * content-validated) rooftops and record the 70 held IDs. Rank is within the three rooftops per
 * metric. Aggregate-only, pure, deterministic. Fails closed (unresolved, not zero) if any rooftop
 * has an empty eligible population.
 */
export function evaluateCommContentMetrics(
  rooftops: Array<ContentRooftopInput>,
): ContentEvaluation {
  const specById = new Map(CONTENT_PROMOTED_SPECS.map((s) => [s.metric_id, s]))
  const cells: Array<ContentCell> = []

  for (const id of CONTENT_PROMOTED_IDS) {
    const spec = specById.get(id)!
    const per = rooftops.map((rt) => ({
      rt,
      count: COMPUTE[id].fn(rt.content),
    }))
    const values = per.map((p) =>
      p.count.denominator === 0
        ? null
        : p.count.numerator / p.count.denominator,
    )
    for (let i = 0; i < per.length; i++) {
      const { rt, count } = per[i]
      const value = values[i]
      if (value === null || count.denominator === 0)
        throw new CommContentMetricError(
          `${id} ${rt.dealer_id}: zero eligible population — unresolved, not zero (missing is not zero)`,
        )
      const baseline = baselineFor(id, spec.title)
      const peers = values.filter(
        (v, j) => j !== i && v !== null,
      ) as Array<number>
      const lowSample = count.low_sample_flagged > 0
      cells.push({
        metric_id: id,
        dealer_id: rt.dealer_id,
        profile: rt.profile,
        status: 'evaluated',
        source_family: rt.lineage.family,
        source_fields: spec.source_fields,
        formula: COMPUTE[id].formula,
        formula_version: COMM_CONTENT_FORMULA_VERSION,
        value,
        unit: 'ratio',
        numerator: count.numerator,
        denominator: count.denominator,
        detection_threshold: spec.detection_threshold,
        baseline,
        variance: signedVariance(value, baseline),
        rating: value > (baseline.value ?? 0) ? 'breach' : 'healthy',
        rank: rankByDirection(value, peers, 'lower_is_better'),
        evaluation_confidence: {
          label: lowSample ? 'low' : confidenceLabel(count.denominator),
          basis: `denominator ${count.population_grain}=${count.denominator}; ${count.low_sample_flagged} flagged unit(s) below a ${LOW_SAMPLE}-observation low-sample line (disclosed, never excluded)`,
        },
        evaluation_detail: {
          population_grain: count.population_grain,
          low_sample_flagged: count.low_sample_flagged,
          disclosure: count.disclosure,
        },
        reporting_period: rt.reporting_period,
        captured_at: rt.lineage.captured_at,
        lineage: {
          capture_id: rt.lineage.capture_id,
          raw_sha256: rt.lineage.raw_sha256,
          manifest_sha256: rt.lineage.manifest_sha256,
          transform_version: rt.lineage.transform_version,
          transform_hash: rt.lineage.transform_hash,
          source_url: rt.lineage.source_url,
          report_url: rt.lineage.report_url,
        },
        limitations: spec.limitations,
      })
    }
  }

  const held: Array<ContentHeldRow> = CONTENT_HELD_DECISIONS.map((d) => ({
    ...d,
    status: 'held_unresolved',
    owner: 'Huminic Semantic Watchdog pipeline / Duane (ratification)',
    next_action:
      d.category === B
        ? 'stand up a governed, in-boundary semantic provider (no external transmission of customer text) or ratify an exact deterministic definition; do not proxy meaning as keywords'
        : d.category === E
          ? 'admit and govern the required external source; then re-evaluate all three rooftops'
          : 'ratify the concrete metric definition/threshold; do not promote until all three rooftop cells meet acceptance',
  }))

  return {
    formula_version: COMM_CONTENT_FORMULA_VERSION,
    cells,
    held,
    evaluated_ids: [...CONTENT_PROMOTED_IDS],
  }
}
