/**
 * AI Power Packs wall — heartbeat-driven capability cards for the Dashboard
 * landing. Renders "N of 15 systems online" and one card per pack; status comes
 * from live per-store heartbeats (see power-packs.ts). No per-store hardcoding.
 */
import {
  PACKS,
  computePackStatus,
  packsSummary,
  type Heartbeats,
} from './power-packs'

const ACCENT_CLASS: Record<string, string> = {
  cool: 'coolc',
  hot: 'hotc',
  good: 'goodc',
}

export function PowerPacks({ heartbeats }: { heartbeats: Heartbeats }) {
  const { online, total } = packsSummary(heartbeats)
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <h2 className="sect-title">AI Power Packs</h2>
        <span className="svc-st" style={{ fontSize: 11 }}>
          {online} of {total} systems online
        </span>
      </div>
      <p className="sect-desc">Capabilities on duty for this store, around the clock.</p>
      <div className="panel">
        <div className="svc-grid">
          {PACKS.map((p) => {
            const st = computePackStatus(p, heartbeats)
            const stateClass = st.status === 'online' ? '' : 'standby'
            return (
              <div key={p.id} className={`svc ${ACCENT_CLASS[p.accent]} ${stateClass}`}>
                <div className="ico" aria-hidden="true">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                </div>
                <div className="svc-mid">
                  <span className="svc-n">{p.name}</span>
                  <span className="svc-d">{p.desc}</span>
                </div>
                <span className="svc-st">
                  <span className="d" />
                  {st.text}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
