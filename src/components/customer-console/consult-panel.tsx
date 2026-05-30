/**
 * customer-console.tools sub-panel — Consult (AC.13.1-AC.13.3).
 *
 * Lets the Huminic customer-admin (and any other profile that turns
 * on consult: true in studio.yaml) drive their engagement state
 * through the same YAML the consultative agent reads.
 *
 * The chat surface here re-uses /api/customer/chat with the
 * consultative-agent profile so the agent runs on Hermes against
 * its own SOUL + persona — no separate harness.
 */

import { useCallback, useEffect, useState } from 'react'
import type { StudioConfig } from '../../lib/studio-config'

type EngagementState = {
  customer: string
  current_stage: string
  stage_entered_at: string
  stage_history: Array<{
    stage: string
    entered_at: string
    exited_at: string | null
    notes: string
    skipped: boolean
  }>
  readiness_gates: Record<
    string,
    {
      status: string
      approved_by: string | null
      approved_at: string | null
      notes?: string
      decision?: string | null
    }
  >
  deployment_notes: Array<{
    id?: string
    note: string
    status: string
  }>
}

type StateResponse = {
  ok: boolean
  state?: EngagementState
  error?: string
}

const STAGES = [
  'draft',
  'gathering_data',
  'solution_discovery',
  'creation',
  'submission',
  'feedback',
  'ready_to_run',
]

export function ConsultPanel(props: {
  profile: string
  config: StudioConfig
}) {
  const [state, setState] = useState<EngagementState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const accent = props.config.branding.accent_color ?? '#1e40af'

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/customer/engagement-state?profile=${encodeURIComponent(props.profile)}`,
        { credentials: 'include' },
      )
      const j = (await res.json().catch(() => ({}))) as StateResponse
      if (!res.ok || !j.ok) {
        setError(j.error ?? `HTTP ${res.status}`)
        setState(null)
        return
      }
      setError(null)
      setState(j.state ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'fetch failed')
    }
  }, [props.profile])

  useEffect(() => {
    void load()
  }, [load])

  const advance = useCallback(
    async (to: string) => {
      setBusy(true)
      try {
        await fetch('/api/customer/engagement-state', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profile: props.profile,
            action: 'advance',
            to_stage: to,
            notes: `Advanced via customer console at ${new Date().toISOString()}`,
          }),
        })
        await load()
      } finally {
        setBusy(false)
      }
    },
    [load, props.profile],
  )

  const approveGate = useCallback(
    async (gate: string) => {
      setBusy(true)
      try {
        await fetch('/api/customer/engagement-state', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profile: props.profile,
            action: 'approve_gate',
            gate,
            notes: 'Approved via customer console.',
          }),
        })
        await load()
      } finally {
        setBusy(false)
      }
    },
    [load, props.profile],
  )

  if (error) {
    return (
      <div className="rounded border border-amber-400/30 bg-amber-400/10 p-3 text-xs">
        <div className="font-medium">No engagement state for {props.profile}</div>
        <div className="opacity-70">{error}</div>
        <div className="mt-2 opacity-70">
          Operator: seed{' '}
          <code>
            ~/.hermes/profiles/{props.profile}/engagement-state.yaml
          </code>{' '}
          with the consultative agent's draft template.
        </div>
      </div>
    )
  }

  if (!state) {
    return <div className="text-xs opacity-60">Loading engagement state…</div>
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded border border-white/10 bg-white/5 p-3">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-xs opacity-60">Current stage</div>
            <div className="text-sm font-semibold">{state.current_stage}</div>
          </div>
          <div className="text-[10px] opacity-50">
            entered {new Date(state.stage_entered_at).toLocaleString()}
          </div>
        </div>
        <ol className="mt-2 flex flex-wrap gap-1 text-[10px]">
          {STAGES.map((s) => {
            const idx = STAGES.indexOf(state.current_stage)
            const here = STAGES.indexOf(s)
            const past = here <= idx
            return (
              <li
                key={s}
                className={
                  'rounded px-2 py-0.5 ' +
                  (past
                    ? 'opacity-100'
                    : 'opacity-50 hover:opacity-100 cursor-pointer')
                }
                style={past ? { background: `${accent}33` } : undefined}
                onClick={() => !busy && void advance(s)}
              >
                {s}
              </li>
            )
          })}
        </ol>
      </div>

      <div className="rounded border border-white/10 bg-white/5 p-3">
        <div className="mb-1 text-xs font-medium opacity-70">Readiness gates</div>
        <ul className="text-xs">
          {Object.entries(state.readiness_gates).map(([gate, meta]) => (
            <li
              key={gate}
              className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/5 py-1"
            >
              <span>{gate}</span>
              <span
                className={
                  'rounded px-1.5 py-0.5 text-[10px] uppercase ' +
                  (meta.status === 'approved'
                    ? 'bg-emerald-500/20'
                    : meta.status === 'pending'
                      ? 'bg-amber-400/20'
                      : 'bg-white/10')
                }
              >
                {meta.status}
              </span>
              {meta.approved_by && (
                <span className="text-[10px] opacity-60">
                  by {meta.approved_by}
                </span>
              )}
              {meta.status !== 'approved' && (
                <button
                  type="button"
                  onClick={() => void approveGate(gate)}
                  disabled={busy}
                  className="rounded border border-white/10 px-2 py-0.5 text-[10px] opacity-80 hover:opacity-100"
                >
                  Approve
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded border border-white/10 bg-white/5 p-3">
        <div className="mb-1 text-xs font-medium opacity-70">
          Deployment notes
        </div>
        {state.deployment_notes.length === 0 ? (
          <div className="text-xs opacity-50">No notes recorded.</div>
        ) : (
          <ul className="text-xs">
            {state.deployment_notes.map((n, i) => (
              <li
                key={n.id ?? i}
                className={
                  'border-b border-white/5 py-1 ' +
                  (n.status === 'open' ? '' : 'opacity-60')
                }
              >
                <span className="opacity-60">[{n.status}]</span> {n.note}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded border border-white/10 bg-black/20 p-3 text-xs">
        To chat with the consultative agent about this engagement, switch to
        the <span className="font-medium">Chat</span> tab and pick the
        consultative-agent SOUL (visible when this profile's
        consultative-agent fragment is exposed in studio.yaml.agent_picker).
      </div>
    </div>
  )
}
