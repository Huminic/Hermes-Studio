/**
 * Gate 4C2 — Enhanced Sales Communication Log (weekly) METRIC evaluator (privacy-minimized
 * overlay). Pure compute over the reader's NON-PII derived rows; emits ONLY aggregate cells
 * (integer numerator/denominator + derived rate) — never a name, customer, rep/thread token,
 * or message content. It is SEPARATE from the 4-family core spine: comm-derived data never
 * enters buildSpine, so the prior 30 evaluated cells stay byte-semantically identical.
 *
 * Scope (semantically exact, no proxies): promotes exactly SW-022 and SW-133 per rooftop. SW-137
 * is NOT promoted — under conservative unique-minute-bucket adjacency every observed candidate
 * has an ambiguous endpoint, so it is held as a non-promoting candidate guard. The other ten
 * pending IDs are recorded as EXPLICIT held-unresolved with the exact missing item/owner/next-
 * action. Missing is never zero: a rooftop with no eligible population yields an unresolved cell,
 * not a 0.
 */
import {
  confidenceLabel,
  rankByDirection,
  signedVariance,
} from '../evaluator/metrics'
import type { Baseline } from '../evaluator/types'
import type { CommDerivedRow, CommLineage } from './comm-reader'

export const COMM_FORMULA_VERSION = 'comm-metric-v1' as const

// Exact categorical vocabulary observed in the admitted weekly export (fail-closed classify).
const DIR_OUT = 'Outbound'
const DIR_IN = 'Inbound'
const CH_TEXT = 'Text'
const CH_CALL = 'Logged Call'
const CH_EMAIL = 'Email'

/** Labeled operational eligibility floors (anti-noise; NOT proxies for the condition). */
export const MIN_OUTBOUND_SAMPLE = 5 // SW-022: a rep needs >=5 outbound to have a real ratio
export const THREAD_MIN_MESSAGES = 2 // SW-133/137: a thread needs >=2 messages to be assessable
export const SW022_TEXT_CALL_RATIO = 5 // Duane-literal 5:1
const LOW_SAMPLE_EVENTS = 5 // observed events < this ⇒ explicit low-sample footnote

export type CommMetricId = 'SW-022' | 'SW-133' | 'SW-137'

/** One rooftop's already-validated NON-PII derived rows + its lineage. */
export type CommRooftopInput = {
  dealer_id: string
  profile: string
  dealer_name: string
  reporting_period: { start: string; end: string; timezone: string }
  derived: Array<CommDerivedRow>
  lineage: CommLineage
}

