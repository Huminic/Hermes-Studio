import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ds/status-badge'
import type { PublicArtifact } from '@/types/artifact'

type ProfileSummary = {
  name: string
  active?: boolean
}

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const data = (await res.json()) as T & { ok?: boolean; error?: string }
  if (!res.ok || data.ok === false) throw new Error(data.error ?? 'Request failed')
  return data
}

export function ArtifactsScreen() {
  const queryClient = useQueryClient()
  const [profile, setProfile] = useState('default')
  const [recipient, setRecipient] = useState('')
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

  const artifactsQuery = useQuery({
    queryKey: ['artifacts', selectedProfile],
    queryFn: () =>
      readJson<{ artifacts: PublicArtifact[] }>(
        `/api/artifacts?profile=${encodeURIComponent(selectedProfile)}`,
      ),
  })

  const createMutation = useMutation({
    mutationFn: () =>
      readJson<{ artifact: PublicArtifact }>('/api/artifacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: selectedProfile,
          title: `${selectedProfile} Shareable Report`,
          description:
            'Starter public artifact created from Huminic Studio. Replace with an agent-generated report output before sending to customers.',
          type: 'report',
          sourceRefs: [`profile:${selectedProfile}`],
          redactionNotes: ['Review customer-sensitive fields before publishing.'],
        }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['artifacts'] }),
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      readJson<{ artifact: PublicArtifact }>(`/api/artifacts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, actor: 'studio-user' }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['artifacts'] }),
  })

  const sendMutation = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      readJson<{ link: string }>(`/api/artifacts/${id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: [recipient],
          subject: 'Huminic Studio artifact',
          message: 'A Huminic Studio artifact is ready for review.',
        }),
      }),
  })

  const artifacts = artifactsQuery.data?.artifacts ?? []

  return (
    <div className="flex h-full flex-col" style={{ background: 'var(--theme-bg)' }}>
      <header
        className="flex items-center justify-between gap-3 border-b px-6 py-4"
        style={{ borderColor: 'var(--theme-border)' }}
      >
        <div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--theme-text)' }}>
            Public Artifacts
          </h1>
          <p className="text-sm" style={{ color: 'var(--theme-muted)' }}>
            Publish read-only reports, downloads, landing pages, and live documents.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          <Button size="sm" onClick={() => createMutation.mutate()}>
            Create Starter Artifact
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6">
        <div className="mb-4 rounded-lg border p-4" style={{ borderColor: 'var(--theme-border)' }}>
          <label className="text-sm font-medium" style={{ color: 'var(--theme-text)' }}>
            Resend recipient
          </label>
          <div className="mt-2 flex gap-2">
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              style={{
                background: 'var(--theme-surface)',
                borderColor: 'var(--theme-border)',
                color: 'var(--theme-text)',
              }}
              placeholder="name@example.com"
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
            />
          </div>
          {sendMutation.error && (
            <p className="mt-2 text-sm" style={{ color: 'var(--theme-danger)' }}>
              {(sendMutation.error as Error).message}
            </p>
          )}
        </div>

        {artifactsQuery.isLoading ? (
          <StatusBadge status="running" label="Loading artifacts..." />
        ) : artifacts.length === 0 ? (
          <div className="rounded-lg border p-6" style={{ borderColor: 'var(--theme-border)' }}>
            <p style={{ color: 'var(--theme-muted)' }}>
              No artifacts yet. Create a starter artifact to verify the publish and sharing flow.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {artifacts.map((artifact) => {
              const publicLink = `${origin}/api/public/artifacts/${artifact.publicId}`
              return (
                <article
                  key={artifact.id}
                  className="rounded-xl border p-5"
                  style={{ borderColor: 'var(--theme-border)' }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="font-semibold" style={{ color: 'var(--theme-text)' }}>
                        {artifact.title}
                      </h2>
                      <p className="mt-1 text-sm" style={{ color: 'var(--theme-muted)' }}>
                        {artifact.description || artifact.type}
                      </p>
                    </div>
                    <StatusBadge
                      status={artifact.status === 'published' ? 'success' : 'idle'}
                      label={artifact.status}
                    />
                  </div>
                  <div className="mt-4 rounded-md p-3 text-xs" style={{ background: 'var(--theme-surface)' }}>
                    <code style={{ color: 'var(--theme-muted)' }}>{publicLink}</code>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        statusMutation.mutate({
                          id: artifact.id,
                          status:
                            artifact.status === 'published' ? 'unpublished' : 'published',
                        })
                      }
                    >
                      {artifact.status === 'published' ? 'Unpublish' : 'Publish'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigator.clipboard.writeText(publicLink)}
                    >
                      Copy Link
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!recipient || artifact.status !== 'published'}
                      onClick={() => sendMutation.mutate({ id: artifact.id })}
                    >
                      Send Link
                    </Button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
