/**
 * M2B ranked, owner-specific opportunities (deterministic).
 *
 * Derived ONLY from metrics that are actually present in accepted analytics, plus
 * explicit coverage gaps. Never invents a metric value or a benchmark score. Every
 * opportunity carries owner, type, trigger, recipient, action, prerequisites,
 * safety limits, approval, and evidence references. Ranked by expected facility
 * impact x confidence. All text uses ASCII hyphens (PDF-QA requirement).
 */

export type OppOwner = 'GM' | 'Sales Manager' | 'Salesperson'
export type OppType = 'coverage_gap' | 'notification' | 'automation' | 'coaching' | 'huminic_opportunity'

export type Opportunity = {
  rank: number
  score: number
  title: string
  owner: OppOwner
  type: OppType
  trigger: string
  recipient: string
  action: string
  prerequisites: string
  safety_limits: string
  approval_needed: string
  evidence_refs: string[]
  confidence: number
  expected_impact: number // 1..5
  rationale: string
}

type LedgerLike = { slug: string; state: 'supported' | 'missing' | 'withheld' | 'unsupported' }

export type OppInput = {
  profile: string
  dealerName: string
  ledger: LedgerLike[]
  coverage_counts: { total: number; supported: number; missing: number; withheld: number; unsupported: number }
  dealershipPerformance:
    | { available: true; summary: { leads: number | null; apptsSet: number | null; apptsShow: number | null; soldInPeriod: number | null } }
    | { available: false; reason: string }
  appointments:
    | { available: true; counts: { total: number; show: number; noShow: number; confirmed: number; cancelled: number } }
    | { available: false; reason: string }
}

type Draft = Omit<Opportunity, 'rank' | 'score'> & { confidence: number; expected_impact: number }

const n = (v: number | null | undefined): string => (v == null ? 'n/a' : String(v))