export type CommCell = {
  metric_id: CommMetricId
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
  baseline: Baseline
  variance: number | null
  rating: 'healthy' | 'watch' | 'breach' | null
  rank: number
  evaluation_confidence: { label: string; basis: string }
  evaluation_detail: {
    observed_events: number
    eligible_population: number
    population_grain: string
    ambiguous_excluded_endpoints: number
    low_sample: boolean
    footnote: string
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

export type CommGuardEvidence = {
  dealer_id: string
  candidate_numerator: number
  denominator: number
  ambiguous_excluded_endpoints: number
}

export type CommHeldRow = {
  metric_id: string
  status: 'held_unresolved'
  condition: string
  hold_reason: string
  missing_item: string
  owner: string
  next_action: string
  // Present only for IDs kept as a non-promoting candidate guard (e.g. SW-137): the per-rooftop
  // evidence that made the hold necessary (ambiguity that could not be resolved at this data
  // resolution). NON-PII counts only.
  candidate_guard_evidence?: Array<CommGuardEvidence>
}

export type CommEvaluation = {
  formula_version: string
  cells: Array<CommCell>
  held: Array<CommHeldRow>
  evaluated_ids: Array<CommMetricId>
}

// ── Semantic spec (one explicit row per pending ID; committed via the generator) ──────────
type SpecRow = {
  metric_id: string
  title: string
  eligibility: 'evaluation_eligible' | 'held'
  population: string
  numerator: string
  denominator: string
  event_sequence: string
  window: string
  threshold: string
  unit: string
  zero_denominator: string
  minimum_sample: string
  minimum_history: string
  source_fields: Array<string>
  baseline_basis: string
  rank_direction: string
  limitations: string
  hold_reason: string
  held_next_action?: string
}

const ONE_WEEK = 'one governed week (2026-08-24..2026-08-30, America/New_York)'
const OPTARGET =
  'internal operational target (red-flag rate ideal = 0); NOT an industry benchmark'

export const COMM_METRIC_SPECS: Array<SpecRow> = [
  {
    metric_id: 'SW-019',
    title: 'Rep logs <3 outbound calls/day for 2 consecutive days',
    eligibility: 'held',
    population: 'sales reps expected to make calls',
    numerator:
      'reps with <3 outbound Logged Calls on each of 2 consecutive eligible days',
    denominator: 'all rostered sales reps (eligible workdays)',
    event_sequence:
      'per-rep per-day outbound Logged Call count over consecutive days',
    window: ONE_WEEK,
    threshold: '<3 outbound calls/day on 2 consecutive days (literal)',
    unit: 'count',
    zero_denominator: 'unresolved (missing is not zero)',
    minimum_sample: 'n/a',
    minimum_history: ONE_WEEK,
    source_fields: ['rep_token', 'direction', 'channel', 'activity_date'],
    baseline_basis: OPTARGET,
    rank_direction: 'lower_is_better',
    limitations: 'survivorship: a rep who logged nothing is invisible',
    hold_reason:
      'rep population + eligible-workday/absence handling not provable without an accepted roster (CAGE is quarantined; Users is a candidate-unproved route). Comm-log-only reps under-count the worst offenders.',
  },
  {
    metric_id: 'SW-022',
    title: "Rep's outbound text-to-call ratio exceeds 5:1 (avoiding voice)",
    eligibility: 'evaluation_eligible',
    population: 'reps with >=5 outbound Sales comms this week at this rooftop',
    numerator:
      'eligible reps whose outbound Text:Logged-Call ratio > 5:1 (0 calls with >=1 text = total voice avoidance)',
    denominator: 'eligible reps (>=5 outbound)',
    event_sequence:
      'per-rep count of outbound Text vs outbound Logged Call; flag if calls==0&texts>0 OR texts>5*calls',
    window: ONE_WEEK,
    threshold: '>5:1 (Duane-literal)',
    unit: 'ratio (flagged reps / eligible reps)',
    zero_denominator: 'unresolved when no rep reaches the >=5 outbound floor',
    minimum_sample:
      '>=5 outbound per rep (labeled operational floor, anti-noise)',
    minimum_history: ONE_WEEK,
    source_fields: ['rep_token', 'direction', 'channel'],
    baseline_basis: OPTARGET,
    rank_direction: 'lower_is_better',
    limitations:
      'outbound-only scope; a rep below the floor is not judged; does not distinguish deliberate avoidance from customer channel preference; cross-rooftop shared staff counted only for their activity at this rooftop',
    hold_reason: '',
  },
  {
    metric_id: 'SW-026',
    title: 'Rep never uses video/personalized media while peers do',
    eligibility: 'held',
    population: 'active reps at the rooftop',
    numerator: 'reps with zero video while peers use video',
    denominator: 'active reps',
    event_sequence: 'per-rep has_video presence vs peer video usage',
    window: ONE_WEEK,
    threshold: 'never (0 video) while peers > 0',
    unit: 'count',
    zero_denominator: 'unresolved',
    minimum_sample: 'n/a',
    minimum_history: 'multi-week required to establish "never"',
    source_fields: ['rep_token', 'has_video'],
    baseline_basis: OPTARGET,
    rank_direction: 'lower_is_better',
    limitations: '"no video this week" != "never uses video"',
    hold_reason:
      '"never" needs multi-week history; a single week only shows "no video this week" and would misclassify biweekly/occasional video users. Insufficient history.',
  },
  {
    metric_id: 'SW-076',
    title: 'Response latency grows across a thread (fade-out)',
    eligibility: 'held',
    population: 'threads with >=3 rep responses',
    numerator: 'threads with monotonically growing rep response latency',
    denominator: 'threads with >=3 rep responses',
    event_sequence:
      'ordered rep response gaps within a thread; test monotonic growth',
    window: ONE_WEEK,
    threshold: 'monotonic growth (definition unratified)',
    unit: 'count',
    zero_denominator: 'unresolved',
    minimum_sample: '>=3 response gaps',
    minimum_history: ONE_WEEK,
    source_fields: ['thread_token', 'direction', 'activity_iso'],
    baseline_basis: OPTARGET,
    rank_direction: 'lower_is_better',
    limitations: 'single week truncates threads (censoring)',
    hold_reason:
      'requires business-hours-adjusted latency + a ratified "grows" definition + thread censoring handling; distinct from SW-134. Material semantic choices unresolved.',
  },
  {
    metric_id: 'SW-084',
    title: 'BDC connect rate falls below 35%',
    eligibility: 'held',
    population: 'BDC reps/dials',
    numerator: 'connected calls',
    denominator: 'call attempts',
    event_sequence: 'BDC outbound call dispositions',
    window: ONE_WEEK,
    threshold: '<35% (Duane-literal)',
    unit: 'ratio',
    zero_denominator: 'unresolved',
    minimum_sample: 'n/a',
    minimum_history: ONE_WEEK,
    source_fields: ['user_group', 'direction', 'channel', 'interaction_result'],
    baseline_basis: OPTARGET,
    rank_direction: 'higher_is_better',
    limitations: 'interaction_result ~61% blank and channel-mixed',
    hold_reason:
      'native source (CAGE/Enterprise Performance) is quarantined; user_group is BDC/Internet combined (not pure BDC); interaction_result is ~61% blank and mixes channels, so the connect numerator / attempt denominator are not derivable.',
  },
  {
    metric_id: 'SW-086',
    title: 'Voicemails left without follow-up text/email within 15 minutes',
    eligibility: 'held',
    population: 'voicemails left by reps',
    numerator:
      'voicemails with no same-thread follow-up text/email within 15 min',
    denominator: 'voicemails left',
    event_sequence: 'reached-voicemail then follow-up channel within 15 min',
    window: ONE_WEEK,
    threshold: '<=15 minutes (Duane-literal)',
    unit: 'count',
    zero_denominator: 'unresolved',
    minimum_sample: 'n/a',
    minimum_history: ONE_WEEK,
    source_fields: [
      'thread_token',
      'direction',
      'channel',
      'interaction_result',
      'activity_iso',
    ],
    baseline_basis: OPTARGET,
    rank_direction: 'lower_is_better',
    limitations:
      'Answering Machine = reached voicemail, not proof a message was left',
    hold_reason:
      '"voicemail left" is unprovable: interaction_result "Answering Machine" only proves an outbound call reached a voicemail system, not that a message was left. Material meaning change (a proxy, not the literal condition).',
  },
  {
    metric_id: 'SW-132',
    title:
      "Customer's last message unanswered >4 business hours during active thread",
    eligibility: 'held',
    population: 'active threads with an unanswered inbound customer message',
    numerator: 'inbound customer messages unanswered >4 business hours',
    denominator: 'active threads',
    event_sequence:
      'inbound customer message with no subsequent rep reply within 4 business hours',
    window: ONE_WEEK,
    threshold: '>4 business hours (external Sales-hours calendar)',
    unit: 'count',
    zero_denominator: 'unresolved',
    minimum_sample: 'n/a',
    minimum_history: ONE_WEEK,
    source_fields: ['thread_token', 'direction', 'activity_iso'],
    baseline_basis: OPTARGET,
    rank_direction: 'lower_is_better',
    limitations:
      'external Sales hours captured 2026-09-01 (serra280.com / tonyserraford.com: Mon-Sat 9:00-19:00, Sun closed, America/New_York) but "active thread" + right-censoring + as-of reference remain unratified',
    hold_reason:
      'needs a ratified "active thread" definition + right-censoring (late-week inbound messages have not had 4 business hours to be answered by capture) + an as-of reference. These choices materially move the count (fail closed under truth-over-compliance).',
  },
  {
    metric_id: 'SW-133',
    title:
      'Rep replies after customer sent 2+ consecutive messages (customer chasing rep)',
    eligibility: 'evaluation_eligible',
    population: 'threads with >=2 messages this week',
    numerator:
      'threads containing a run of >=2 consecutive inbound customer messages immediately followed by an outbound rep message',
    denominator: 'threads with >=2 messages',
    event_sequence:
      'for each outbound reply at minute o, count inbound at a minute strictly in (rep’s previous outbound minute, o); >=2 flags the thread (timestamp-value rule; invariant to same-minute tie order)',
    window: ONE_WEEK,
    threshold: '>=2 consecutive inbound then a reply (literal)',
    unit: 'ratio (chasing threads / eligible threads)',
    zero_denominator: 'unresolved when no thread has >=2 messages',
    minimum_sample: '>=2 messages per thread',
    minimum_history: ONE_WEEK,
    source_fields: ['thread_token', 'direction', 'activity_iso'],
    baseline_basis: OPTARGET,
    rank_direction: 'lower_is_better',
    limitations:
      'minute-resolution timestamps: the rule is a function of the (direction, minute) multiset only, so it is invariant to same-minute ordering (an arbitrary tie-break would swing the count materially); an inbound sharing the reply minute is conservatively excluded and disclosed (ambiguous_excluded_endpoints); conservative/right-truncated at the window edge (under-counts, never over-counts); does not assert customer dissatisfaction',
    hold_reason: '',
  },
  {
    metric_id: 'SW-134',
    title: 'Response gap widens across a thread (2h -> 8h -> 24h)',
    eligibility: 'held',
    population: 'threads with >=3 rep responses',
    numerator: 'threads matching the 2h->8h->24h escalation',
    denominator: 'threads with >=3 rep responses',
    event_sequence: 'three consecutive escalating rep response gaps',
    window: ONE_WEEK,
    threshold:
      '2h -> 8h -> 24h (pattern, unratified wall-clock vs business-hours)',
    unit: 'count',
    zero_denominator: 'unresolved',
    minimum_sample: '>=3 response gaps',
    minimum_history: ONE_WEEK,
    source_fields: ['thread_token', 'direction', 'activity_iso'],
    baseline_basis: OPTARGET,
    rank_direction: 'lower_is_better',
    limitations:
      'needs >=3 rep-response cycles per thread in one week (history-limited)',
    hold_reason:
      'requires >=3 rep-response cycles per thread within one week (history-limited) and a ratified wall-clock vs business-hours basis. Material.',
  },
  {
    metric_id: 'SW-137',
    title: 'Rep replies to text with email (channel mismatch)',
    eligibility: 'held',
    population: 'threads with >=2 messages this week',
    numerator:
      'threads with an inbound Text immediately followed by an outbound Email (same thread)',
    denominator: 'threads with >=2 messages',
    event_sequence:
      'distinct minute buckets: a SINGLETON inbound-Text bucket immediately followed by a SINGLETON outbound-Email bucket (next distinct bucket). Non-singleton endpoint buckets leave within-minute order unknowable and are EXCLUDED from the numerator + disclosed; eligibility/count never depend on same-minute order',
    window: ONE_WEEK,
    threshold:
      'channel mismatch (literal): inbound Text answered by outbound Email',
    unit: 'ratio (mismatch threads / eligible threads)',
    zero_denominator: 'unresolved when no thread has >=2 messages',
    minimum_sample: '>=2 messages per thread',
    minimum_history: ONE_WEEK,
    source_fields: ['thread_token', 'direction', 'channel', 'activity_iso'],
    baseline_basis: OPTARGET,
    rank_direction: 'lower_is_better',
    limitations:
      'every observed candidate had an ambiguous same-minute endpoint bucket; the numerator would depend on unknowable within-minute order, so no unambiguous event survives',
    hold_reason:
      'under the conservative unique-minute-bucket adjacency, every observed inbound-Text->outbound-Email candidate has a non-singleton endpoint bucket (Honda 1, Nissan 1, Ford 0 candidate events, all ambiguous). The earlier 1/1/0 depended on unknowable within-minute ordering; reporting 0 would fabricate "missing" as zero. Under all-three-rooftops-or-no-metric, held across all three.',
    held_next_action:
      'acquire a higher-resolution timestamp (seconds) or an unambiguous message-sequence source so inbound-Text->outbound-Email adjacency can be established without same-minute ambiguity; then re-evaluate all three rooftops.',
  },
  {
    metric_id: 'SW-138',
    title:
      'Multiple rapid-fire rep messages with no customer reply (spammy cadence)',
    eligibility: 'held',
    population: 'threads',
    numerator:
      'threads with >=K rapid-fire outbound messages and no inbound between',
    denominator: 'threads',
    event_sequence:
      'run of >=K consecutive outbound within T minutes, no inbound between',
    window: ONE_WEEK,
    threshold: '"multiple"/"rapid-fire" = operational proxy (K, T unratified)',
    unit: 'count',
    zero_denominator: 'unresolved',
    minimum_sample: 'n/a',
    minimum_history: ONE_WEEK,
    source_fields: ['thread_token', 'direction', 'activity_iso'],
    baseline_basis: OPTARGET,
    rank_direction: 'lower_is_better',
    limitations:
      'the proxy parameters swing the result ~3x (>=3-in-60min flags ~33% of threads = normal multi-touch cadence)',
    hold_reason:
      'authorized only as a labeled operational proxy, but "multiple"/"rapid-fire" (K count, T window) are unratified and materially change the flag population. No proxy substitution permitted here — held for ratification.',
  },
  {
    metric_id: 'SW-288',
    title:
      'Cadence health composite (response times, message balance, thread momentum)',
    eligibility: 'held',
    population: 'threads',
    numerator: 'composite score components',
    denominator: 'n/a',
    event_sequence: 'weighted composite of component metrics',
    window: ONE_WEEK,
    threshold: 'composite (component formulas/weights unratified)',
    unit: 'score',
    zero_denominator: 'unresolved',
    minimum_sample: 'n/a',
    minimum_history: 'multi-week (momentum)',
    source_fields: ['thread_token', 'direction', 'channel', 'activity_iso'],
    baseline_basis: OPTARGET,
    rank_direction: 'higher_is_better',
    limitations: 'depends on unresolved response-time + momentum components',
    hold_reason:
      'composite over components that are themselves unresolved (SW-076/SW-134 held; momentum needs history). A composite cannot hide unresolved components.',
  },
]

// NOTE ON TIME RESOLUTION: Activity timestamps are MINUTE-resolution with a single fixed
// offset (-04:00), so `activity_iso` string equality ⟺ same minute, and lexicographic order ⟺
// chronological order. Same-minute events therefore cannot be sub-ordered from the data. Both
// thread metrics below are defined over timestamp VALUES (not array position), so they are
// fully invariant to any same-minute tie ordering — an arbitrary tie-break would otherwise
// swing SW-133 materially (13 vs 12 vs 3 under three different tie-breaks on the same bytes).

function groupBy(
  rows: Array<CommDerivedRow>,
  key: (r: CommDerivedRow) => string,
): Map<string, Array<CommDerivedRow>> {
  const m = new Map<string, Array<CommDerivedRow>>()
  for (const r of rows) {
    const k = key(r)
    if (k === '') continue // blank id ⇒ no group (absence is not fabricated as identity)
    const arr = m.get(k) ?? []
    arr.push(r)
    m.set(k, arr)
  }
  return m
}

type Count = {
  numerator: number
  denominator: number
  population: number
  // Threads (or reps) that would flag ONLY under some same-minute ordering — conservatively
  // EXCLUDED from the numerator and disclosed. 0 when the metric has no endpoint ambiguity.
  ambiguous_excluded: number
}

/** Distinct minute buckets of a thread, minute-key -> events. activity_iso == minute identity. */
function minuteBuckets(
  th: Array<CommDerivedRow>,
): Map<string, Array<CommDerivedRow>> {
  const b = new Map<string, Array<CommDerivedRow>>()
  for (const r of th) {
    const a = b.get(r.activity_iso) ?? []
    a.push(r)
    b.set(r.activity_iso, a)
  }
  return b
}

/** SW-022: share of eligible reps whose outbound text:call ratio exceeds 5:1. Count-based, so
 *  there is no event ordering and no same-minute ambiguity. */
export function sw022(rows: Array<CommDerivedRow>): Count {
  const byRep = groupBy(rows, (r) => r.rep_token)
  let eligible = 0
  let flagged = 0
  for (const [, rep] of byRep) {
    const out = rep.filter((r) => r.direction === DIR_OUT)
    if (out.length < MIN_OUTBOUND_SAMPLE) continue
    eligible++
    const t = out.filter((r) => r.channel === CH_TEXT).length
    const c = out.filter((r) => r.channel === CH_CALL).length
    if ((c === 0 && t > 0) || t > SW022_TEXT_CALL_RATIO * c) flagged++
  }
  return {
    numerator: flagged,
    denominator: eligible,
    population: byRep.size,
    ambiguous_excluded: 0,
  }
}

/**
 * SW-133: threads where a rep replies after >=2 consecutive inbound customer messages.
 * Order-invariant: for each outbound "reply" at minute o, let mp be the rep's previous outbound
 * minute (or none); the customer messages "since the rep's last touch" are the inbound at a
 * minute strictly in (mp, o). >=2 flags the thread. Strict inequalities on timestamp VALUES make
 * the result a function of the (direction, minute) multiset only — invariant to any same-minute
 * reordering. An inbound sharing the reply minute o is NOT counted (its order vs the reply is
 * unknowable): such a borderline thread is conservatively excluded and DISCLOSED, never flagged
 * on arbitrary order.
 */
export function sw133(rows: Array<CommDerivedRow>): Count {
  const byThread = groupBy(rows, (r) => r.thread_token)
  let eligible = 0
  let flagged = 0
  let ambiguous = 0
  for (const [, th] of byThread) {
    if (th.length < THREAD_MIN_MESSAGES) continue
    eligible++
    const outs = th
      .filter((r) => r.direction === DIR_OUT)
      .map((r) => r.activity_iso)
    const ins = th
      .filter((r) => r.direction === DIR_IN)
      .map((r) => r.activity_iso)
    let strictHit = false
    let borderlineHit = false // would flag only if a reply-minute inbound were ordered first
    for (const o of outs) {
      let mp = '' // rep's previous outbound minute strictly before o ('' = none)
      for (const p of outs) if (p < o && p > mp) mp = p
      let strict = 0
      let borderline = 0
      for (const mi of ins) {
        if (mi > mp && mi < o) strict++
        if (mi > mp && mi <= o) borderline++ // includes an inbound sharing the reply minute
      }
      if (strict >= 2) strictHit = true
      if (borderline >= 2) borderlineHit = true
    }
    if (strictHit) flagged++
    else if (borderlineHit) ambiguous++
  }
  return {
    numerator: flagged,
    denominator: eligible,
    population: byThread.size,
    ambiguous_excluded: ambiguous,
  }
}

/**
 * SW-137: threads where an inbound customer Text is answered by an outbound rep Email as the
 * immediately following event. Adjacency is defined over DISTINCT minute buckets: the origin
 * (inbound-Text) bucket and the reply (outbound-Email) bucket must each be a SINGLETON (no other
 * event in that minute that could reorder adjacency), and the reply bucket must be the NEXT
 * distinct bucket after the origin. If a text->next-bucket-email candidate exists but an endpoint
 * bucket is non-singleton, the within-minute order is unknowable: that thread is EXCLUDED from the
 * numerator and DISCLOSED (never counted on arbitrary order). Uses minute-bucket values only, so
 * eligibility and count are invariant to same-minute permutation.
 */
export function sw137(rows: Array<CommDerivedRow>): Count {
  const byThread = groupBy(rows, (r) => r.thread_token)
  let eligible = 0
  let flagged = 0
  let ambiguous = 0
  for (const [, th] of byThread) {
    if (th.length < THREAD_MIN_MESSAGES) continue
    eligible++
    const buckets = minuteBuckets(th)
    const minutes = [...buckets.keys()].sort()
    let unambiguousHit = false
    let ambiguousCandidate = false
    for (let k = 0; k < minutes.length - 1; k++) {
      const origin = buckets.get(minutes[k])!
      const reply = buckets.get(minutes[k + 1])! // the next distinct bucket
      const originHasInText = origin.some(
        (e) => e.direction === DIR_IN && e.channel === CH_TEXT,
      )
      const replyHasOutEmail = reply.some(
        (e) => e.direction === DIR_OUT && e.channel === CH_EMAIL,
      )
      if (!originHasInText || !replyHasOutEmail) continue
      if (origin.length === 1 && reply.length === 1) unambiguousHit = true
      else ambiguousCandidate = true // an endpoint bucket carries conflicting extra events
    }
    if (unambiguousHit) flagged++
    else if (ambiguousCandidate) ambiguous++
  }
  return {
    numerator: flagged,
    denominator: eligible,
    population: byThread.size,
    ambiguous_excluded: ambiguous,
  }
}

const COMPUTE: Record<
  CommMetricId,
  { fn: (rows: Array<CommDerivedRow>) => Count; grain: string; formula: string }
> = {
  'SW-022': {
    fn: sw022,
    grain: 'reps (>=5 outbound)',
    formula:
      'flagged_reps / eligible_reps; rep flagged if outbound_calls==0&outbound_texts>0 OR outbound_texts>5*outbound_calls',
  },
  'SW-133': {
    fn: sw133,
    grain: 'threads (>=2 messages)',
    formula:
      'threads with a reply preceded by >=2 inbound since the rep’s previous outbound (timestamp-value rule, tie-order-invariant) / threads_with(>=2 messages)',
  },
  'SW-137': {
    fn: sw137,
    grain: 'threads (>=2 messages)',
    formula:
      'threads with an inbound Text answered by an outbound Email at a strictly later minute with no message between (timestamp-value rule, tie-order-invariant) / threads_with(>=2 messages)',
  },
}

// Promoted (all-three-rooftops-or-no-metric). SW-137 is NOT promoted: under the conservative
// unique-minute-bucket adjacency every observed candidate has an ambiguous endpoint, so no
// unambiguous event survives and reporting 0 would fabricate "missing" as zero. It is retained
// as a non-promoting CANDIDATE GUARD whose per-rooftop evidence backs the hold.
const PROMOTED: Array<CommMetricId> = ['SW-022', 'SW-133']
const CANDIDATE_GUARDS: Array<CommMetricId> = ['SW-137']

function baselineFor(id: CommMetricId, title: string): Baseline {
  return {
    basis: 'operational_target',
    id: `comm-${id}-red-flag-target-0`,
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
      'red-flag rate; the operational ideal is 0 (no flagged reps/threads). Not an industry benchmark.',
  }
}

/**
 * Evaluate the two promoted comm metrics (SW-022, SW-133) across the (already provenance-
 * validated) rooftops and record the ten held IDs (incl. SW-137). Rank is computed within the
 * three rooftops per metric. Output is aggregate-only (no PII). Pure + deterministic.
 */
export function evaluateCommMetrics(
  rooftops: Array<CommRooftopInput>,
): CommEvaluation {
  const specById = new Map(COMM_METRIC_SPECS.map((s) => [s.metric_id, s]))
  const cells: Array<CommCell> = []

  for (const id of PROMOTED) {
    const spec = specById.get(id)!
    const per = rooftops.map((rt) => ({
      rt,
      count: COMPUTE[id].fn(rt.derived),
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
        throw new CommMetricError(
          `${id} ${rt.dealer_id}: zero eligible population — unresolved, not zero (missing is not zero)`,
        )
      const baseline = baselineFor(id, spec.title)
      const peers = values.filter(
        (v, j) => j !== i && v !== null,
      ) as Array<number>
      const lowSample = count.numerator < LOW_SAMPLE_EVENTS
      cells.push({
        metric_id: id,
        dealer_id: rt.dealer_id,
        profile: rt.profile,
        status: 'evaluated',
        source_family: rt.lineage.family,
        source_fields: spec.source_fields,
        formula: COMPUTE[id].formula,
        formula_version: COMM_FORMULA_VERSION,
        value,
        unit: 'ratio',
        numerator: count.numerator,
        denominator: count.denominator,
        baseline,
        variance: signedVariance(value, baseline),
        rating:
          value > (baseline.value ?? 0)
            ? 'breach'
            : ('healthy' as 'healthy' | 'watch' | 'breach'),
        rank: rankByDirection(value, peers, 'lower_is_better'),
        evaluation_confidence: {
          label: lowSample ? 'low' : confidenceLabel(count.denominator),
          basis: `observed events=${count.numerator}, eligible ${COMPUTE[id].grain}=${count.denominator}; small observed-event counts reduce estimate precision`,
        },
        evaluation_detail: {
          observed_events: count.numerator,
          eligible_population: count.denominator,
          population_grain: COMPUTE[id].grain,
          ambiguous_excluded_endpoints: count.ambiguous_excluded,
          low_sample: lowSample,
          footnote:
            (lowSample
              ? `LOW SAMPLE: ${count.numerator} observed event(s) over ${count.denominator} eligible ${COMPUTE[id].grain}; interpret as a screening signal, not a precise rate.`
              : `${count.numerator} observed event(s) over ${count.denominator} eligible ${COMPUTE[id].grain}.`) +
            (count.ambiguous_excluded > 0
              ? ` ${count.ambiguous_excluded} additional ${COMPUTE[id].grain} conservatively EXCLUDED because a same-minute endpoint bucket left within-minute order unknowable (never counted on arbitrary order).`
              : ''),
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

  // Non-promoting candidate-guard evidence (e.g. SW-137): compute per rooftop, attach to the
  // hold so the ambiguity that blocked promotion is auditable. Never emits an evaluated cell.
  const guardEvidence = new Map<string, Array<CommGuardEvidence>>()
  for (const id of CANDIDATE_GUARDS) {
    guardEvidence.set(
      id,
      rooftops.map((rt) => {
        const count = COMPUTE[id].fn(rt.derived)
        return {
          dealer_id: rt.dealer_id,
          candidate_numerator: count.numerator,
          denominator: count.denominator,
          ambiguous_excluded_endpoints: count.ambiguous_excluded,
        }
      }),
    )
  }

  const held: Array<CommHeldRow> = COMM_METRIC_SPECS.filter(
    (s) => s.eligibility === 'held',
  ).map((s) => {
    const guard = guardEvidence.get(s.metric_id)
    return {
      metric_id: s.metric_id,
      status: 'held_unresolved',
      condition: s.title,
      hold_reason: s.hold_reason,
      missing_item: s.limitations,
      owner: 'Huminic Semantic Watchdog pipeline / Duane (ratification)',
      next_action:
        s.held_next_action ??
        'ratify the named semantic/input (or accumulate history); do not promote until all three rooftop cells meet acceptance',
      ...(guard ? { candidate_guard_evidence: guard } : {}),
    }
  })

  return {
    formula_version: COMM_FORMULA_VERSION,
    cells,
    held,
    evaluated_ids: [...PROMOTED],
  }
}

export class CommMetricError extends Error {}
