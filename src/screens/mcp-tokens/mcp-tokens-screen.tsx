import { useQuery } from '@tanstack/react-query'

// GAP-VER-001: a read-only admin view of the MCP token registry, backed by the
// existing GET /api/mcp-tokens (admin-gated; no secrets returned). Previously
// /mcp-tokens 404'd even though the API worked. Issue/revoke remain CLI/API
// operations for now; this screen surfaces the registry so the operator can
// see what exists without shelling into the container.

type TokenSummary = {
  label: string
  fingerprint: string
  allowed_profiles: Array<string>
  allowed_tools: Array<string>
  expires_at: string | null
  admin: boolean
  created_at: string
  created_by: string
  last_used_at: string | null
  revoked_at?: string | null
}

type TokensResponse = {
  ok?: boolean
  tokens?: Array<TokenSummary>
  error?: string
}

async function fetchTokens(): Promise<TokensResponse> {
  const res = await fetch('/api/mcp-tokens')
  if (res.status === 403) {
    throw new Error('Studio admin required to view MCP tokens.')
  }
  if (!res.ok) {
    throw new Error(`Failed to load MCP tokens: ${res.status}`)
  }
  return (await res.json()) as TokensResponse
}

export function McpTokensScreen() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['mcp-tokens'],
    queryFn: fetchTokens,
    refetchInterval: false,
  })

  const tokens = data?.tokens ?? []

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-[var(--theme-border)] bg-[var(--theme-bg)] px-6 py-4">
        <h1 className="text-lg font-semibold text-[var(--theme-text)]">
          MCP Tokens
        </h1>
        <p className="mt-0.5 text-xs text-[var(--theme-muted)]">
          Bearer tokens in <code>~/.hermes/mcp-tokens.yaml</code>. Secrets are
          never shown. Issue/revoke via the API or{' '}
          <code>npx tsx scripts/...</code>. {tokens.length} token
          {tokens.length === 1 ? '' : 's'}.
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
        ) : tokens.length === 0 ? (
          <div className="py-16 text-center text-sm text-[var(--theme-muted)]">
            No MCP tokens issued.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[var(--theme-border)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--theme-bg)] text-xs uppercase text-[var(--theme-muted)]">
                <tr>
                  <th className="px-3 py-2">Label</th>
                  <th className="px-3 py-2">Fingerprint</th>
                  <th className="px-3 py-2">Profiles</th>
                  <th className="px-3 py-2">Tools</th>
                  <th className="px-3 py-2">Admin</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2">Expires</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((t) => (
                  <tr
                    key={t.label}
                    className="border-t border-[var(--theme-border)] text-[var(--theme-text)]"
                  >
                    <td className="px-3 py-2 font-medium">{t.label}</td>
                    <td className="px-3 py-2">
                      <code className="text-xs">{t.fingerprint}…</code>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {t.allowed_profiles.join(', ') || '—'}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {t.allowed_tools.join(', ') || '—'}
                    </td>
                    <td className="px-3 py-2">{t.admin ? 'yes' : 'no'}</td>
                    <td className="px-3 py-2 text-xs">
                      {t.created_at}
                      {t.created_by ? ` · ${t.created_by}` : ''}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {t.expires_at ?? 'never'}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {t.revoked_at ? (
                        <span className="text-red-300">revoked</span>
                      ) : (
                        <span className="text-emerald-300">active</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
