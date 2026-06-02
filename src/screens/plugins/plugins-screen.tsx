import { useQuery } from '@tanstack/react-query'

// GAP-VER-001: a read-only admin view of the loaded Studio plugins, backed by
// the existing GET /api/plugins. Previously /plugins 404'd even though the API
// worked.

type PluginSummary = {
  id: string
  version?: string
  display_name?: string
  routes_count?: number
  slots_count?: number
  bundles_count?: number
  skill_dependencies?: Array<string>
  mcp_dependencies?: Array<string>
}

type PluginsResponse = {
  plugins: Array<PluginSummary>
  issues?: Array<{ plugin?: string; message?: string } | string>
  error?: string
}

async function fetchPlugins(): Promise<PluginsResponse> {
  const res = await fetch('/api/plugins')
  if (!res.ok) {
    throw new Error(`Failed to load plugins: ${res.status}`)
  }
  return (await res.json()) as PluginsResponse
}

export function PluginsScreen() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['plugins'],
    queryFn: fetchPlugins,
    refetchInterval: false,
  })

  const plugins = data?.plugins ?? []
  const issues = data?.issues ?? []

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-[var(--theme-border)] bg-[var(--theme-bg)] px-6 py-4">
        <h1 className="text-lg font-semibold text-[var(--theme-text)]">Plugins</h1>
        <p className="mt-0.5 text-xs text-[var(--theme-muted)]">
          Studio plugins loaded from <code>~/.hermes/studio-plugins/</code>.{' '}
          {plugins.length} loaded · {issues.length} issue
          {issues.length === 1 ? '' : 's'}.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="py-16 text-center text-sm text-[var(--theme-muted)]">
            Loading…
          </div>
        ) : isError ? (
          <div className="rounded border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-300">
            {(error as Error).message}
          </div>
        ) : plugins.length === 0 ? (
          <div className="py-16 text-center text-sm text-[var(--theme-muted)]">
            No plugins loaded.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {issues.length > 0 && (
              <div className="rounded border border-amber-400/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                <div className="mb-1 font-medium">Manifest issues</div>
                <ul className="list-disc pl-5">
                  {issues.map((i, idx) => (
                    <li key={idx}>
                      {typeof i === 'string'
                        ? i
                        : `${i.plugin ?? '?'}: ${i.message ?? 'invalid'}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {plugins.map((p) => (
              <div
                key={p.id}
                className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] p-4"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-semibold text-[var(--theme-text)]">
                    {p.display_name ?? p.id}
                  </div>
                  <div className="text-xs text-[var(--theme-muted)]">
                    <code>{p.id}</code>
                    {p.version ? ` · v${p.version}` : ''}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[var(--theme-muted)]">
                  <span className="rounded bg-[var(--theme-bg)] px-2 py-0.5 border border-[var(--theme-border)]">
                    {p.routes_count ?? 0} routes
                  </span>
                  <span className="rounded bg-[var(--theme-bg)] px-2 py-0.5 border border-[var(--theme-border)]">
                    {p.slots_count ?? 0} slots
                  </span>
                  <span className="rounded bg-[var(--theme-bg)] px-2 py-0.5 border border-[var(--theme-border)]">
                    {p.bundles_count ?? 0} bundles
                  </span>
                  {(p.skill_dependencies ?? []).map((s) => (
                    <span
                      key={`sk-${s}`}
                      className="rounded bg-[var(--theme-bg)] px-2 py-0.5 border border-[var(--theme-border)]"
                    >
                      skill: {s}
                    </span>
                  ))}
                  {(p.mcp_dependencies ?? []).map((m) => (
                    <span
                      key={`mcp-${m}`}
                      className="rounded bg-[var(--theme-bg)] px-2 py-0.5 border border-[var(--theme-border)]"
                    >
                      mcp: {m}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
