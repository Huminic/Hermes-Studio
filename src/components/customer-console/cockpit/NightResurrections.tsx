/**
 * Night Shift & Resurrections — the paired coverage panel. Night Shift: the share
 * of engagement outside store hours + the median first-reply clock ("answered in
 * seconds while the store slept"). Resurrections: customers silent after the first
 * touch who came alive only after the follow-up safety net — conversations that
 * exist only because the engine didn't forget. Both are real counts from the hub.
 */
export function NightResurrections({
  data,
  accent,
}: {
  data: { after_hours_pct: number; ah_threads: number; median_reply_secs: number | null; resurrections: number }
  accent: string
}) {
  return (
    <div className="nr-grid">
      <div className="panel nr-card" style={{ padding: 20, borderTop: `3px solid ${accent}` }}>
        <div className="sect-title">Night Shift</div>
        <div className="sect-desc">Engagement while the store is closed.</div>
        <div className="nr-big tnum">{data.after_hours_pct}%</div>
        <div className="nr-sub">
          {data.ah_threads.toLocaleString('en-US')} after-hours conversations
          {data.median_reply_secs != null && <> · answered in {data.median_reply_secs}s median, any hour</>}
        </div>
      </div>
      <div className="panel nr-card" style={{ padding: 20, borderTop: `3px solid ${accent}` }}>
        <div className="sect-title">Resurrections</div>
        <div className="sect-desc">Silent after the first touch — revived by the follow-up.</div>
        <div className="nr-big tnum">{data.resurrections.toLocaleString('en-US')}</div>
        <div className="nr-sub">conversations that exist only because the engine didn’t forget</div>
      </div>
    </div>
  )
}
