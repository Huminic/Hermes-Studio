/**
 * AgentStatusStrip — compact Studio status bar.
 *
 * Shows: active profile | connection status
 * Visible only when [data-theme='hermes-os'] is active (controlled via CSS).
 */
import { useQuery } from '@tanstack/react-query'
import { useActiveProfile } from '@/hooks/use-active-profile'

type ConnectionStatus = {
  status: 'connected' | 'enhanced' | 'partial' | 'disconnected'
  activeModel: string
  hermesUrl: string
  chatReady: boolean
}

async function fetchStatus(): Promise<ConnectionStatus> {
  const res = await fetch('/api/connection-status', {
    signal: AbortSignal.timeout(4000),
  })
  if (!res.ok) throw new Error('fetch failed')
  return res.json() as Promise<ConnectionStatus>
}

function StatusPip({ status }: { status: ConnectionStatus['status'] | undefined }) {
  const color =
    status === 'enhanced' || status === 'connected'
      ? '#22d3ee'
      : status === 'partial'
        ? '#fbbf24'
        : '#f87171'
  return (
    <span
      className="inline-block rounded-full shrink-0"
      style={{
        width: 6,
        height: 6,
        background: color,
        boxShadow: `0 0 6px ${color}88`,
      }}
    />
  )
}

function formatProfileLabel(profile: string): string {
  const clean = profile && profile !== 'default' ? profile : 'studio'
  return clean
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function AgentStatusStrip() {
  const activeProfile = useActiveProfile()

  const { data, isLoading } = useQuery({
    queryKey: ['hermes', 'connection-status'],
    queryFn: fetchStatus,
    refetchInterval: 20_000,
    retry: false,
    staleTime: 15_000,
  })

  const statusLabel =
    isLoading ? 'PROBING' :
    data?.status === 'enhanced' ? 'ENHANCED' :
    data?.status === 'connected' ? 'ONLINE' :
    data?.status === 'partial' ? 'PARTIAL' :
    'OFFLINE'

  return (
    <div className="agent-status-strip" aria-hidden="true">
      <span
        className="flex items-center gap-1.5 shrink-0 select-none"
        style={{ color: '#38bdf8', fontWeight: 600, letterSpacing: '0.12em' }}
      >
        <span style={{ fontSize: 13, lineHeight: 1 }}>◈</span>
        <span style={{ fontSize: 9.5 }}>{formatProfileLabel(activeProfile)}</span>
      </span>

      <span className="flex-1" />

      <span className="flex items-center gap-1.5">
        <StatusPip status={data?.status} />
        <span style={{ color: data?.status === 'connected' || data?.status === 'enhanced' ? 'rgba(34,211,238,0.75)' : 'rgba(251,191,36,0.75)', fontSize: 9 }}>
          {statusLabel}
        </span>
      </span>
    </div>
  )
}
