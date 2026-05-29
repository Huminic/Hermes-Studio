import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ENGAGEMENT_STAGES,
  gateProgress,
  nextOpenDeploymentNote,
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
  error?: string
}

async function fetchEngagements(): Promise<EngagementsResponse> {
  const response = await fetch('/api/engagements')
  if (!response.ok) {
    throw new Error(`Failed to load engagements: ${response.status}`)
  }
  return (await response.json()) as EngagementsResponse
}

export function EngagementsScreen() {
  const query = useQuery({
    queryKey: ['engagements'],
    queryFn: fetchEngagements,
    refetchInterval: 30_000,
    staleTime: 10_000,
  })

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Engagements</h1>
        <p className="text-sm opacity-70">
          Where each customer sits in the consultative method. Stages flow
          Draft → Gathering Data → Solution Discovery → Creation → Submission
          → Feedback → Ready to Run.
        </p>
      </header>

      {query.isLoading && (
        <div className="text-sm opacity-60">Loading engagements…</div>
      )}

      {query.isError && (
        <div className="rounded border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-300">
          {(query.error as Error).message}
        </div>
      )}

      {query.data && query.data.customers.length === 0 && (
        <div className="rounded border border-white/10 bg-white/5 p-4 text-sm opacity-70">
          No engagements found. Seed engagement-state.yaml in a customer
          profile to get started. See{' '}
          <code className="rounded bg-black/30 px-1">
            docs/consulting_package/Hermes_Cursor_Implementation_Package/HAND_OFF_OPERATOR_GUIDE.md
          </code>
          .
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {query.data?.customers.map((entry) => (
          <EngagementCard key={entry.customer} entry={entry} />
        ))}
      </div>
    </div>
  )
}

function EngagementCard({ entry }: { entry: EngagementEntry }) {
  if (!entry.state) {
    return (
      <div className="rounded-lg border border-red-400/40 bg-red-500/5 p-4">
        <div className="text-sm font-medium">{entry.customer}</div>
        <div className="mt-2 text-xs text-red-300">
          engagement-state.yaml parse errors:
        </div>
        <ul className="mt-1 list-disc pl-5 text-xs opacity-80">
          {entry.parseErrors?.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </div>
    )
  }

  const state = entry.state
  const idx = stageIndex(state)
  const progress = gateProgress(state)
  const nextNote = nextOpenDeploymentNote(state)
  const stageLabel = formatStage(state.current_stage)

  return (
    <Link
      to="/engagements/$customer"
      params={{ customer: entry.customer }}
      className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/5 p-4 transition hover:border-white/30 hover:bg-white/10"
    >
      <div className="flex items-baseline justify-between">
        <div className="text-base font-semibold">{entry.customer}</div>
        <div className="rounded bg-white/10 px-2 py-0.5 text-xs uppercase tracking-wide">
          {stageLabel}
        </div>
      </div>

      <StageProgressBar idx={idx} />

      <div className="grid grid-cols-3 gap-2 text-xs">
        <Stat label="Approved" value={progress.approved} tone="positive" />
        <Stat label="Pending" value={progress.pending} tone="neutral" />
        <Stat label="Rejected" value={progress.rejected} tone="negative" />
      </div>

      <div className="border-t border-white/10 pt-2 text-xs opacity-80">
        <div>
          Build crew: {state.build_time_crew.length} · Run crew:{' '}
          {state.run_time_crew.length} · Open decisions:{' '}
          {state.open_decisions.length} · Deployment notes:{' '}
          {state.deployment_notes.length} · Adjacent neighbors:{' '}
          {state.adjacent_data_neighbors.length}
        </div>
      </div>

      {nextNote && (
        <div className="rounded border border-amber-300/30 bg-amber-400/5 p-2 text-xs">
          <div className="font-medium opacity-80">
            Open deployment note · {nextNote.area}
          </div>
          <div className="opacity-70">Status: {nextNote.status}</div>
          <div className="mt-1 opacity-70">{nextNote.impact_if_missing}</div>
        </div>
      )}
    </Link>
  )
}

function StageProgressBar({ idx }: { idx: number }) {
  const total = ENGAGEMENT_STAGES.length
  return (
    <div className="flex h-2 overflow-hidden rounded bg-white/10">
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
      <span className="sr-only">
        Stage {idx + 1} of {total}
      </span>
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'positive' | 'neutral' | 'negative'
}) {
  const toneClass =
    tone === 'positive'
      ? 'text-emerald-300'
      : tone === 'negative'
        ? 'text-red-300'
        : 'opacity-80'
  return (
    <div className="rounded bg-white/5 px-2 py-1">
      <div className={`text-sm font-semibold ${toneClass}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide opacity-60">
        {label}
      </div>
    </div>
  )
}

function formatStage(stage: string): string {
  return stage
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}
