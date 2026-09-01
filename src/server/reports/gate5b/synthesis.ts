/**
 * Gate 5B — customer-facing automotive-consultant synthesis (pure logic).
 *
 * Gate 5B turns the ALREADY-committed evaluated corpus (Gate 5A comparison + peer-rank ledgers) and the
 * committed unresolved partition (Gate 4H) into a deterministic, customer-safe consultant synthesis for
 * the three governed Sales rooftops. It alters NO metric value, rank, classification, baseline mapping,
 * or the 51/834/885 accounting, and it computes NO new evaluation. Every narrative string is a pure
 * template of the committed facts, so a rerun is byte-identical.
 *
 * Separation of claims is explicit everywhere: `fact` (a measured value), `inference` (a defensible
 * reading of ≥2 facts), `hypothesis` (needs more evidence), `recommendation` (an action). No customer
 * string may expose an internal path, report title, hold/quarantine term, CRM field name, rep/customer
 * identity, raw message, PII, or developer language (see {@link assertCustomerSafe}).
 *
 * This module is PURE (no I/O). The generator assembles {@link MetricFact}s from the committed ledgers
 * and calls these builders.
 */
import {
  CUSTOMER_FORBIDDEN,
  ROOFTOPS,
  assertProjectionSafe,
} from '@/server/reports/gate5a/baseline-rank'

export type Rating = 'healthy' | 'watch' | 'breach'
export type ClaimLayer = 'fact' | 'inference' | 'hypothesis' | 'recommendation'

/** Customer-friendly labels for the 17 evaluated metrics (never the raw CRM/condition text). */
export const METRIC_LABEL: Record<string, string> = {
  'SW-011': 'Median first-response time (business hours)',
  'SW-012': 'Leads left untouched past 30 minutes',
  'SW-015': 'Rep first-response outliers vs the store median',
  'SW-021': 'Templated messages with no personalization',
  'SW-022': 'Text-vs-call balance (voice avoidance)',
  'SW-031': 'Lead-to-appointment set rate',
  'SW-032': 'Appointment show rate',
  'SW-033': 'Show-to-write rate',
  'SW-041': 'Appointment no-show rate',
  'SW-045': 'Be-backs vs fresh-ups balance',
  'SW-046': 'Test-drive completion rate',
  'SW-090': 'Leads unassigned past 2 hours',
  'SW-133': 'Customers sending 2+ messages before a reply',
  'SW-142': 'Unfilled personalization tags in messages',
  'SW-145': 'Same message reused across many customers',
  'SW-149': 'Very short, low-effort replies',
  'SW-150': 'Link-only replies with no context',
}

export type ClusterKey = 'A' | 'B' | 'C' | 'D'
export type ClusterDef = {
  key: ClusterKey
  title: string
  metric_ids: Array<string>
  default_owner: string
  measures: string
}
export const CLUSTERS: ReadonlyArray<ClusterDef> = [
  {
    key: 'A',
    title: 'Response consistency',
    metric_ids: ['SW-011', 'SW-012', 'SW-015'],
    default_owner: 'Sales Manager',
    measures: 'how fast and how evenly new leads get a first response',
  },
  {
    key: 'B',
    title: 'Conversation effectiveness',
    metric_ids: [
      'SW-021',
      'SW-022',
      'SW-133',
      'SW-142',
      'SW-145',
      'SW-149',
      'SW-150',
    ],
    default_owner: 'Sales Manager',
    measures: 'the quality and personalization of customer messaging',
  },
  {
    key: 'C',
    title: 'Appointment conversion',
    metric_ids: ['SW-031', 'SW-032', 'SW-033', 'SW-041'],
    default_owner: 'Sales Manager',
    measures: 'how leads move to set, shown, and written appointments',
  },
  {
    key: 'D',
    title: 'Showroom execution and ownership',
    metric_ids: ['SW-045', 'SW-046', 'SW-090'],
    default_owner: 'Sales Manager',
    measures: 'showroom follow-through, test-drives, and lead ownership',
  },
]

