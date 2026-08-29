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
      'Serra Honda has governed current values this week for its appointment rates and its total gross, while leads and ROI, team communications, and messaging engagement are withheld or not yet connected; the picture is partial, and every gap is stated plainly rather than filled with a zero.',
    claims: [
      { text: 'Total gross for the governed week is $12,240.78.', evidence: ['gross.total_sum'] },
      { text: 'The appointment show rate is 66.7% for the accepted appointments source.', evidence: ['appt.show_rate'] },
      { text: 'The appointment no-show rate is 22.2%.', evidence: ['appt.no_show_rate'] },
      { text: 'The appointment confirmed rate is 33.3%.', evidence: ['appt.confirmed_rate'] },
      { text: 'The appointment cancel rate is 11.1%.', evidence: ['appt.cancel_rate'] },
      { text: 'Leads and ROI are withheld this period under the Sales-only data contract, and are shown explicitly rather than as a zero.', evidence: ['roi.total_leads'] },
      { text: 'Messaging engagement has no current value this period; the store has no governed messaging source yet.', evidence: ['engagement.conversations'] },
    ],
  },
  'serra-nissan': {
    summary:
      'Serra Nissan has one governed current value this week, its total gross; appointment rates have no current value, and leads and ROI, team, and communications are withheld, so the card is coverage-first and honest about what is missing.',
    claims: [
      { text: 'Total gross for the governed week is $5,263.60.', evidence: ['gross.total_sum'] },
      { text: 'Appointment rates have no current value this period; no accepted appointments source was delivered.', evidence: ['appt.show_rate'] },
      { text: 'Leads and ROI are withheld this period under the Sales-only data contract.', evidence: ['roi.total_leads'] },
    ],
  },
  'tony-serra-ford': {
    summary:
      'Tony Serra Ford has no accepted native source this week, so every catalog measure is withheld or has no current value; the card is coverage-first, and the leading recommendation is to restore the store Sales-only scheduled deliveries before any metric can be shown.',
    claims: [
      { text: 'No catalog measure has a current governed value this period, and nothing is shown as a zero.', evidence: ['gross.total_sum'] },
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
