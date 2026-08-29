/**
 * Halo Data — DETERMINISTIC, grounded narrative.
 *
 * Composes a plain-language summary from ALREADY-COMPUTED report-card facts. It
 * NEVER invents a number or a benchmark: the only numeric tokens it emits are the
 * coverage counts and each measure's already-formatted current `display` value
 * (and its governed period). Industry benchmark numbers are deliberately NOT
 * restated — non-scoring status is described in words only. Data limitations are
 * always surfaced. Pure; no I/O. (An injectable LLM narration can layer on top of
 * this grounded base later in M2 without changing these guarantees.)
 */

export type NarrativeCard = {
  label: string
  display: string | null
  current: { state: 'value' | 'no_current_data' | 'withheld' }
  industry: { state: 'no_benchmark' | 'directional_non_scoring'; definition_compatibility?: string }
  baseline: { state: 'insufficient_history' | 'zero_variance' | 'band' }
  provenance: { source: string; period?: { start: string | null; end: string | null } } | null
}

export type NarrativeInput = {
  profile: string
  windowDays: number
  cards: ReadonlyArray<NarrativeCard>
  coverage: { total: number; current_value: number; no_current_data: number; withheld: number }
  limitations: ReadonlyArray<string>
}

function industryPhrase(c: NarrativeCard): string {
  return c.industry.state === 'directional_non_scoring'
    ? `industry reference is directional only, non-scoring (definition ${c.industry.definition_compatibility})`
    : 'no definition-compatible industry benchmark'
}

function baselinePhrase(c: NarrativeCard): string {
  switch (c.baseline.state) {
    case 'insufficient_history':
      return 'dealer baseline: insufficient history (fewer than 3 governed periods)'
    case 'zero_variance':
      return 'dealer baseline: sufficient history but zero variance — non-scoring'
    default:
      return 'dealer baseline: relative to the dealer’s own trend (non-scored)'
  }
}

export function buildHaloNarrative(input: NarrativeInput): string {
  const { profile, cards, coverage } = input
  const lines: string[] = []
  lines.push(`Halo Data report — ${profile} (Sales only).`)
  lines.push(
    `${coverage.current_value} of ${coverage.total} catalog measures have a current governed value; ` +
      `${coverage.no_current_data} await data and ${coverage.withheld} are withheld. ` +
      `No number or benchmark is invented; withheld and unavailable states are shown explicitly.`,
  )

  const valued = cards.filter((c) => c.current.state === 'value' && c.display != null)
  for (const c of valued) {
    const p = c.provenance
    const period = p?.period?.start && p?.period?.end ? `, ${p.period.start}–${p.period.end}` : ''
    const src = p?.source ? ` source: ${p.source}${period}` : ''
    lines.push(`• ${c.label}: ${c.display} (${src.trim()}). ${industryPhrase(c)}; ${baselinePhrase(c)}.`)
  }
  if (valued.length === 0) {
    lines.push(
      `No catalog measure has a current governed value for this store/period — every measure is withheld or awaiting data.`,
    )
  }

  lines.push(`Limitations: ${input.limitations.join(' ')}`)
  return lines.join('\n')
}
