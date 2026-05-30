/**
 * Settings → MCP Tokens — Studio admin UI for the wiki-MCP bearer token
 * registry. Tokens are generated here, the raw secret is shown ONCE,
 * and revocation is one click.
 *
 * Backed by /api/mcp-tokens. Admin-only (Studio admin session).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { writeTextToClipboard } from '@/lib/clipboard'
import { toast } from '@/components/ui/toast'

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
}

type ListResponse = { ok: boolean; tokens: Array<TokenSummary>; error?: string }
type IssueResponse = {
  ok: boolean
  token?: TokenSummary
  secret?: string
  error?: string
}

const KNOWN_TOOLS = [
  'wiki_list',
  'wiki_read',
  'wiki_search',
  'wiki_propose',
  'mcp__create_profile',
  'mcp__issue_token',
  'mcp__revoke_token',
  'mcp__list_tokens',
]

export function McpTokensScreen() {
  const [tokens, setTokens] = useState<Array<TokenSummary>>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [revealed, setRevealed] = useState<{
    label: string
    secret: string
  } | null>(null)

  const [draft, setDraft] = useState({
    label: '',
    profiles: '',
    tools: '*',
    expires_at: '',
    admin: false,
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/mcp-tokens', { credentials: 'include' })
      const j = (await res.json().catch(() => ({}))) as ListResponse
      if (!res.ok || !j.ok) {
        setError(j.error ?? `HTTP ${res.status}`)
        return
      }
      setTokens(j.tokens)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'load failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const issue = useCallback(async () => {
    setCreating(true)
    setError(null)
    try {
      const profiles = draft.profiles
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const tools = draft.tools
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (profiles.length === 0) {
        setError('At least one profile required (use * for all).')
        return
      }
      if (tools.length === 0) {
        setError('At least one tool required (use * for all).')
        return
      }
      const res = await fetch('/api/mcp-tokens', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: draft.label,
          allowed_profiles: profiles,
          allowed_tools: tools,
          expires_at: draft.expires_at || null,
          admin: draft.admin,
        }),
      })
      const j = (await res.json().catch(() => ({}))) as IssueResponse
      if (!res.ok || !j.ok || !j.secret) {
        setError(j.error ?? `HTTP ${res.status}`)
        return
      }
      setRevealed({ label: j.token!.label, secret: j.secret })
      setDraft({
        label: '',
        profiles: '',
        tools: '*',
        expires_at: '',
        admin: false,
      })
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'create failed')
    } finally {
      setCreating(false)
    }
  }, [draft, load])

  const revoke = useCallback(
    async (label: string) => {
      if (!confirm(`Revoke token "${label}"? This is immediate.`)) return
      try {
        const res = await fetch(
          `/api/mcp-tokens?label=${encodeURIComponent(label)}`,
          { method: 'DELETE', credentials: 'include' },
        )
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string }
          setError(j.error ?? `HTTP ${res.status}`)
          return
        }
        await load()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'revoke failed')
      }
    },
    [load],
  )

  const grouped = useMemo(() => {
    const admins = tokens.filter((t) => t.admin)
    const regular = tokens.filter((t) => !t.admin)
    return { admins, regular }
  }, [tokens])

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">MCP Tokens</h1>
          <p className="text-xs opacity-70">
            Bearer tokens for the wiki MCP server. Admin-flagged tokens can
            create profiles and issue more tokens (consultative-agent uses
            this).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded border border-white/10 px-3 py-1.5 text-sm hover:border-white/30"
        >
          {showForm ? 'Cancel' : '+ New token'}
        </button>
      </header>

      {error && (
        <div className="rounded border border-red-400/30 bg-red-500/10 p-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {revealed && (
        <div className="rounded border border-emerald-400/30 bg-emerald-500/10 p-3">
          <div className="text-xs font-medium opacity-80">
            Token "{revealed.label}" issued. Copy the secret now — it will not
            be shown again.
          </div>
          <pre className="mt-1 overflow-x-auto rounded bg-black/30 p-2 text-[11px]">
            {revealed.secret}
          </pre>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={() => {
                void writeTextToClipboard(revealed.secret)
                toast({ title: 'Copied secret to clipboard.' })
              }}
              className="rounded border border-white/10 px-2 py-0.5 text-xs hover:border-white/30"
            >
              Copy
            </button>
            <button
              type="button"
              onClick={() => setRevealed(null)}
              className="rounded border border-white/10 px-2 py-0.5 text-xs hover:border-white/30"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {showForm && (
        <div className="rounded border border-white/10 bg-white/5 p-3">
          <div className="mb-2 text-xs font-medium opacity-80">Issue new token</div>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="opacity-60">Label (no spaces)</span>
              <input
                value={draft.label}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, label: e.target.value }))
                }
                placeholder="e.g. caroline-runtime"
                className="rounded border border-white/10 bg-black/30 px-2 py-1 text-xs"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="opacity-60">
                Allowed profiles (comma-separated; * for all)
              </span>
              <input
                value={draft.profiles}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, profiles: e.target.value }))
                }
                placeholder="serra-honda,serra-service"
                className="rounded border border-white/10 bg-black/30 px-2 py-1 text-xs"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="opacity-60">
                Allowed tools (comma-separated; * for all)
              </span>
              <input
                value={draft.tools}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, tools: e.target.value }))
                }
                placeholder={KNOWN_TOOLS.join(',')}
                className="rounded border border-white/10 bg-black/30 px-2 py-1 text-xs"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="opacity-60">Expires (ISO date, optional)</span>
              <input
                value={draft.expires_at}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, expires_at: e.target.value }))
                }
                placeholder="2027-01-01T00:00:00Z"
                className="rounded border border-white/10 bg-black/30 px-2 py-1 text-xs"
              />
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={draft.admin}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, admin: e.target.checked }))
                }
              />
              <span>
                Admin token (can call mcp__create_profile / issue_token /
                revoke_token)
              </span>
            </label>
          </div>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => void issue()}
              disabled={creating || !draft.label}
              className="rounded bg-emerald-500/30 px-3 py-1 text-xs font-medium disabled:opacity-40"
            >
              {creating ? 'Issuing…' : 'Issue token'}
            </button>
          </div>
        </div>
      )}

      <section>
        <h2 className="mb-1 text-xs font-medium uppercase opacity-60">
          Admin tokens
        </h2>
        <TokenTable
          rows={grouped.admins}
          onRevoke={revoke}
          loading={loading}
          empty="No admin tokens issued."
        />
      </section>
      <section>
        <h2 className="mb-1 text-xs font-medium uppercase opacity-60">
          Standard tokens
        </h2>
        <TokenTable
          rows={grouped.regular}
          onRevoke={revoke}
          loading={loading}
          empty="No standard tokens issued."
        />
      </section>
    </div>
  )
}

function TokenTable({
  rows,
  onRevoke,
  loading,
  empty,
}: {
  rows: Array<TokenSummary>
  onRevoke: (label: string) => void
  loading: boolean
  empty: string
}) {
  if (loading) {
    return <div className="text-xs opacity-50">Loading…</div>
  }
  if (rows.length === 0) {
    return (
      <div className="rounded border border-white/10 bg-white/5 p-2 text-xs opacity-60">
        {empty}
      </div>
    )
  }
  return (
    <div className="overflow-x-auto rounded border border-white/10">
      <table className="w-full text-xs">
        <thead className="border-b border-white/10 bg-white/5 text-left">
          <tr>
            <th className="px-2 py-1">Label</th>
            <th className="px-2 py-1">Profiles</th>
            <th className="px-2 py-1">Tools</th>
            <th className="px-2 py-1">Expires</th>
            <th className="px-2 py-1">Last used</th>
            <th className="px-2 py-1">Created by</th>
            <th className="px-2 py-1" />
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.label} className="border-b border-white/5">
              <td className="px-2 py-1 font-medium">
                {t.label}{' '}
                <span className="opacity-50">[{t.fingerprint}...]</span>
              </td>
              <td className="px-2 py-1">{t.allowed_profiles.join(', ')}</td>
              <td className="px-2 py-1">
                {t.allowed_tools.length > 3
                  ? `${t.allowed_tools.length} tools`
                  : t.allowed_tools.join(', ')}
              </td>
              <td className="px-2 py-1">{t.expires_at ?? 'never'}</td>
              <td className="px-2 py-1">
                {t.last_used_at
                  ? new Date(t.last_used_at).toLocaleString()
                  : '—'}
              </td>
              <td className="px-2 py-1 opacity-60">{t.created_by}</td>
              <td className="px-2 py-1">
                <button
                  type="button"
                  onClick={() => onRevoke(t.label)}
                  className="rounded border border-red-400/30 px-2 py-0.5 text-[10px] text-red-200 hover:bg-red-500/20"
                >
                  Revoke
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
