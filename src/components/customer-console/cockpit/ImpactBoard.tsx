/**
 * AI Impact Board — the top-line five (AI Actions, Leads Touched, Conversations
 * Held, Sales Touched, Revenue Presence) with WoW trend arrows. Per the report
 * spec: direction is the arrow, goodness is the color (a bad metric rising is a
 * red up-arrow, never green). Metrics not yet sourced show '—' + an honest note —
 * never a fabricated zero. The card top-border uses the store's brand accent.
 */
import type { ImpactMetric, Arrow } from '../../../server/cockpit/cockpit-data'

const glyph = (dir: Arrow['dir']) => (dir === 'up' ? '▲' : dir === 'down' ? '▼' : '→')

export function ImpactBoard({
  metrics,
  accent,
}: {
  metrics: Array<ImpactMetric>
  accent: string
}) {
  return (
    <div className="panel impact-board" style={{ padding: 20 }}>
      <div className="sect-title">AI Impact Board</div>
      <div className="sect-desc">This period, with the change from the one before.</div>
      <div className="impact-grid">
        {metrics.map((m) => (
          <div
            key={m.key}
            className="impact-card"
            style={{ borderTop: `3px solid ${accent}` }}
          >
            <div className="impact-value tnum">
              {m.display}
              {m.arrow && (
                <span
                  className={`impact-arrow ${m.arrow.good ? 'good' : 'bad'}`}
                  aria-label={`${m.arrow.dir} ${m.arrow.good ? 'favorable' : 'unfavorable'}`}
                >
                  {glyph(m.arrow.dir)}
                </span>
              )}
            </div>
            <div className="impact-label">{m.label}</div>
            {m.note && <div className="impact-note">{m.note}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
