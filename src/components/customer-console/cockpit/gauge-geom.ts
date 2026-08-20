/**
 * Exact port of the Serra report gauge geometry (generator/v2_full_template.html `gauge()`).
 * A 270° arc starting at 135°. `value`/`prior` are 0..1 fractions (share).
 * Pure functions so the geometry is unit-testable independent of React/SVG.
 */
export const GAUGE_SIZE = 330
const CX = 165
const CY = 165
const K = GAUGE_SIZE / 230

/** Map fraction f (0..1) at radius r to an [x,y] point on the 270° arc. */
export function pt(r: number, f: number, cx = CX, cy = CY): [number, number] {
  const th = ((135 + f * 270) * Math.PI) / 180
  return [cx + r * Math.cos(th), cy + r * Math.sin(th)]
}

export type Tick = { x1: number; y1: number; x2: number; y2: number; major: boolean }

/** 51 tick marks; every 5th is major. */
export function ticks(): Array<Tick> {
  const out: Array<Tick> = []
  for (let i = 0; i <= 50; i++) {
    const f = i / 50
    const major = i % 5 === 0
    const [x1, y1] = pt((major ? 78 : 86) * K, f)
    const [x2, y2] = pt(95 * K, f)
    out.push({ x1, y1, x2, y2, major })
  }
  return out
}

export type NumLabel = { x: number; y: number; text: string }

/** The 20/40/60/80 numeric labels. */
export function numLabels(): Array<NumLabel> {
  return [0.2, 0.4, 0.6, 0.8].map((f) => {
    const [x, y] = pt(64 * K, f)
    return { x, y: y + 3.5, text: String(Math.round(f * 100)) }
  })
}

/** SVG path for the colored value arc from 0 → value. */
export function valueArc(value: number): string {
  const r = 103 * K
  const [sx, sy] = pt(r, 0)
  const [ex, ey] = pt(r, value)
  const large = value * 270 > 180 ? 1 : 0
  return `M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey}`
}

/** Needle tail/tip/hub points for a given value. */
export function needle(value: number): {
  tail: [number, number]
  tip: [number, number]
  hub: [number, number]
} {
  return {
    tail: pt(-13 * K, value),
    tip: pt(82 * K, value),
    hub: [CX, CY],
  }
}

/** Prior-period ghost-dot position. */
export function priorDot(prior: number): [number, number] {
  return pt(111 * K, prior)
}

/** Clamp any incoming fraction to [0,1]; null/undefined → 0 (no fabrication — reads empty). */
export function clampFraction(value: number | null | undefined): number {
  if (value == null || Number.isNaN(value)) return 0
  return Math.max(0, Math.min(1, value))
}