/** Every evaluated metric appears in exactly one cluster (asserted in the generator). */
export const CLUSTER_OF: Record<string, ClusterKey> = Object.fromEntries(
  CLUSTERS.flatMap((c) => c.metric_ids.map((m) => [m, c.key])),
)

// ─────────────────────────────────────────────────────────────────────────────
// MetricFact — the committed, per-dealer measured fact the generator assembles.
// ─────────────────────────────────────────────────────────────────────────────

export type MetricFact = {
  metric_id: string
  label: string
  dealer_id: string
  value: number
  unit: string
  value_display: string
  threshold: number
  threshold_display: string
  comparator: string
  direction: 'higher_is_better' | 'lower_is_better'
  rating: Rating
  native_variance: number
  display_variance: string
  confidence: string
  rank: number
  numerator: number
  denominator: number
  industry_reference_id: string | null
}

export function pct(v: number): string {
  return `${Math.round(v * 1000) / 10}%`
}
export function valueDisplay(value: number, unit: string): string {
  if (unit === 'minutes') return `${Math.round(value * 10) / 10} min`
  if (unit.startsWith('ratio')) return pct(value)
  return String(Math.round(value * 1000) / 1000)
}

/** A plain measured-fact sentence for one metric (the `fact` claim layer). */
export function factLine(f: MetricFact): string {
  const dir =
    f.direction === 'lower_is_better'
      ? 'target at or below'
      : 'target at or above'
  const rankWord =
    f.rank === 1
      ? 'strongest of the three rooftops'
      : f.rank === 3
        ? 'weakest of the three rooftops'
        : 'middle of the three rooftops'
  return `${f.label}: ${f.value_display} (${dir} ${f.threshold_display}; ${ratingWord(f.rating)}; ${rankWord}).`
}
export function ratingWord(r: Rating): string {
  return r === 'healthy'
    ? 'on target'
    : r === 'watch'
      ? 'near the target line'
      : 'off target'
}

// ─────────────────────────────────────────────────────────────────────────────
// Cluster narratives (deterministic templates from the facts).
// ─────────────────────────────────────────────────────────────────────────────

export type Action = {
  action: string
  owner: string
  cadence: string
  success_measure: string
  effort: 'low' | 'medium' | 'high'
  impact: 'low' | 'medium' | 'high'
}
export type ClusterBlock = {
  cluster: ClusterKey
  title: string
  facts: Array<{
    metric_id: string
    claim: 'fact'
    text: string
    rating: Rating
    rank: number
  }>
  peer_rank: Array<{ metric_id: string; rank: number }>
  narrative: string
  implication: {
    claim: 'inference' | 'hypothesis'
    text: string
    cites: Array<string>
  }
  hypotheses: Array<{ claim: 'hypothesis'; text: string; cites: Array<string> }>
  actions: Array<Action>
}

const byId = (facts: Array<MetricFact>) =>
  Object.fromEntries(facts.map((f) => [f.metric_id, f])) as Record<
    string,
    MetricFact
  >

export function buildClusterBlock(
  cluster: ClusterDef,
  clusterFacts: Array<MetricFact>,
): ClusterBlock {
  const m = byId(clusterFacts)
  const facts = cluster.metric_ids.map((id) => ({
    metric_id: id,
    claim: 'fact' as const,
    text: factLine(m[id]),
    rating: m[id].rating,
    rank: m[id].rank,
  }))
  const built =
    cluster.key === 'A'
      ? clusterA(m)
      : cluster.key === 'B'
        ? clusterB(m)
        : cluster.key === 'C'
          ? clusterC(m)
          : clusterD(m)

  return {
    cluster: cluster.key,
    title: cluster.title,
    facts,
    peer_rank: cluster.metric_ids.map((id) => ({
      metric_id: id,
      rank: m[id].rank,
    })),
    narrative: built.narrative,
    implication: built.implication,
    hypotheses: built.hypotheses,
    actions: built.actions,
  }
}

