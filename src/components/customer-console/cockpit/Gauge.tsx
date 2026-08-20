/**
 * Cockpit gauge — faithful React/SVG port of the Serra report's `gauge()`.
 * Reach = cool (#4C8DF6), Night Shift = hot (#E8384F). `value`/`prior` are 0..1.
 * Availability-safe: a null value renders an empty gauge (needle at 0), never an error.
 */
import {
  GAUGE_SIZE,
  clampFraction,
  needle,
  numLabels,
  priorDot,
  ticks,
  valueArc,
} from './gauge-geom'

export type GaugeProps = {
  label: string
  display: string
  sub?: string
  notch?: string
  value: number | null
  prior?: number | null
  accent: string
}

export function Gauge({
  label,
  display,
  sub,
  notch,
  value,
  prior,
  accent,
}: GaugeProps) {
  const v = clampFraction(value)
  const nd = needle(v)
  const hasPrior = prior != null && !Number.isNaN(prior)
  const [px, py] = hasPrior ? priorDot(clampFraction(prior)) : [0, 0]
  return (
    <div className="gslot" style={{ textAlign: 'center' }}>
      <svg
        width="100%"
        viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`}
        style={{ maxWidth: GAUGE_SIZE }}
        role="img"
        aria-label={`${label} ${display}`}
      >
        {ticks().map((t, i) => (
          <line
            key={`t${i}`}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke={t.major ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.15)'}
            strokeWidth={t.major ? 2 : 1.2}
            strokeLinecap="round"
          />
        ))}
        {numLabels().map((n, i) => (
          <text
            key={`n${i}`}
            x={n.x}
            y={n.y}
            textAnchor="middle"
            fontSize={10}
            fill="rgba(255,255,255,0.42)"
            fontFamily="inherit"
          >
            {n.text}
          </text>
        ))}
        <path
          d={valueArc(v)}
          fill="none"
          stroke={accent}
          strokeWidth={3.5}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 7px ${accent})` }}
        />
        {hasPrior && <circle cx={px} cy={py} r={3.2} fill="rgba(255,255,255,0.42)" />}
        <line
          x1={nd.tail[0]}
          y1={nd.tail[1]}
          x2={nd.tip[0]}
          y2={nd.tip[1]}
          stroke={accent}
          strokeWidth={2.6}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${accent})` }}
        />
        <circle cx={nd.hub[0]} cy={nd.hub[1]} r={8.5} fill="#0B1220" stroke={accent} strokeWidth={2.2} />
        <circle cx={nd.hub[0]} cy={nd.hub[1]} r={3} fill={accent} />
        <text x={165} y={217} textAnchor="middle" fontSize={34} fontWeight={600} fill="#ffffff" fontFamily="inherit">
          {display}
        </text>
        {sub && (
          <text x={165} y={237} textAnchor="middle" fontSize={11} fill="rgba(255,255,255,0.55)" fontFamily="inherit">
            {sub}
          </text>
        )}
        {notch && (
          <text
            x={165}
            y={281}
            textAnchor="middle"
            fontSize={11.5}
            fontWeight={600}
            fill="rgba(255,255,255,0.65)"
            fontFamily="inherit"
            letterSpacing={2}
          >
            {notch.toUpperCase()}
          </text>
        )}
      </svg>
    </div>
  )
}