export function buildM2BOpportunities(input: OppInput): Opportunity[] {
  const drafts: Draft[] = []
  const withheldSlugs = new Set(input.ledger.filter((r) => r.state === 'withheld').map((r) => r.slug))
  const hasWithheldRoiCageComm = ['roi.total_leads', 'cage.total_comms', 'comm.escalation_keyword_screen'].some((s) =>
    withheldSlugs.has(s),
  )

  // 1. Systemic Service/Parts Lead-Intent contamination (highest-value unlock).
  if (hasWithheldRoiCageComm) {
    drafts.push({
      title: 'Correct the VinSolutions Sales schedule Lead-Intent selection to Sales-only',
      owner: 'GM',
      type: 'coverage_gap',
      trigger:
        'The ROI, CAGE, and daily Sales Communication scheduled reports positively select Service/Parts Lead-Intents (Parts, Service), so every delivery is quarantined whole under the Sales-only data contract.',
      recipient: 'General Manager / VinSolutions scheduling administrator',
      action:
        'In VinSolutions report scheduling, set Lead-Intent to Sales-only (remove Acquisition, Parts, Service, Unknown), then re-deliver the affected weekly and daily periods so ROI, CAGE, and Communication metrics can land accepted.',
      prerequisites: 'VinSolutions report-scheduling access for each rooftop.',
      safety_limits: 'Huminic makes no schedule change; this is a recommendation only. No customer or CRM action.',
      approval_needed: 'Explicit Duane approval before any VinSolutions schedule change.',
      evidence_refs: ['roi.total_leads', 'roi.sold_from_leads', 'cage.total_comms', 'comm.escalation_keyword_screen'],
      confidence: 0.95,
      expected_impact: 5,
      rationale:
        'Unlocks the largest block of currently withheld metrics (Leads and ROI, Team/CAGE, Communications) across all three rooftops.',
    })
  }

  // 2. Store has zero accepted family this period (coverage-first, e.g. Ford).
  if (input.coverage_counts.supported === 0) {
    drafts.push({
      title: `Restore accepted Sales deliveries for ${input.dealerName}`,
      owner: 'GM',
      type: 'coverage_gap',
      trigger:
        'No accepted native family exists for this rooftop this period: Dealership Performance and Appointments are absent, and ROI/CAGE are quarantined by the Service/Parts Lead-Intent contamination.',
      recipient: 'General Manager',
      action:
        'Verify the scheduled Sales reports (Dealership Performance, Appointments, ROI, CAGE) are being delivered for this rooftop and are Sales-only, then re-deliver the current week.',
      prerequisites: 'VinSolutions scheduling access; confirmation the rooftop is enrolled in the governed feed.',
      safety_limits: 'No data is fabricated; the report shows coverage-first until accepted data arrives.',
      approval_needed: 'None to investigate; schedule changes await Duane approval.',
      evidence_refs: ['gross.total_sum', 'appt.show_rate'],
      confidence: 0.9,
      expected_impact: 5,
      rationale: 'Without any accepted family, this rooftop has no diagnostic signal; restoring delivery is the first lever.',
    })
  }

  // 3. Engagement not connected (hub has no governed source).
  const engagementMissing = input.ledger.some(
    (r) => r.slug.startsWith('engagement.') && (r.state === 'missing' || r.state === 'withheld'),
  )
  if (engagementMissing) {
    drafts.push({
      title: 'Activate Huminic messaging and SMS engagement',
      owner: 'GM',
      type: 'huminic_opportunity',
      trigger: 'Engagement metrics (reply rate, conversations, safety-net resurrections) have no governed source; the messaging hub has zero threads for this rooftop.',
      recipient: 'General Manager',
      action:
        'Onboard the rooftop to the Huminic messaging hub so reply rate, conversations held, and after-hours resurrections become measurable and coachable.',
      prerequisites: 'Standard Huminic workspace onboarding.',
      safety_limits: 'No outbound messaging is activated in this test; onboarding only.',
      approval_needed: 'Standard onboarding approval; no automation is enabled here.',
      evidence_refs: ['engagement.reply_rate', 'engagement.conversations', 'engagement.resurrections'],
      confidence: 0.8,
      expected_impact: 4,
      rationale: 'Turns an unmeasured channel into a governed, coachable one and creates a Huminic expansion path.',
    })
  }

  // 4. Appointment no-show follow-up (notification now; automation later, gated).
  if (input.appointments.available) {
    const a = input.appointments.counts
    drafts.push({
      title: 'Stand up a same-day appointment no-show follow-up alert',
      owner: 'Sales Manager',
      type: 'notification',
      trigger: `Observed appointments this week: ${n(a.total)} total, ${n(a.show)} shown, ${n(a.noShow)} no-show, ${n(a.confirmed)} confirmed (counts, not a benchmark score).`,
      recipient: 'Sales Manager (internal alert only)',
      action:
        'Enable an internal alert to the sales manager when a Sales appointment is a no-show, so the rep re-engages the same day. A future automation could offer a reschedule text, but it is NOT activated in this test.',
      prerequisites: 'Accepted Appointments feed (present for this rooftop).',
      safety_limits: 'Dispatch disabled; internal recipient only; no customer contact in this test.',
      approval_needed: 'Automation activation (customer-facing reschedule text) requires separate explicit approval.',
      evidence_refs: ['appt.no_show_rate', 'appt.show_rate', 'appt.confirmed_rate'],
      confidence: 0.65,
      expected_impact: 3,
      rationale: 'No-show recovery is a same-day, low-cost lever the manager can own immediately.',
    })
  }

  // 5. Lead-to-sold funnel review (observed counts only; non-scoring).
  if (input.dealershipPerformance.available) {
    const s = input.dealershipPerformance.summary
    drafts.push({
      title: 'Manager review of the lead-to-sold funnel',
      owner: 'Sales Manager',
      type: 'coaching',
      trigger: `Observed this week: ${n(s.leads)} leads, ${n(s.apptsSet)} appts set, ${n(s.apptsShow)} appts shown, ${n(s.soldInPeriod)} sold (counts only; dealer baseline is insufficient, so no scoring).`,
      recipient: 'Sales Manager',
      action:
        'Walk the funnel stages (leads -> appts set -> shown -> sold) in the weekly meeting to find the largest drop-off; treat as directional context, not a graded benchmark.',
      prerequisites: 'Accepted Dealership Performance feed (present).',
      safety_limits: 'No industry benchmark is scored; comparisons are non-scoring until >= 3 dealer periods exist.',
      approval_needed: 'None (internal coaching).',
      evidence_refs: ['gross.total_sum'],
      confidence: 0.6,
      expected_impact: 3,
      rationale: 'Uses the one governed weekly source to focus coaching without over-claiming.',
    })
  }

  // 6. Accumulate history to unlock the dealer baseline.
  drafts.push({
    title: 'Accumulate at least 3 governed weekly periods to unlock the dealer baseline',
    owner: 'GM',
    type: 'coverage_gap',
    trigger: 'Only one accepted weekly period exists, so a dealer-baseline trend and z-score band cannot be computed yet.',
    recipient: 'General Manager / Huminic',
    action: 'Keep the weekly Sales-only deliveries flowing; the dealer baseline unlocks once three governed periods are accepted.',
    prerequisites: 'Continued accepted weekly deliveries.',
    safety_limits: 'None; measurement only.',
    approval_needed: 'None.',
    evidence_refs: [],
    confidence: 0.9,
    expected_impact: 2,
    rationale: 'Cheap, time-based unlock for trend-based diagnostics.',
  })

  // Rank by impact x confidence (deterministic); stable order preserved for ties.
  const scored = drafts.map((d) => ({ ...d, score: Math.round(d.expected_impact * d.confidence * 100) / 100 }))
  scored.sort((a, b) => b.score - a.score)
  return scored.map((d, i) => ({ rank: i + 1, ...d }))
}