type Built = {
  narrative: string
  implication: ClusterBlock['implication']
  hypotheses: ClusterBlock['hypotheses']
  actions: Array<Action>
}

function clusterA(m: Record<string, MetricFact>): Built {
  const median = m['SW-011']
  const untouched = m['SW-012']
  const outliers = m['SW-015']
  const masks =
    median.rating === 'healthy' &&
    (untouched.rating !== 'healthy' || outliers.rating !== 'healthy')
  const narrative = masks
    ? `The store-average first-response time is ${median.value_display}, which reads on target — but that average hides inconsistency: ${pct(untouched.value)} of business-hours leads were left untouched past 30 minutes and rep first-response outliers are ${ratingWord(outliers.rating)}. A healthy median can coexist with leads that never get worked, so average speed alone overstates coverage.`
    : `First-response speed is ${median.value_display} (${ratingWord(median.rating)}); untouched-lead rate is ${pct(untouched.value)} and rep outliers are ${ratingWord(outliers.rating)}. Speed and consistency are moving together this period.`
  return {
    narrative,
    implication: {
      claim: masks ? 'inference' : 'inference',
      text: masks
        ? 'Coaching to the store average would miss the real gap; the opportunity is even coverage of every lead, not a faster headline median.'
        : 'Response coverage is broadly consistent; hold the current pace and watch the outlier rate.',
      cites: ['SW-011', 'SW-012', 'SW-015'],
    },
    hypotheses: [
      {
        claim: 'hypothesis',
        text: 'Untouched leads may concentrate in specific hours, sources, or individual reps rather than being spread evenly; a per-rep/per-hour view would confirm.',
        cites: ['SW-012', 'SW-015'],
      },
    ],
    actions: [
      untouched.rating !== 'healthy'
        ? {
            action:
              'Stand up a daily untouched-lead sweep so no business-hours lead passes 30 minutes without a first response.',
            owner: 'Sales Manager',
            cadence: 'daily',
            success_measure: 'untouched-past-30-minutes rate trending to zero',
            effort: 'low' as const,
            impact: 'high' as const,
          }
        : {
            action:
              'Keep the current first-response routine and spot-check outliers weekly.',
            owner: 'Sales Manager',
            cadence: 'weekly',
            success_measure: 'untouched rate stays at zero',
            effort: 'low' as const,
            impact: 'medium' as const,
          },
    ],
  }
}

function clusterB(m: Record<string, MetricFact>): Built {
  const flagged = CLUSTERS[1].metric_ids.filter(
    (id) => m[id].rating !== 'healthy',
  )
  const clean = CLUSTERS[1].metric_ids.filter(
    (id) => m[id].rating === 'healthy',
  )
  const flaggedLabels = flagged.map((id) => METRIC_LABEL[id])
  const narrative =
    flagged.length === 0
      ? 'Messaging quality signals are clean this period: personalization, text-vs-call balance, reply timeliness, and message effort are all on target.'
      : `Messaging quality shows ${flagged.length} flagged behavior${flagged.length === 1 ? '' : 's'} this period — ${flaggedLabels.join(', ')}. These are observed message patterns, not proven intent; taken together they point toward template reliance and low-effort or one-way replies.`
  return {
    narrative,
    implication: {
      claim: flagged.length >= 2 ? 'inference' : 'hypothesis',
      text:
        flagged.length >= 2
          ? 'Two or more messaging flags together suggest reps lean on templates and text over personalized, two-way conversation — a coachable quality gap, not a volume gap.'
          : 'A single messaging flag is worth watching but does not by itself establish a quality problem.',
      cites:
        flagged.length >= 2
          ? flagged.slice(0, 3)
          : [...flagged, ...clean].slice(0, 2),
    },
    hypotheses: [
      {
        claim: 'hypothesis',
        text: 'Template reliance may be driven by workload or CRM shortcuts rather than skill; a short message-quality review with reps would separate cause from symptom.',
        cites: flagged.length ? flagged.slice(0, 2) : ['SW-021', 'SW-149'],
      },
    ],
    actions: [
      flagged.length
        ? {
            action:
              'Run a weekly message-quality review: personalize the opening, balance text with a call attempt, and replace link-only replies with a question.',
            owner: 'Sales Manager',
            cadence: 'weekly',
            success_measure:
              'flagged messaging behaviors trending down week over week',
            effort: 'medium' as const,
            impact: 'medium' as const,
          }
        : {
            action:
              'Maintain current messaging standards and sample a few threads weekly.',
            owner: 'Sales Manager',
            cadence: 'weekly',
            success_measure: 'messaging flags stay at zero',
            effort: 'low' as const,
            impact: 'low' as const,
          },
    ],
  }
}

