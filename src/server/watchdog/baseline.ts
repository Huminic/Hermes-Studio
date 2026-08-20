/**
 * Per-dealer baselining. A store is compared against its OWN trailing history,
 * so a dealer whose "normal" is slow is an initial observation, not a recurring
 * alarm. Deviation tiers mirror the catalog's engine rules:
 *   |z| >= 3  → hard   (breach)
 *   |z| >= 2  → soft   (watch)
 *   3 consecutive same-direction steps → drift (trend)
 * All pure + total: too-few-samples / zero-variance → no signal (null / 'none').
 */
export function mean(xs: Array<number>): number {
  if (xs.length === 0) return 0
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

/** Population standard deviation. */
export function stddev(xs: Array<number>): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length
  return Math.sqrt(v)
}

/**
 * z-score of `x` against the trailing `history`. Needs >= 3 history points and
 * non-zero variance, else null (not enough of a baseline to judge — no alarm).
 */
export function zScore(x: number, history: Array<number>): number | null {
  if (history.length < 3) return null
  const sd = stddev(history)
  if (sd === 0) return null
  return (x - mean(history)) / sd
}

export type Deviation = 'none' | 'soft' | 'hard'

export function classifyDeviation(z: number | null): Deviation {
  if (z == null) return 'none'
  const a = Math.abs(z)
  if (a >= 3) return 'hard'
  if (a >= 2) return 'soft'
  return 'none'
}

/** Map a deviation (+ direction badness) to an Issues priority. */
export function deviationPriority(dev: Deviation): 'low' | 'medium' | 'high' {
  if (dev === 'hard') return 'high'
  if (dev === 'soft') return 'medium'
  return 'low'
}

export type Drift = 'up' | 'down' | null

/**
 * Detect a monotone drift over the tail of a series: the last `k` steps all move
 * the same direction (default 3 consecutive same-direction deltas → 4 points).
 */
export function driftDirection(series: Array<number>, k = 3): Drift {
  if (series.length < k + 1) return null
  const tail = series.slice(-(k + 1))
  let up = true
  let down = true
  for (let i = 1; i < tail.length; i++) {
    if (!(tail[i] > tail[i - 1])) up = false
    if (!(tail[i] < tail[i - 1])) down = false
  }
  if (up) return 'up'
  if (down) return 'down'
  return null
}
