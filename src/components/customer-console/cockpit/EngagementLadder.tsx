/**
 * Engagement Ladder — New Buyer Funnel Facts. Reached → Replied → Conversed →
 * Intent Gathered → Walked In / Sold. Each rung shows its count and the conversion
 * from the prior rung. This is the honest version of an "influence score": every
 * rung is a real, recountable number. Rungs not yet sourced (the CRM sold-join)
 * show '—' with a note — never a fabricated zero. A step bar visualizes each rung
 * as a share of the first (Reached).
 */
import type { LadderRung } from '../../../server/cockpit/cockpit-data'

const pct = (n: number) => `${Math.round(n * 100)}%`

export function EngagementLadder({
  rungs,
  accent,
}: {
  rungs: Array<LadderRung>
  accent: string
}) {
  const base = rungs[0]?.count ?? null
  return (
    <div className="panel ladder" style={{ padding: 20 }}>
      <div className="sect-title">New Buyer Funnel Facts</div>
      <div className="sect-desc">
        Each rung is a real count — the honest version of an influence score.
      </div>
      <div className="ladder-rows">
        {rungs.map((r) => {
          const share = base && base > 0 && r.count != null ? r.count / base : null
          return (
            <div key={r.key} className="ladder-row">
              <div className="ladder-label">{r.label}</div>
              <div className="ladder-bar-wrap">
                <div
                  className="ladder-bar"
                  style={{ width: share != null ? `${Math.max(2, share * 100)}%` : '2%', background: accent }}
                />
              </div>
              <div className="ladder-count tnum">
                {r.count != null ? r.count.toLocaleString('en-US') : '—'}
                {r.conv != null && <span className="ladder-conv"> · {pct(r.conv)} of prior</span>}
                {r.note && <span className="ladder-note"> · {r.note}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