function clusterC(m: Record<string, MetricFact>): Built {
  const set = m['SW-031']
  const show = m['SW-032']
  const write = m['SW-033']
  const noShow = m['SW-041']
  const narrative = `Across the appointment funnel this period: lead-to-set is ${pct(set.value)} (${ratingWord(set.rating)}, target ${pct(set.threshold)}+), show rate is ${pct(show.value)} (${ratingWord(show.rating)}), no-show rate is ${pct(noShow.value)} (${ratingWord(noShow.rating)}), and show-to-write is ${pct(write.value)} (${ratingWord(write.rating)}). The show rate is measured over every appointment row this period (its accepted formula counts shows over all appointment rows), so it is not the same denominator as an industry appointments-set benchmark.`
  return {
    narrative,
    implication: {
      claim: 'inference',
      text:
        set.rating === 'breach'
          ? 'The largest controllable step here is getting more leads to a set appointment; show and write cannot compound on appointments that were never set.'
          : 'Set rate is holding; protect show and write quality to keep the funnel compounding.',
      cites: ['SW-031', 'SW-032'],
    },
    hypotheses: [
      {
        claim: 'hypothesis',
        text: 'A low set rate can reflect customer follow-through, appointment-request quality, the confirmation process, or CRM logging of set appointments; these are distinct causes and none is established without a per-appointment review.',
        cites: ['SW-031', 'SW-033'],
      },
      {
        claim: 'hypothesis',
        text: 'A weak show or high no-show rate may reflect confirmation cadence rather than lead quality; a confirmation-call audit would separate them.',
        cites: ['SW-032', 'SW-041'],
      },
    ],
    actions: [
      {
        action:
          'Tighten the set-and-confirm routine: a same-day appointment ask on every worked lead and a confirmation touch the day before.',
        owner: 'Sales Manager',
        cadence: 'daily',
        success_measure:
          'lead-to-set rate moving toward the 25% target and no-show rate falling',
        effort: 'medium',
        impact: 'high',
      },
    ],
  }
}

