/**
 * M2B OFFLINE AI narratives (authored in this Claude Code session).
 *
 * The isolated Studio has NO configured inference provider, so live automatic
 * narration is unconfigured. For this TEST milestone the narratives below were
 * authored offline by the Claude Code session, grounded ONLY in each store's
 * buildHaloAiFacts (no invented facts), then validated through the SAME
 * evidence-constrained validator (validateAiNarrative/withAiNarration) via an
 * injected completion labeled `claude-code-offline`. Nothing here is marked as a
 * live/production provider; the report says "AI-grounded (offline test)".
 *
 * Each numeric claim uses the metric's EXACT display value (unit + sign) and cites
 * that metric's slug; summaries are non-numeric; no benchmark/causal/PII language.
 */
import type { CompletionFn, NarrationDeps } from '../halo-ai-narrative'

export const OFFLINE_NARRATIVE_PROVIDER = 'claude-code-offline'

export type OfflineNarrative = { summary: string; claims: Array<{ text: string; evidence: string[] }> }

export const OFFLINE_NARRATIVES: Record<string, OfflineNarrative> = {
  'serra-honda': {
    summary:
      'Serra Honda has governed current values this week for its appointment rates, its total gross, its per-deal gross reconciliation, and its average actual response time, while leads and ROI, team communications, and messaging engagement are withheld or not yet connected; the picture is partial, and every gap is stated plainly rather than filled with a zero.',
    claims: [
      { text: 'Total gross for the governed week is $14,185.20.', evidence: ['gross.total_sum'] },
      { text: 'The appointment show rate is 57.1% for the accepted appointments source.', evidence: ['appt.show_rate'] },
      { text: 'The appointment no-show rate is 35.7%.', evidence: ['appt.no_show_rate'] },
      { text: 'The appointment confirmed rate is 50.0%.', evidence: ['appt.confirmed_rate'] },
      { text: 'The appointment cancel rate is 7.1%.', evidence: ['appt.cancel_rate'] },
      { text: 'There are no per-deal gross reconciliation mismatches in the accepted gross this week.', evidence: ['gross.reconciliation_mismatches'] },
      { text: 'The average actual response time is 210 minutes.', evidence: ['dashboard.response_time_actual_avg_min'] },
      { text: 'Leads and ROI are withheld this period under the Sales-only data contract, and are shown explicitly rather than as a zero.', evidence: ['roi.total_leads'] },
      { text: 'Messaging engagement has no current value this period; the store has no governed messaging source yet.', evidence: ['engagement.conversations'] },
    ],
  },
  'serra-nissan': {
    summary:
      'Serra Nissan has governed current values this week for its appointment rates, its total gross, its per-deal gross reconciliation, and its average actual response time, while leads and ROI, team, and communications are withheld, so the card is honest about what is present and what is missing.',
    claims: [
      { text: 'Total gross for the governed week is $13,224.00.', evidence: ['gross.total_sum'] },
      { text: 'The appointment show rate is 33.3% for the accepted appointments source.', evidence: ['appt.show_rate'] },
      { text: 'The appointment no-show rate is 50.0%.', evidence: ['appt.no_show_rate'] },
      { text: 'The appointment confirmed rate is 50.0%.', evidence: ['appt.confirmed_rate'] },
      { text: 'The appointment cancel rate is 16.7%.', evidence: ['appt.cancel_rate'] },
      { text: 'There are no per-deal gross reconciliation mismatches in the accepted gross this week.', evidence: ['gross.reconciliation_mismatches'] },
      { text: 'The average actual response time is 238 minutes.', evidence: ['dashboard.response_time_actual_avg_min'] },
      { text: 'Leads and ROI are withheld this period under the Sales-only data contract.', evidence: ['roi.total_leads'] },
    ],
  },
  'tony-serra-ford': {
    summary:
      'Tony Serra Ford has governed current values this week for its appointment rates, its total gross, its per-deal gross reconciliation, and its average actual response time; leads and ROI and team communications are withheld, and the accepted sources disagree on the weekly sold count, which is stated plainly rather than resolved silently.',
    claims: [
      { text: 'Total gross for the governed week is $1,600.99.', evidence: ['gross.total_sum'] },
      { text: 'The appointment show rate is 42.9% for the accepted appointments source.', evidence: ['appt.show_rate'] },
      { text: 'The appointment no-show rate is 57.1%.', evidence: ['appt.no_show_rate'] },
      { text: 'The appointment confirmed rate is 42.9%.', evidence: ['appt.confirmed_rate'] },
      { text: 'The appointment cancel rate is 0.0%.', evidence: ['appt.cancel_rate'] },
      { text: 'There are no per-deal gross reconciliation mismatches in the accepted gross this week.', evidence: ['gross.reconciliation_mismatches'] },
      { text: 'The average actual response time is 317 minutes.', evidence: ['dashboard.response_time_actual_avg_min'] },
      { text: 'The accepted delivered-sale rows and the Dashboard sold count disagree this week, so per-unit gross composites are not reported; the absolute gross total still reconciles across both sources.', evidence: ['gross.total_sum'] },
      { text: 'Leads and ROI and team communications are withheld; their scheduled sources are quarantined under the Sales-only data contract.', evidence: ['roi.total_leads', 'cage.total_comms'] },
    ],
  },
}

/**
 * Injected completion that returns the offline-authored narrative for a profile,
 * with an honest provider label. The transport `via` is inert here (never surfaced;
 * narrative_provider is overridden by providerLabel), so nothing is mislabeled.
 */
export function offlineNarrationDeps(profile: string): NarrationDeps {
  const fixture = OFFLINE_NARRATIVES[profile]
  const complete: CompletionFn = async () => ({ ok: true, text: JSON.stringify(fixture ?? {}), via: 'openai-direct' })
  return { complete, providerLabel: OFFLINE_NARRATIVE_PROVIDER }
}
