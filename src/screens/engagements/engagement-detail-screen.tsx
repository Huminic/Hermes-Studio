import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ENGAGEMENT_STAGES,
  gateProgress,
  stageIndex,
  type EngagementState,
} from '@/lib/engagement-state'

type EngagementEntry = {
  customer: string
  state?: EngagementState
  parseErrors?: Array<string>
}

type EngagementsResponse = {
  customers: Array<EngagementEntry>
}

async function fetchEngagements(): Promise<EngagementsResponse> {
  const response = await fetch('/api/engagements')
  if (!response.ok) {
    throw new Error(`Failed to load engagements: ${response.status}`)
  }
  return (await response.json()) as EngagementsResponse
}

export function EngagementDetailScreen({ customer }: { customer: string }) {
  const query = useQuery({
    queryKey: ['engagements'],
    queryFn: fetchEngagements,
    refetchInterval: 30_000,
  })

  const entry = query.data?.customers.find((c) => c.customer === customer)

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <Link
          to="/engagements"
          className="text-xs opacity-60 hover:opacity-100"
        >
          ← All engagements
        </Link>
        <h1 className="text-2xl font-semibold">{customer}</h1>
      </header>

      {query.isLoading && (
        <div className="text-sm opacity-60">Loading…</div>
      )}

      {query.isError && (
        <div className="rounded border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-300">
          {(query.error as Error).message}
        </div>
      )}

      {query.data && !entry && (
        <div className="rounded border border-white/10 bg-white/5 p-4 text-sm opacity-70">
          No engagement found for "{customer}". Profile may not have an
          engagement-state.yaml seeded.
        </div>
      )}

      {entry?.parseErrors && (
        <div className="rounded border border-red-400/40 bg-red-500/10 p-4 text-sm">
          <div className="font-medium text-red-300">
            engagement-state.yaml has parse errors
          </div>
          <ul className="mt-2 list-disc pl-5 text-xs opacity-80">
            {entry.parseErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {entry?.state && <EngagementDetailBody state={entry.state} />}
    </div>
  )
}

function EngagementDetailBody({ state }: { state: EngagementState }) {
  const idx = stageIndex(state)
  const progress = gateProgress(state)

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Current stage</h2>
          <div className="rounded bg-white/10 px-2 py-0.5 text-xs uppercase tracking-wide">
            {formatStage(state.current_stage)}
          </div>
        </div>
        <div className="flex h-3 overflow-hidden rounded bg-white/10">
          {ENGAGEMENT_STAGES.map((stage, i) => (
            <div
              key={stage}
              className={
                'flex-1 ' +
                (i < idx
                  ? 'bg-emerald-400/70'
                  : i === idx
                    ? 'bg-emerald-400'
                    : 'bg-white/5')
              }
              title={formatStage(stage)}
            />
          ))}
        </div>
        <div className="flex justify-between text-[10px] uppercase tracking-wide opacity-60">
          {ENGAGEMENT_STAGES.map((s) => (
            <span key={s} className="flex-1 text-center">
              {formatStage(s)}
            </span>
          ))}
        </div>
        <div className="mt-1 text-xs opacity-70">
          Entered at {state.stage_entered_at}
        </div>
      </section>

      <DetailGrid>
        <DetailPanel title="Build-time crew" subtitle={`${state.build_time_crew.length} members`}>
          <ul className="flex flex-col gap-1 text-xs">
            {state.build_time_crew.map((m, i) => (
              <li key={i} className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{m.role}</span>
                <span className="opacity-60">{m.profile}</span>
              </li>
            ))}
          </ul>
        </DetailPanel>

        <DetailPanel title="Run-time crew" subtitle={`${state.run_time_crew.length} members`}>
          <ul className="flex flex-col gap-1 text-xs">
            {state.run_time_crew.map((m, i) => (
              <li key={i} className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{m.role}</span>
                <span className="opacity-60">{m.profile}</span>
              </li>
            ))}
          </ul>
        </DetailPanel>
      </DetailGrid>

      <section className="rounded-lg border border-white/10 bg-white/5 p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Readiness gates</h2>
          <div className="text-xs opacity-70">
            {progress.approved} approved · {progress.pending} pending ·{' '}
            {progress.rejected} rejected
          </div>
        </div>
        <ul className="flex flex-col gap-2">
          {Object.entries(state.readiness_gates).map(([key, gate]) => (
            <li
              key={key}
              className="flex flex-col gap-1 rounded border border-white/10 bg-black/10 p-2 text-xs"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{formatStage(key)}</span>
                <GateStatusBadge status={gate.status} />
              </div>
              {'decision' in gate && gate.decision && (
                <div className="opacity-70">Decision: {gate.decision}</div>
              )}
              {gate.approved_by && (
                <div className="opacity-60">
                  Approved by {gate.approved_by} at {gate.approved_at}
                </div>
              )}
              {'notes' in gate && gate.notes && (
                <div className="opacity-70">{gate.notes}</div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <DetailGrid>
        <DetailPanel
          title="Deployment notes"
          subtitle={`${state.deployment_notes.length} total`}
        >
          {state.deployment_notes.length === 0 ? (
            <div className="text-xs opacity-60">
              None recorded. The consultative agent populates these during
              audit + author phases.
            </div>
          ) : (
            <ul className="flex flex-col gap-2 text-xs">
              {state.deployment_notes.map((n, i) => (
                <li
                  key={i}
                  className={
                    'rounded border p-2 ' +
                    (n.resolved_at
                      ? 'border-emerald-300/30 bg-emerald-400/5'
                      : 'border-amber-300/30 bg-amber-400/5')
                  }
                >
                  <div className="flex items-baseline justify-between">
                    <span className="font-medium">{n.area}</span>
                    <span className="opacity-70">{n.status}</span>
                  </div>
                  <div className="mt-1 opacity-70">{n.impact_if_missing}</div>
                  <div className="mt-1 text-[10px] opacity-50">
                    Surfaced at {n.surfaced_at}
                    {n.resolved_at && ` · resolved at ${n.resolved_at}`}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DetailPanel>

        <DetailPanel
          title="Open decisions"
          subtitle={`${state.open_decisions.length} total`}
        >
          {state.open_decisions.length === 0 ? (
            <div className="text-xs opacity-60">
              None. The consultative agent surfaces decisions here when it
              hits a fork in the road.
            </div>
          ) : (
            <ul className="flex flex-col gap-2 text-xs">
              {state.open_decisions.map((d) => (
                <li
                  key={d.id}
                  className="rounded border border-white/10 bg-black/10 p-2"
                >
                  <div className="font-medium">{d.id}</div>
                  <div className="opacity-70">{d.description}</div>
                  {d.blocking_stage && (
                    <div className="mt-1 text-[10px] opacity-60">
                      Blocking: {formatStage(d.blocking_stage)}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DetailPanel>
      </DetailGrid>

      <DetailPanel
        title="Adjacent data neighbors"
        subtitle={`${state.adjacent_data_neighbors.length} flagged`}
      >
        {state.adjacent_data_neighbors.length === 0 ? (
          <div className="text-xs opacity-60">
            None yet. Populated during the design phase as the agent maps
            sources that aren't currently wired but are likely to become
            relevant.
          </div>
        ) : (
          <ul className="flex flex-col gap-1 text-xs">
            {state.adjacent_data_neighbors.map((n, i) => (
              <li
                key={i}
                className="flex items-baseline justify-between gap-2 border-b border-white/5 pb-1"
              >
                <span className="font-medium">{n.name}</span>
                <span className="opacity-60">
                  {n.source_type} · {n.likelihood}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DetailPanel>

      <section className="rounded-lg border border-white/10 bg-white/5 p-4">
        <h2 className="mb-3 text-base font-semibold">Stage history</h2>
        <ol className="flex flex-col gap-2">
          {state.stage_history.map((h, i) => (
            <li
              key={i}
              className="rounded border border-white/10 bg-black/10 p-2 text-xs"
            >
              <div className="flex items-baseline justify-between">
                <span className="font-medium">{formatStage(h.stage)}</span>
                {h.skipped && (
                  <span className="rounded bg-amber-400/20 px-1 text-[10px]">
                    skipped
                  </span>
                )}
              </div>
              <div className="opacity-70">{h.notes}</div>
              <div className="mt-1 text-[10px] opacity-50">
                Entered at {h.entered_at}
                {h.exited_at && ` · exited at ${h.exited_at}`}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}

function DetailGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>
}

function DetailPanel({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/5 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle && <div className="text-xs opacity-60">{subtitle}</div>}
      </div>
      <div>{children}</div>
    </section>
  )
}

function GateStatusBadge({ status }: { status: string }) {
  const tone =
    status === 'approved'
      ? 'bg-emerald-400/20 text-emerald-200'
      : status === 'rejected'
        ? 'bg-red-400/20 text-red-200'
        : 'bg-white/10 opacity-70'
  return (
    <span className={`rounded px-2 py-0.5 text-[10px] uppercase ${tone}`}>
      {status}
    </span>
  )
}

function formatStage(key: string): string {
  return key
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}