function clusterD(m: Record<string, MetricFact>): Built {
  const beBacks = m['SW-045']
  const testDrive = m['SW-046']
  const unassigned = m['SW-090']
  const zeroTd = testDrive.value === 0
  const narrative = `Showroom execution this period: be-backs vs fresh-ups is ${valueDisplay(beBacks.value, beBacks.unit)} (${ratingWord(beBacks.rating)}), test-drive completion is ${pct(testDrive.value)} (${ratingWord(testDrive.rating)}), and lead assignment past 2 hours is ${pct(unassigned.value)} (${ratingWord(unassigned.rating)}).${zeroTd ? ' A zero test-drive value may reflect logging rather than activity — it does not prove no test-drives happened.' : ''}`
  return {
    narrative,
    implication: {
      claim: 'inference',
      text:
        unassigned.rating === 'healthy'
          ? 'Lead ownership is clean, so any follow-through gap sits with showroom execution rather than assignment.'
          : 'Assignment gaps and showroom follow-through are both in play; fix ownership first so follow-through has an owner.',
      cites: ['SW-090', 'SW-046'],
    },
    hypotheses: [
      {
        claim: 'hypothesis',
        text: 'A low or zero test-drive/write value may be a CRM logging habit rather than missing activity; confirm against the showroom log before drawing a performance conclusion.',
        cites: ['SW-046', 'SW-045'],
      },
    ],
    actions: [
      {
        action:
          'Confirm test-drive and visit logging discipline at the desk, then coach to complete a test-drive on every showroom visit.',
        owner: 'Sales Manager',
        cadence: 'weekly',
        success_measure: 'test-drive completion rising and logged consistently',
        effort: 'medium',
        impact: 'medium',
      },
    ],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cross-cluster interactions — every conclusion cites ≥2 metrics or is a hypothesis.
// ─────────────────────────────────────────────────────────────────────────────

export type Interaction = {
  id: string
  claim: 'inference' | 'hypothesis'
  text: string
  cites: Array<string>
}

export function crossClusterInteractions(
  m: Record<string, MetricFact>,
): Array<Interaction> {
  const out: Array<Interaction> = []
  const isBreach = (id: string) => m[id].rating === 'breach'
  const isHealthy = (id: string) => m[id].rating === 'healthy'

  // Fast median + untouched leads + low appointment set.
  if (isHealthy('SW-011') && !isHealthy('SW-012') && isBreach('SW-031'))
    out.push({
      id: 'speed-masks-then-conversion-gap',
      claim: 'inference',
      text: 'A healthy median response time sits alongside untouched leads and a below-target set rate: fast average speed is not translating into set appointments because some leads are never worked.',
      cites: ['SW-011', 'SW-012', 'SW-031'],
    })

  // Low set + weak show + a conversation-quality signal.
  const convFlag = CLUSTERS[1].metric_ids.find((id) => isBreach(id))
  if (isBreach('SW-031') && m['SW-032'].rating !== 'healthy' && convFlag)
    out.push({
      id: 'set-show-conversation',
      claim: 'inference',
      text: 'A below-target set rate and a soft show rate coincide with a messaging-quality flag, suggesting the appointment gap is partly a conversation-quality gap, not only volume.',
      cites: ['SW-031', 'SW-032', convFlag],
    })

  // Healthy assignment + weak follow-through.
  if (
    isHealthy('SW-090') &&
    (m['SW-045'].rating !== 'healthy' || m['SW-046'].rating !== 'healthy')
  )
    out.push({
      id: 'ownership-vs-followthrough',
      claim: 'inference',
      text: 'Lead ownership is clean while showroom follow-through is soft, which points the opportunity at execution after assignment rather than at who owns the lead.',
      cites: ['SW-090', m['SW-045'].rating !== 'healthy' ? 'SW-045' : 'SW-046'],
    })

  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Opportunity ranking by deterministic evidence weight (not rhetoric).
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY: Record<Rating, number> = { breach: 3, watch: 1, healthy: 0 }
const CONFIDENCE_W: Record<string, number> = { high: 1, medium: 0.75, low: 0.5 }
const CLUSTER_LEVERAGE: Record<ClusterKey, number> = { C: 3, A: 2, D: 2, B: 1 }

export type Opportunity = {
  metric_id: string
  cluster: ClusterKey
  label: string
  rating: Rating
  rank: number
  confidence: string
  weight: number
  claim: 'recommendation'
}

export function rankOpportunities(
  facts: Array<MetricFact>,
): Array<Opportunity> {
  return facts
    .map((f) => {
      const cl = CLUSTER_OF[f.metric_id]
      const peer = f.rank === 3 ? 1.25 : f.rank === 2 ? 1.0 : 0.8
      const weight =
        SEVERITY[f.rating] *
        CLUSTER_LEVERAGE[cl] *
        (CONFIDENCE_W[f.confidence] ?? 0.5) *
        peer
      return {
        metric_id: f.metric_id,
        cluster: cl,
        label: f.label,
        rating: f.rating,
        rank: f.rank,
        confidence: f.confidence,
        weight: Math.round(weight * 1000) / 1000,
        claim: 'recommendation' as const,
      }
    })
    .filter((o) => o.weight > 0)
    .sort(
      (a, b) => b.weight - a.weight || a.metric_id.localeCompare(b.metric_id),
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Notification / automation candidates (from evaluated breach signals only).
// ─────────────────────────────────────────────────────────────────────────────

export type NotifCandidate = {
  metric_id: string
  trigger: string
  audience: string
  timing: string
  payload: string
  guardrails: string
  kind: 'notification_only' | 'external_action_requires_approval'
  activated: false
}

export function notificationCandidates(
  facts: Array<MetricFact>,
): Array<NotifCandidate> {
  const specs: Record<
    string,
    Omit<NotifCandidate, 'metric_id' | 'activated'>
  > = {
    'SW-012': {
      trigger:
        'a business-hours lead reaches 30 minutes with no first response',
      audience: 'Sales Manager (and the assigned salesperson)',
      timing: 'real-time during staffed hours',
      payload:
        'a count and list reference of untouched leads needing an immediate first touch',
      guardrails:
        'business hours only; Sales leads only; no customer contact is sent by the alert',
      kind: 'notification_only',
    },
    'SW-090': {
      trigger: 'a new lead is unassigned 2 hours after creation',
      audience: 'Sales Manager',
      timing: 'real-time during staffed hours',
      payload: 'the count of unassigned leads awaiting an owner',
      guardrails: 'Sales leads only; internal alert only',
      kind: 'notification_only',
    },
    'SW-031': {
      trigger: 'weekly lead-to-set rate stays below the 25% target',
      audience: 'Sales Manager',
      timing: 'weekly summary',
      payload: 'the set-rate trend and the appointment gap to target',
      guardrails: 'internal summary only; no automated customer outreach',
      kind: 'notification_only',
    },
    'SW-041': {
      trigger: 'weekly no-show rate exceeds its target',
      audience: 'Sales Manager / BDC Manager',
      timing: 'weekly summary',
      payload: 'no-show trend and confirmation-cadence prompt',
      guardrails:
        'internal only; any customer confirmation messaging is a separate approved action',
      kind: 'external_action_requires_approval',
    },
  }
  return facts
    .filter((f) => f.rating === 'breach' && f.metric_id in specs)
    .map((f) => ({
      metric_id: f.metric_id,
      activated: false as const,
      ...specs[f.metric_id],
    }))
    .sort((a, b) => a.metric_id.localeCompare(b.metric_id))
}

// ─────────────────────────────────────────────────────────────────────────────
// Bounded incremental-vehicle scenarios (no dollars — no accepted gross value exists).
// ─────────────────────────────────────────────────────────────────────────────

export type RoiOperands = {
  dealer_id: string
  leads: number
  appts_set: number
  shows: number
  appt_rows: number
  no_shows: number
  set_rate: number
  show_rate: number
}
export const SHOW_TO_SALE = {
  low: 0.2,
  base: 0.3,
  high: 0.41,
  high_label:
    'dated Foureyes H2 2023 reference upper bound (Internet+Phone 41% / Used 40%); NOT this dealer’s measured rate',
} as const

export type RoiScenario = {
  dealer_id: string
  target_set_rate: number
  formulas: Record<string, string>
  appointment_gap_to_target: number
  additional_shows_if_gap_closed: number
  incremental_units: { low: number; base: number; high: number }
  assumptions: Array<string>
  confidence: string
  sensitivity: string
  warnings: Array<string>
  dollars: null
}

export function roiScenario(op: RoiOperands): RoiScenario {
  const target = 0.25
  const targetSets = target * op.leads
  const gap = Math.max(0, round2(targetSets - op.appts_set))
  const addlShows = round2(gap * op.show_rate)
  const units = (r: number) => round2(addlShows * r)
  return {
    dealer_id: op.dealer_id,
    target_set_rate: target,
    formulas: {
      appointment_gap_to_target: 'max(0, 0.25 × leads − appointments_set)',
      additional_shows: 'appointment_gap × current_show_rate',
      incremental_units:
        'additional_shows × show_to_sale_assumption (low/base/high)',
    },
    appointment_gap_to_target: gap,
    additional_shows_if_gap_closed: addlShows,
    incremental_units: {
      low: units(SHOW_TO_SALE.low),
      base: units(SHOW_TO_SALE.base),
      high: units(SHOW_TO_SALE.high),
    },
    assumptions: [
      `current show rate held at ${pct(op.show_rate)} (this dealer's measured appointment-show rate over all appointment rows this period)`,
      `show-to-sale range low ${pct(SHOW_TO_SALE.low)} / base ${pct(SHOW_TO_SALE.base)} / high ${pct(SHOW_TO_SALE.high)} — ${SHOW_TO_SALE.high_label}`,
      'single governed week; figures are a bounded opportunity scenario, not a forecast',
    ],
    confidence: 'low',
    sensitivity: `every 1 additional set appointment adds about ${round2(op.show_rate)} shows and ${round2(op.show_rate * SHOW_TO_SALE.base)} base-case units`,
    warnings: [
      'This is a scenario, not a promise, and implies no causation: closing the gap requires real appointment and follow-through work.',
      'No dollar value is included because no accepted store-specific gross figure with lineage is available this cycle.',
    ],
    dollars: null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Coverage-expansion plan for the 278 unresolved (customer-friendly; no hold/quarantine language).
// ─────────────────────────────────────────────────────────────────────────────

export type UnresolvedRow = {
  metric_id: string
  section: string
  blocker_class: string
  eligible: boolean
}
export type CoverageTheme = {
  theme: string
  metric_ids: Array<string>
  count: number
  what_it_would_reveal: string
  why_not_this_cycle: string
  next_visibility_unlock: string
  next_step: string
}

const THEME_OF_SECTION = (section: string): string => {
  if (/Speed-to-Lead|First Response/i.test(section))
    return 'Faster, fuller response coverage'
  if (/Communication|Sentiment|Red Flags|Rep Activity/i.test(section))
    return 'Conversation quality'
  if (/Appointment|Showroom|Pipeline|Deal|Desking/i.test(section))
    return 'Appointments, showroom, and deals'
  if (/Lead Intake|Source|Marketing|Attribution|Inventory|VOI/i.test(section))
    return 'Lead sources and marketing'
  if (/Opportunity Mining|Service-to-Sales|Equity/i.test(section))
    return 'Customer reactivation and opportunity mining'
  if (/Data Integrity|CRM Hygiene/i.test(section)) return 'Data and CRM hygiene'
  if (/Compliance|Risk|BDC|Call Center/i.test(section))
    return 'Compliance and call-center coverage'
  return 'Cross-functional and advanced signals'
}

const UNLOCK_OF_BLOCKER = (
  blocker: string,
): { unlock: string; step: string } => {
  if (/nlp_content/i.test(blocker))
    return {
      unlock:
        'adding message wording and tone review to the accepted Sales feed',
      step: 'decide whether to enable message-content review for the Sales pipeline',
    }
  if (/insufficient_history/i.test(blocker))
    return {
      unlock: 'more than one week of accepted Sales history',
      step: 'keep accepting the weekly Sales export so trends accumulate',
    }
  if (/unsupported_field/i.test(blocker))
    return {
      unlock: 'one added data field in the weekly Sales export',
      step: 'confirm the missing field can be added to the weekly export',
    }
  if (/other_source_or_join/i.test(blocker))
    return {
      unlock: 'a second Sales report combined with the current one',
      step: 'confirm which reports are needed and the exact common field before matching',
    }
  if (/semantic_definition_pending/i.test(blocker))
    return {
      unlock: 'an agreed exact rule and cut-off',
      step: 'agree the exact definition with management',
    }
  return {
    unlock: 'a separate governed workspace for service or compliance topics',
    step: 'route these to the appropriate separate review',
  }
}

export function coverageExpansion(
  rows: Array<UnresolvedRow>,
): Array<CoverageTheme> {
  const groups = new Map<string, Array<UnresolvedRow>>()
  for (const r of rows) {
    const key = `${THEME_OF_SECTION(r.section)}||${UNLOCK_OF_BLOCKER(r.blocker_class).unlock}`
    const list = groups.get(key) ?? []
    list.push(r)
    groups.set(key, list)
  }
  const themes = [...groups.entries()].map(([key, list]) => {
    const [theme, unlock] = key.split('||')
    const step = UNLOCK_OF_BLOCKER(list[0].blocker_class).step
    return {
      theme,
      metric_ids: list.map((r) => r.metric_id).sort(),
      count: list.length,
      what_it_would_reveal: `${theme} signals that are not part of this cycle's measured set.`,
      why_not_this_cycle:
        'Not measured this cycle — the accepted weekly Sales data does not yet support these specific signals.',
      next_visibility_unlock: `Next visibility unlock: ${unlock}.`,
      next_step: `Next step: ${step}.`,
    }
  })
  return themes.sort(
    (a, b) => b.count - a.count || a.theme.localeCompare(b.theme),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Customer-safe guard (extends the Gate 5A projection guard with CRM/message terms).
// ─────────────────────────────────────────────────────────────────────────────

export const CUSTOMER_FORBIDDEN_5B =
  /\b(First Contact Attempt|First Customer Contact|Actual Response Time|Originated After Hours|Is Show|Is No Show|rep_token|blocker_class|frozen_e1|quarantin|nlp_content|vinsolutions_custom_reporting|other_source_or_join|unsupported_field|insufficient_history|semantic_definition_pending|withheld|escalation trigger)\b/i

export function assertCustomerSafe(label: string, str: string): void {
  assertProjectionSafe(label, str)
  if (CUSTOMER_FORBIDDEN_5B.test(str))
    throw new Error(
      `Gate 5B: customer text exposes an internal/CRM term (${label}): "${str}"`,
    )
}

/** The controlled owner/audience role vocabulary (requirement #3). */
export const ALLOWED_ROLES =
  /^(GM|General Manager|Sales Manager|BDC Manager|salesperson|the assigned salesperson|CRM administrator|analytics vendor|vendor|dealership management)$/i

/**
 * Role-field guard for `owner` / `audience`: role titles are two-word Capitalized strings (e.g.
 * "Sales Manager") that the person-name heuristic would falsely flag, so this skips the name-pair
 * check but still bars internal/CRM terms and PII. Composite roles (slash/parenthesis separated) are
 * split and each part checked against {@link ALLOWED_ROLES}.
 */
export function assertRoleSafe(label: string, str: string): void {
  if (!str.trim()) throw new Error(`Gate 5B: empty role (${label})`)
  const PII = /\b(\d{3}-\d{2}-\d{4}|@[a-z0-9.-]+\.[a-z]{2,})\b/i
  if (
    CUSTOMER_FORBIDDEN.test(str) ||
    CUSTOMER_FORBIDDEN_5B.test(str) ||
    PII.test(str)
  )
    throw new Error(
      `Gate 5B: role field exposes an internal term/PII (${label}): "${str}"`,
    )
  const parts = str
    .split(/\s*(?:\/|\(and\s+|\(|\)|,)\s*/)
    .map((p) => p.trim())
    .filter(Boolean)
  for (const p of parts)
    if (!ALLOWED_ROLES.test(p))
      throw new Error(
        `Gate 5B: role "${p}" is not in the allowed owner/audience vocabulary (${label})`,
      )
}

export function dealerName(id: string): string {
  return ROOFTOPS[id]
}

function round2(x: number): number {
  return Math.round(x * 100) / 100
}
