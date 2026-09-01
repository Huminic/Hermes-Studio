/**
 * Pure derivation helpers: confidence (from sample size), rating (vs operational
 * target), and cross-dealer rank. Deterministic; no I/O.
 */
import type { Baseline } from './types'

export const WATCH_BAND_FRACTION = 0.1

export function confidenceLabel(denominator: number): string {
  if (denominator >= 100) return 'high'
  if (denominator >= 15) return 'medium'
  return 'low'
}

/**
 * Rating vs an operational target. Uses the target comparator (the "fires" direction)
 * and a watch band that is a fixed fraction of the threshold. breach = rule fires;
 * watch = within the band on the safe side; healthy = clear of the band.
 */
export function rating(
  value: number,
  baseline: Baseline,
): 'healthy' | 'watch' | 'breach' | null {
  const t = baseline.value
  if (t === null || baseline.comparator === null) return null
  const band = Math.abs(t) * WATCH_BAND_FRACTION
  if (baseline.comparator === '<') {
    // fires (breach) when value < t
    if (value < t) return 'breach'
    if (value < t + band) return 'watch'
    return 'healthy'
  }
  // comparator '>' : fires (breach) when value > t
  if (value > t) return 'breach'
  if (value > t - band) return 'watch'
  return 'healthy'
}

export function signedVariance(
  value: number,
  baseline: Baseline,
): number | null {
  if (baseline.value === null) return null
  return value - baseline.value
}

/**
 * Rank a dealer's value among peers for the same metric, best-first by direction.
 * Ties share the better rank (standard competition ranking). Returns 1..n.
 */
export function rankByDirection(
  value: number,
  peers: Array<number>,
  direction: 'higher_is_better' | 'lower_is_better',
): number {
  const better = (a: number, b: number) =>
    direction === 'higher_is_better' ? a > b : a < b
  let rank = 1
  for (const p of peers) {
    if (better(p, value)) rank++
  }
  return rank
}
