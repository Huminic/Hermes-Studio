/**
 * customer-console.tools-widget — Phase C.4.
 *
 * For each widget declared in studio.yaml:
 *  - shows status (ready / missing-file / misconfigured)
 *  - embed snippet (copy-to-clipboard)
 *  - live preview iframe (the /w/<slug> public route)
 *  - editor for the widget's wiki frontmatter + body, KSG-gated save
 *
 * Voice/video/form modes are surfaced with their current adapter status
 * (real provider when env credentials are present, "unconfigured" with
 * a clear operator-action note otherwise — AC.4.4).
 */

import { useCallback, useEffect, useState } from 'react'
import type { StudioConfig } from '../../lib/studio-config'

type WidgetRow = {
  slug: string
  mode: 'chat' | 'voice' | 'video' | 'form'
  agent: string
  status: 'ready' | 'missing-file' | 'misconfigured'
  filePath: string | null
  greeting: string | null
  title: string | null
  body: string | null
  embed_snippet: string
  preview_url: string
}

type ListResponse = {
  ok: boolean
  widgets: Array<WidgetRow>
  source: 'file' | 'default'
}

export function CustomerToolsWidgetRenderer(props: {
  profile: string
  config: StudioConfig
}) {
  const [widgets, setWidgets] = useState<Array<WidgetRow>>([])
  const [error, setError] = useState<string | null>(null)
  const [activeSlug, setActiveSlug] = useState<string | null>(null)
  const [draft, setDraft] = useState<string>('')
  const [feedback, setFeedback] = useState<{
    kind: 'ok' | 'err' | 'warn'
    message: string
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const accent = props.config.branding.accent_color ?? '#1e40af'
  const settings = props.config.tools_widget

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/customer/widgets?profile=${encodeURIComponent(props.profile)}`,
        { credentials: 'include' },
      )
      const j = (await res.json().catch(() => ({}))) as ListResponse
      if (!res.ok || !j.ok) {
        setError(`HTTP ${res.status}`)
        return
      }
      setWidgets(j.widgets)
      if (j.widgets.length > 0 && !activeSlug) {
        setActiveSlug(j.widgets[0].slug)
        setDraft(buildFromRow(j.widgets[0]))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'fetch failed')
    }
  }, [activeSlug, props.profile])

  useEffect(() => {
    void load()
  }, [load])

  const active = widgets.find((w) => w.slug === activeSlug) ?? null

  const save = useCallback(async () => {
    if (!active) return
    setBusy(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/customer/widgets/save', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: props.profile,
          slug: active.slug,
          content: draft,
        }),
      })
      const j = (await res.json().catch(() => ({}))) as {
        ok: boolean
        warnings?: Array<string>
        error?: string
        rule?: string
      }
      if (!res.ok || !j.ok) {
        setFeedback({
          kind: 'err',
          message: `KSG blocked: ${j.error ?? `HTTP ${res.status}`}${j.rule ? ` (${j.rule})` : ''}`,
        })
        return
      }
      setFeedback({
        kind: j.warnings && j.warnings.length ? 'warn' : 'ok',
        message:
          j.warnings && j.warnings.length
            ? `Saved with warnings: ${j.warnings.join('; ')}`
            : 'Saved.',
      })
      await load()
    } catch (err) {
      setFeedback({
        kind: 'err',
        message: err instanceof Error ? err.message : 'save failed',
      })
    } finally {
      setBusy(false)
    }
  }, [active, draft, load, props.profile])

  if (error) {
    return (
      <div className="rounded border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-300">
        {error}
      </div>
    )
  }

  if (widgets.length === 0) {
    return (
      <div className="rounded border border-amber-400/30 bg-amber-400/10 p-4 text-sm">
        No widgets declared in this profile's studio.yaml.
        <div className="mt-2 text-xs opacity-70">
          Operator: edit{' '}
          <code>~/.hermes/profiles/{props.profile}/studio.yaml</code> to add a
          widget under the <code>widgets:</code> key.
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {widgets.map((w) => (
          <button
            key={w.slug}
            type="button"
            onClick={() => {
              setActiveSlug(w.slug)
              setDraft(buildFromRow(w))
              setFeedback(null)
            }}
            className={
              'rounded border px-3 py-1.5 text-xs ' +
              (w.slug === activeSlug
                ? 'font-semibold'
                : 'border-white/10 opacity-70 hover:opacity-100')
            }
            style={
              w.slug === activeSlug
                ? { borderColor: accent, background: `${accent}33` }
                : undefined
            }
          >
            <div className="text-sm">{w.slug}</div>
            <div className="text-[10px] opacity-70">
              {w.mode} · {w.agent}
              {w.status !== 'ready' && (
                <span className="ml-1 text-amber-300">· {w.status}</span>
              )}
            </div>
          </button>
        ))}
      </div>

      {active && (
        <div className="grid gap-3 lg:grid-cols-[1fr_400px]">
          <section className="flex flex-col gap-2">
            {settings.show_embed_snippet && (
              <div className="rounded border border-white/10 bg-white/5 p-3">
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium opacity-70">Embed snippet</span>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(active.embed_snippet)
                      setFeedback({ kind: 'ok', message: 'Copied embed snippet to clipboard.' })
                    }}
                    className="text-[10px] underline opacity-70 hover:opacity-100"
                  >
                    Copy
                  </button>
                </div>
                <pre className="overflow-x-auto rounded bg-black/30 p-2 text-[10px]">
                  {active.embed_snippet}
                </pre>
              </div>
            )}

            <div className="rounded border border-white/10 bg-white/5 p-3">
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium opacity-70">
                  Widget content (markdown + frontmatter)
                </span>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={busy}
                  className="rounded px-2 py-0.5 text-xs font-medium disabled:opacity-40"
                  style={{ background: accent, color: '#fff' }}
                >
                  {busy ? '…' : 'Save'}
                </button>
              </div>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={14}
                className="w-full resize-y rounded border border-white/10 bg-black/30 px-2 py-2 text-xs font-mono"
                spellCheck={false}
              />
              {feedback && (
                <div
                  className={
                    'mt-2 rounded border p-2 text-xs ' +
                    (feedback.kind === 'ok'
                      ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                      : feedback.kind === 'warn'
                        ? 'border-amber-400/30 bg-amber-400/10 text-amber-200'
                        : 'border-red-400/30 bg-red-500/10 text-red-200')
                  }
                >
                  {feedback.message}
                </div>
              )}
            </div>

            <div className="text-[10px] opacity-60">
              File: {active.filePath ?? '(missing — first save creates it)'}
            </div>

            <ChannelModeNote mode={active.mode} />
          </section>

          {settings.show_live_demo && active.status === 'ready' && (
            <aside className="rounded border border-white/10 bg-black/10 p-2">
              <div className="mb-1 text-xs font-medium opacity-70">
                Live preview ({active.mode})
              </div>
              <iframe
                title={`preview ${active.slug}`}
                src={active.preview_url}
                className="h-[480px] w-full rounded border border-white/10 bg-white"
                sandbox="allow-scripts allow-same-origin allow-forms"
              />
              <div className="mt-1 break-all text-[10px] opacity-50">
                {active.preview_url}
              </div>
            </aside>
          )}
        </div>
      )}
    </div>
  )
}

function buildFromRow(row: WidgetRow): string {
  if (row.body || row.greeting || row.title) {
    // Reconstruct a minimal frontmatter+body for the editor.
    const fmLines: Array<string> = []
    fmLines.push('---')
    fmLines.push(`slug: ${row.slug}`)
    fmLines.push(`mode: ${row.mode}`)
    fmLines.push(`agent: ${row.agent}`)
    if (row.title) fmLines.push(`title: ${row.title}`)
    if (row.greeting) fmLines.push(`greeting: ${row.greeting}`)
    fmLines.push('type: widget')
    fmLines.push('status: draft')
    fmLines.push('---')
    return fmLines.join('\n') + '\n' + (row.body ?? '')
  }
  return [
    '---',
    `slug: ${row.slug}`,
    `mode: ${row.mode}`,
    `agent: ${row.agent}`,
    `title: ${row.slug}`,
    `greeting: Welcome to ${row.slug}`,
    'type: widget',
    'status: draft',
    '---',
    '',
    `# ${row.slug}`,
    '',
    `Edit this widget content. The public ${row.preview_url} page renders the body below the greeting.`,
    '',
  ].join('\n')
}

function ChannelModeNote({
  mode,
}: {
  mode: 'chat' | 'voice' | 'video' | 'form'
}) {
  const labels: Record<
    typeof mode,
    { label: string; note: string }
  > = {
    chat: {
      label: 'Chat (production)',
      note: 'Routes via /api/public/widget-chat through Hermes or the openai-direct fallback.',
    },
    voice: {
      label: 'Voice (Vapi)',
      note: 'Requires VAPI_API_KEY in the profile .env. The adapter scaffold ships in C.6 and shows "unconfigured" until credentials land.',
    },
    video: {
      label: 'Video (Tavus AI avatar)',
      note: 'Requires TAVUS_API_KEY + TAVUS_PERSONA_ID. Same scaffold pattern.',
    },
    form: {
      label: 'Form (inbound → Comms)',
      note: 'Posts to /api/messaging/threads as channel: form, domain: sales. No external creds required.',
    },
  }
  const meta = labels[mode]
  return (
    <div className="rounded border border-white/10 bg-white/5 p-2 text-xs">
      <div className="font-medium opacity-70">{meta.label}</div>
      <div className="opacity-60">{meta.note}</div>
    </div>
  )
}
