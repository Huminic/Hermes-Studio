import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ds/status-badge'
import type { AgentDefinition } from '@/types/agent'
import type { ProfileWidgetConfig, WidgetAgentEntry } from '@/types/widget'
import type { MigratedAgentRecord } from '@/types/agent-migration'

type ProfileSummary = { name: string; active?: boolean }

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const data = (await res.json()) as T & { ok?: boolean; error?: string }
  if (!res.ok || data.ok === false) throw new Error(data.error ?? 'Request failed')
  return data
}

export function WidgetsScreen() {
  const queryClient = useQueryClient()
  const [profile, setProfile] = useState('default')
  const origin = typeof window === 'undefined' ? '' : window.location.origin

  const profilesQuery = useQuery({
    queryKey: ['profiles-list'],
    queryFn: () => readJson<{ profiles: ProfileSummary[] }>('/api/profiles/list'),
  })

  const profiles = profilesQuery.data?.profiles ?? []
  const selectedProfile = useMemo(
    () => profiles.find((candidate) => candidate.name === profile)?.name ?? profile,
    [profile, profiles],
  )

  const widgetQuery = useQuery({
    queryKey: ['widget', selectedProfile],
    queryFn: () =>
      readJson<{ widget: ProfileWidgetConfig }>(
        `/api/widgets/${encodeURIComponent(selectedProfile)}`,
      ),
  })

  const agentsQuery = useQuery({
    queryKey: ['agents'],
    queryFn: () => readJson<{ agents: AgentDefinition[] }>('/api/agents'),
  })

  const migrationQuery = useQuery({
    queryKey: ['agent-migrations', selectedProfile],
    queryFn: () =>
      readJson<{ agents: MigratedAgentRecord[] }>(
        `/api/agent-migrations?profile=${encodeURIComponent(selectedProfile)}`,
      ),
  })

  const updateMutation = useMutation({
    mutationFn: (input: Partial<ProfileWidgetConfig>) =>
      readJson<{ widget: ProfileWidgetConfig }>(
        `/api/widgets/${encodeURIComponent(selectedProfile)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        },
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['widget', selectedProfile] }),
  })

  const seedMigrationMutation = useMutation({
    mutationFn: () =>
      readJson<{ agent: MigratedAgentRecord }>('/api/agent-migrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceApplication: 'existing-app',
          sourceAgentId: `${selectedProfile}-agent-tbd`,
          profile: selectedProfile,
          displayName: `${selectedProfile} Migrated Agent`,
          customerFacing: true,
          tools: ['vapi', 'tavus'],
          vapi: { assistantId: 'TBD_SERVER_SIDE' },
          tavus: { personaId: 'TBD_SERVER_SIDE', replicaId: 'TBD_SERVER_SIDE' },
          notes: 'Replace TBD values during migration inventory import.',
        }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-migrations'] }),
  })

  const widget = widgetQuery.data?.widget
  const agents = agentsQuery.data?.agents ?? []
  const migratedAgents = migrationQuery.data?.agents ?? []
  const embedSnippet = widget
    ? `<script async src="${origin}/hermes-widget.js" data-widget-key="${widget.widgetKey}"></script>`
    : ''

  function addAgent(agent: AgentDefinition) {
    if (!widget) return
    const entry: WidgetAgentEntry = {
      agentId: agent.id,
      label: agent.name,
      description: agent.roleLabel,
      customerFacing: true,
      channels: ['chat'],
    }
    updateMutation.mutate({
      agents: [
        ...widget.agents.filter((candidate) => candidate.agentId !== agent.id),
        entry,
      ],
    })
  }

  function removeAgent(agentId: string) {
    if (!widget) return
    updateMutation.mutate({
      agents: widget.agents.filter((candidate) => candidate.agentId !== agentId),
    })
  }

  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--theme-bg)' }}>
      <header
        className="flex items-center justify-between gap-3 border-b px-6 py-4"
        style={{ borderColor: 'var(--theme-border)' }}
      >
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--theme-text)' }}>
            Customer Widget
          </h1>
          <p className="text-sm" style={{ color: 'var(--theme-muted)' }}>
            Configure the hosted JavaScript launcher and track migrated Vapi/Tavus personas.
          </p>
        </div>
        <select
          className="rounded-md border px-3 py-2 text-sm"
          style={{
            background: 'var(--theme-surface)',
            borderColor: 'var(--theme-border)',
            color: 'var(--theme-text)',
          }}
          value={selectedProfile}
          onChange={(event) => setProfile(event.target.value)}
        >
          {profiles.map((candidate) => (
            <option key={candidate.name} value={candidate.name}>
              {candidate.name}
            </option>
          ))}
          {!profiles.length && <option value="default">default</option>}
        </select>
      </header>

      <main className="grid flex-1 gap-4 overflow-auto p-6 lg:grid-cols-[1.2fr_.8fr]">
        <section className="rounded-xl border p-5" style={{ borderColor: 'var(--theme-border)' }}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold" style={{ color: 'var(--theme-text)' }}>
                Widget Settings
              </h2>
              <p className="text-sm" style={{ color: 'var(--theme-muted)' }}>
                Enable only after domains and customer-facing agents are reviewed.
              </p>
            </div>
            {widget ? (
              <StatusBadge
                status={widget.enabled ? 'success' : 'idle'}
                label={widget.enabled ? 'enabled' : 'disabled'}
              />
            ) : (
              <StatusBadge status="running" label="loading" />
            )}
          </div>

          {widget && (
            <div className="mt-5 grid gap-4">
              <label className="grid gap-2 text-sm" style={{ color: 'var(--theme-text)' }}>
                Launcher label
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  style={{
                    background: 'var(--theme-surface)',
                    borderColor: 'var(--theme-border)',
                    color: 'var(--theme-text)',
                  }}
                  defaultValue={widget.launcherLabel}
                  onBlur={(event) =>
                    updateMutation.mutate({ launcherLabel: event.target.value })
                  }
                />
              </label>

              <label className="grid gap-2 text-sm" style={{ color: 'var(--theme-text)' }}>
                Allowed domains, comma separated
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  style={{
                    background: 'var(--theme-surface)',
                    borderColor: 'var(--theme-border)',
                    color: 'var(--theme-text)',
                  }}
                  defaultValue={widget.allowedDomains.join(', ')}
                  placeholder="example.com, www.example.com"
                  onBlur={(event) =>
                    updateMutation.mutate({
                      allowedDomains: event.target.value
                        .split(',')
                        .map((value) => value.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>

              <div className="rounded-md p-3 text-xs" style={{ background: 'var(--theme-surface)' }}>
                <code style={{ color: 'var(--theme-muted)' }}>{embedSnippet}</code>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => updateMutation.mutate({ enabled: !widget.enabled })}
                >
                  {widget.enabled ? 'Disable Widget' : 'Enable Widget'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(embedSnippet)}
                >
                  Copy Embed Snippet
                </Button>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-xl border p-5" style={{ borderColor: 'var(--theme-border)' }}>
          <h2 className="font-semibold" style={{ color: 'var(--theme-text)' }}>
            Enabled Agents
          </h2>
          <div className="mt-4 grid gap-2">
            {(widget?.agents ?? []).map((agent) => (
              <div
                key={agent.agentId}
                className="flex items-center justify-between rounded-lg border p-3"
                style={{ borderColor: 'var(--theme-border)' }}
              >
                <div>
                  <div className="font-medium" style={{ color: 'var(--theme-text)' }}>
                    {agent.label}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--theme-muted)' }}>
                    {agent.channels.join(', ')}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => removeAgent(agent.agentId)}>
                  Remove
                </Button>
              </div>
            ))}
            {widget?.agents.length === 0 && (
              <p className="text-sm" style={{ color: 'var(--theme-muted)' }}>
                No agents are exposed to the widget yet.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-xl border p-5" style={{ borderColor: 'var(--theme-border)' }}>
          <h2 className="font-semibold" style={{ color: 'var(--theme-text)' }}>
            Available Studio Agents
          </h2>
          <div className="mt-4 grid gap-2">
            {agents.slice(0, 12).map((agent) => (
              <button
                key={agent.id}
                className="rounded-lg border p-3 text-left"
                style={{
                  borderColor: 'var(--theme-border)',
                  color: 'var(--theme-text)',
                }}
                onClick={() => addAgent(agent)}
              >
                <div className="font-medium">{agent.name}</div>
                <div className="text-xs" style={{ color: 'var(--theme-muted)' }}>
                  {agent.roleLabel}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-xl border p-5" style={{ borderColor: 'var(--theme-border)' }}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold" style={{ color: 'var(--theme-text)' }}>
              Migration Inventory
            </h2>
            <Button size="sm" variant="outline" onClick={() => seedMigrationMutation.mutate()}>
              Seed Template
            </Button>
          </div>
          <div className="mt-4 grid gap-2">
            {migratedAgents.map((agent) => (
              <div
                key={agent.id}
                className="rounded-lg border p-3"
                style={{ borderColor: 'var(--theme-border)' }}
              >
                <div className="font-medium" style={{ color: 'var(--theme-text)' }}>
                  {agent.displayName}
                </div>
                <div className="text-xs" style={{ color: 'var(--theme-muted)' }}>
                  {agent.sourceApplication} / {agent.sourceAgentId} / {agent.status}
                </div>
              </div>
            ))}
            {migratedAgents.length === 0 && (
              <p className="text-sm" style={{ color: 'var(--theme-muted)' }}>
                No migrated agents inventoried yet.
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
