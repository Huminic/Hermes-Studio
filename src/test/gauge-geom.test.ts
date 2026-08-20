import { describe, it, expect } from 'vitest'
import {
  GAUGE_SIZE,
  clampFraction,
  needle,
  numLabels,
  priorDot,
  pt,
  ticks,
  valueArc,
} from '@/components/customer-console/cockpit/gauge-geom'

describe('gauge geometry (exact port of the Serra report gauge())', () => {
  it('starts the arc at 135° (f=0) and sweeps 270°', () => {
    // f=0 → 135°; cos135 = -sin45, sin135 = +cos45
    const [x0, y0] = pt(100, 0)
    expect(x0).toBeCloseTo(165 + 100 * Math.cos((135 * Math.PI) / 180), 5)
    expect(y0).toBeCloseTo(165 + 100 * Math.sin((135 * Math.PI) / 180), 5)
    // f=1 → 405° ≡ 45°
    const [x1, y1] = pt(100, 1)
    expect(x1).toBeCloseTo(165 + 100 * Math.cos((45 * Math.PI) / 180), 5)
    expect(y1).toBeCloseTo(165 + 100 * Math.sin((45 * Math.PI) / 180), 5)
  })

  it('emits 51 ticks with 11 majors (every 5th)', () => {
    const t = ticks()
    expect(t).toHaveLength(51)
    expect(t.filter((x) => x.major)).toHaveLength(11)
    expect(t[0].major).toBe(true)
    expect(t[1].major).toBe(false)
  })

  it('labels 20/40/60/80', () => {
    expect(numLabels().map((n) => n.text)).toEqual(['20', '40', '60', '80'])
  })

  it('value arc large-arc flag flips past the half-sweep (value*270>180)', () => {
    expect(valueArc(0.5)).toContain(' 0 0 1 ') // 135° sweep < 180 → large=0
    expect(valueArc(0.9)).toContain(' 0 1 1 ') // 243° sweep > 180 → large=1
  })

  it('needle hub is the center; tip differs from tail', () => {
    const nd = needle(0.5)
    expect(nd.hub).toEqual([165, 165])
    expect(nd.tip).not.toEqual(nd.tail)
  })

  it('prior dot sits on the 111*k ghost ring', () => {
    const [x, y] = priorDot(0.25)
    // radius 111*(330/230) at f=0.25
    const r = 111 * (GAUGE_SIZE / 230)
    const th = ((135 + 0.25 * 270) * Math.PI) / 180
    expect(x).toBeCloseTo(165 + r * Math.cos(th), 5)
    expect(y).toBeCloseTo(165 + r * Math.sin(th), 5)
  })

  it('clampFraction is availability-safe: null/NaN → 0, clamps to [0,1]', () => {
    expect(clampFraction(null)).toBe(0)
    expect(clampFraction(undefined)).toBe(0)
    expect(clampFraction(Number.NaN)).toBe(0)
    expect(clampFraction(-0.5)).toBe(0)
    expect(clampFraction(1.5)).toBe(1)
    expect(clampFraction(0.66)).toBe(0.66)
  })
})
