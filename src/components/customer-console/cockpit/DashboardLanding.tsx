/**
 * Dashboard landing — the cockpit you see on arrival: the Reach + Night-Shift
 * gauges with the cumulative odometer between them, then the Ask-AI box, then
 * the heartbeat Power Packs. Fetches the view from /api/customer/cockpit.
 * Availability-safe: gauges render empty and a quiet banner shows if data is
 * unavailable — never an error screen.
 */
import { useEffect, useState } from 'react'
import { Gauge } from './Gauge'
import { Odometer } from './Odometer'
import { PowerPacks } from './PowerPacks'
import { AskAi } from './AskAi'
import { ImpactBoard } from './ImpactBoard'
import { EngagementLadder } from './EngagementLadder'
import { NightResurrections } from './NightResurrections'
import { AlertModal } from '../AlertModal'
import type { Heartbeats } from './power-packs'
import type { ImpactMetric, LadderRung } from '../../../server/cockpit/cockpit-data'
import './cockpit.css'

type GaugeView = { value: number | null; display: string; sub: string }
type NightShift = { after_hours_pct: number; ah_threads: number; median_reply_secs: number | null; resurrections: number }
type CockpitView = {
  reach: GaugeView
  night: GaugeView
  odometer: number
  median_reply_secs: number | null
  impact: Array<ImpactMetric>
  ladder: Array<LadderRung>
  night_shift: NightShift
  accent: string
  heartbeats: Heartbeats
  window_days: number
}

export function DashboardLanding({
  profile,
  windowDays = 30,
}: {
  profile: string
  windowDays?: number
}) {
  const [view, setView] = useState<CockpitView | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [alertOpen, setAlertOpen] = useState(false)

  useEffect(() => {
    let live = true
    setLoading(true)
    setErr(null)
    fetch(
      `/api/customer/cockpit?profile=${encodeURIComponent(profile)}&window=${windowDays}`,
      { credentials: 'include' },
    )
      .then((r) => r.json())
      .then((j: { ok: boolean; view?: CockpitView; error?: string }) => {
        if (!live) return
        if (j.ok && j.view) setView(j.view)
        else setErr(j.error ?? 'unavailable')
      })
      .catch(() => live && setErr('unavailable'))
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
  }, [profile, windowDays])

  return (
    <div
      className="cockpit"
      style={{ padding: 20, minHeight: '100%', ...(view?.accent ? { ['--accent' as string]: view.accent } : {}) }}
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => setAlertOpen(true)}
          style={{
            background: view?.accent ?? '#4c8df6', color: '#fff', border: 'none',
            borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          + Create alert
        </button>
      </div>

      <div className="panel" style={{ padding: 20 }}>
        <div className="cockpit-gauges">
          <div className="gslot coolg">
            <Gauge
              label="Reach"
              accent="#4C8DF6"
              notch="Leads Engaged"
              value={view?.reach.value ?? null}
              display={view?.reach.display ?? (loading ? '…' : '—')}
              sub={view?.reach.sub}
            />
            <div className="glabel">Reach</div>
          </div>
          <Odometer value={view?.odometer ?? 0} mini />
          <div className="gslot hotg">
            <Gauge
              label="Night Shift"
              accent="#E8384F"
              notch="After Hours"
              value={view?.night.value ?? null}
              display={view?.night.display ?? (loading ? '…' : '—')}
              sub={view?.night.sub}
            />
            <div className="glabel">Night Shift</div>
          </div>
        </div>
        {view?.median_reply_secs != null && (
          <div className="gsub" style={{ textAlign: 'center', marginTop: 10 }}>
            {view.median_reply_secs}s median first reply, any hour
          </div>
        )}
        {err && (
          <div
            className="gsub"
            style={{ textAlign: 'center', marginTop: 10, color: 'var(--standby)' }}
          >
            Live data unavailable right now.
          </div>
        )}
      </div>

      {view?.impact && view.impact.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <ImpactBoard metrics={view.impact} accent={view.accent} />
        </div>
      )}

      {view?.ladder && view.ladder.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <EngagementLadder rungs={view.ladder} accent={view.accent} />
        </div>
      )}

      {view?.night_shift && (
        <div style={{ marginTop: 20 }}>
          <NightResurrections data={view.night_shift} accent={view.accent} />
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <AskAi profile={profile} windowDays={windowDays} />
      </div>

      <div style={{ marginTop: 20 }}>
        <PowerPacks heartbeats={view?.heartbeats ?? {}} />
      </div>

      {alertOpen && <AlertModal profile={profile} onClose={() => setAlertOpen(false)} />}
    </div>
  )
}
