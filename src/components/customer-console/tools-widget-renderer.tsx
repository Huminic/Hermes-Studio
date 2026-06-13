/**
 * customer-console.tools-widget — Phase C.4.
 *
 * Customer-facing Widgets panel. For each widget declared for the profile it
 * shows a friendly title, a plain-language description of what it does, the
 * single-ID embed snippet (copy button), and a live demo (link + preview
 * iframe of the public /w/<slug> page). A content editor (frontmatter + body,
 * KSG-gated save) is available below.
 *
 * Customer-safe by contract: this view never surfaces studio.yaml paths,
 * "Operator:" notes, env-var names, or backend status strings. Modes that are
 * not yet fully wired (voice/video/form) are shown honestly as "coming soon"
 * rather than a broken demo.
 */

import { useCallback, useEffect, useState } from 'react'
import type { StudioConfig } from '../../lib/studio-config'

type WidgetMode = 'chat' | 'voice' | 'video' | 'form'

type WidgetRow = {
  slug: string
  mode: WidgetMode
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

// Chat and form are production-ready and render live demos. Voice and video
// modes remain honest "coming soon" stubs until their adapters ship. This drives
// both the live-demo gating and the per-widget status pill so the customer is
// never shown a broken demo.
const LIVE_MODES: ReadonlySet<WidgetMode> = new Set<WidgetMode>(['chat', 'form'])
const UNIFIED_WIDGET_SLUG = '__unified_widget__'

const MODE_LABEL: Record<WidgetMode, string> = {
  chat: 'Live chat',
  voice: 'Voice call',
  video: 'Video assistant',
  form: 'Contact form',
}

const MODE_BLURB: Record<WidgetMode, string> = {
  chat: 'A chat bubble your visitors can open to talk with your AI assistant in real time.',
  voice: 'A click-to-call voice assistant your visitors can speak with from their browser.',
  video: 'A live AI video assistant that greets and helps visitors face-to-face.',
  form: 'A lead-capture form that drops new contacts straight into your inbox.',
}

function widgetTitle(w: WidgetRow): string {
  return w.title?.trim() || prettifySlug(w.slug)
}

function prettifySlug(slug: string): string {
  return slug
    .split('-')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ')
}

export function CustomerToolsWidgetRenderer(props: {
  profile: string
  config: StudioConfig
}) {
  const [widgets, setWidgets] = useState<Array<WidgetRow>>([])
  const [loadFailed, setLoadFailed] = useState(false)
  const [activeSlug, setActiveSlug] = useState<string>(UNIFIED_WIDGET_SLUG)
  const [draft, setDraft] = useState<string>('')
  const [feedback, setFeedback] = useState<{
    kind: 'ok' | 'err' | 'warn'
    message: string
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const settings = props.config.tools_widget

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/customer/widgets?profile=${encodeURIComponent(props.profile)}`,
        { credentials: 'include' },
      )
      const j = (await res.json().catch(() => ({}))) as ListResponse
      if (!res.ok || !j.ok) {
        setLoadFailed(true)
        return
      }
      setLoadFailed(false)
      setWidgets(j.widgets)
      if (
        activeSlug !== UNIFIED_WIDGET_SLUG &&
        j.widgets.length > 0 &&
        !j.widgets.some((w) => w.slug === activeSlug)
      ) {
        setActiveSlug(j.widgets[0].slug)
        setDraft(buildFromRow(j.widgets[0]))
      }
    } catch {
      setLoadFailed(true)
    }
  }, [activeSlug, props.profile])

  useEffect(() => {
    void load()
  }, [load])

  const isUnifiedActive = activeSlug === UNIFIED_WIDGET_SLUG
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
          message: j.error
            ? `Could not save: ${j.error}`
            : 'Could not save those changes. Please review and try again.',
        })
        return
      }
      setFeedback({
        kind: j.warnings && j.warnings.length ? 'warn' : 'ok',
        message:
          j.warnings && j.warnings.length
            ? `Saved with notes: ${j.warnings.join('; ')}`
            : 'Saved.',
      })
      await load()
    } catch {
      setFeedback({
        kind: 'err',
        message: 'Could not save right now. Please try again in a moment.',
      })
    } finally {
      setBusy(false)
    }
  }, [active, draft, load, props.profile])

  if (loadFailed) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        We couldn&apos;t load your widgets right now. Please refresh the page, or
        contact your Huminic team if this keeps happening.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setActiveSlug(UNIFIED_WIDGET_SLUG)
            setFeedback(null)
            setCopied(false)
          }}
          className={
            'rounded-lg border px-3 py-2 text-left transition ' +
            (isUnifiedActive
              ? 'border-[#8b5cf6] bg-[#8b5cf6]/10'
              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50')
          }
        >
          <div className="text-sm font-semibold text-slate-900">
            Unified Widget
          </div>
          <div className="text-xs text-slate-500">All-in-one launcher</div>
        </button>
        {widgets.map((w) => {
          const isActive = w.slug === activeSlug
          return (
            <button
              key={w.slug}
              type="button"
              onClick={() => {
                setActiveSlug(w.slug)
                setDraft(buildFromRow(w))
                setFeedback(null)
                setCopied(false)
              }}
              className={
                'rounded-lg border px-3 py-2 text-left transition ' +
                (isActive
                  ? 'border-[#8b5cf6] bg-[#8b5cf6]/10'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50')
              }
            >
              <div className="text-sm font-semibold text-slate-900">
                {widgetTitle(w)}
              </div>
              <div className="text-xs text-slate-500">{MODE_LABEL[w.mode]}</div>
            </button>
          )
        })}
      </div>

      {isUnifiedActive && (
        <UnifiedWidgetPanel
          profile={props.profile}
          settings={settings}
          copied={copied}
          setCopied={setCopied}
        />
      )}

      {!isUnifiedActive && !active && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center">
          <div className="text-sm font-medium text-slate-900">
            No widgets are set up yet.
          </div>
          <div className="mt-1 text-sm text-slate-600">
            Your Huminic team can add chat, voice, video, and contact-form
            widgets for your website.
          </div>
        </div>
      )}

      {!isUnifiedActive && active && (
        <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
          <section className="flex flex-col gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-slate-900">
                  {widgetTitle(active)}
                </h3>
                <ModeBadge mode={active.mode} />
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {MODE_BLURB[active.mode]}
              </p>
              {active.body && active.body.trim() && (
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-500">
                  {stripHeading(active.body).trim()}
                </p>
              )}
            </div>

            {settings.show_embed_snippet && (
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-900">
                    Add to your website
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(active.embed_snippet)
                      setCopied(true)
                      window.setTimeout(() => setCopied(false), 2000)
                    }}
                    className="rounded-md bg-[#3b82f6] px-3 py-1 text-xs font-medium text-white hover:bg-[#2563eb]"
                  >
                    {copied ? 'Copied' : 'Copy code'}
                  </button>
                </div>
                <p className="mb-2 text-xs text-slate-500">
                  Paste this one line into your website where you want the widget
                  to appear.
                </p>
                <pre className="overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
                  {active.embed_snippet}
                </pre>
              </div>
            )}

            {settings.show_live_demo && (
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-900">
                    Live demo
                  </span>
                  {LIVE_MODES.has(active.mode) && (
                    <a
                      href={active.preview_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-[#3b82f6] hover:underline"
                    >
                      Open in new tab
                    </a>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {LIVE_MODES.has(active.mode)
                    ? 'This is exactly what your visitors will see.'
                    : `${MODE_LABEL[active.mode]} widgets are coming soon. You can add the code now — it will go live automatically once this widget type is ready.`}
                </p>
              </div>
            )}

            <details className="rounded-lg border border-slate-200 bg-white">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-700">
                Customize wording (advanced)
              </summary>
              <div className="border-t border-slate-200 p-4">
                <p className="mb-2 text-xs text-slate-500">
                  Edit the greeting and description shown in this widget. Changes
                  are reviewed before they go live.
                </p>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={12}
                  className="w-full resize-y rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800 focus:border-[#3b82f6] focus:outline-none"
                  spellCheck={false}
                />
                <div className="mt-2 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={busy}
                    className="rounded-md bg-[#3b82f6] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#2563eb] disabled:opacity-50"
                  >
                    {busy ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
                {feedback && (
                  <div
                    className={
                      'mt-3 rounded-md border p-2 text-xs ' +
                      (feedback.kind === 'ok'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : feedback.kind === 'warn'
                          ? 'border-amber-200 bg-amber-50 text-amber-700'
                          : 'border-red-200 bg-red-50 text-red-700')
                    }
                  >
                    {feedback.message}
                  </div>
                )}
              </div>
            </details>
          </section>

          {settings.show_live_demo && (
            <aside className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 text-sm font-medium text-slate-900">
                Preview
              </div>
              {LIVE_MODES.has(active.mode) && active.status === 'ready' ? (
                <>
                  <iframe
                    title={`Preview of ${widgetTitle(active)}`}
                    src={active.preview_url}
                    className="h-[480px] w-full rounded-md border border-slate-200 bg-white"
                    sandbox="allow-scripts allow-same-origin allow-forms"
                  />
                </>
              ) : (
                <div className="flex h-[480px] flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-white p-6 text-center">
                  <div className="text-sm font-medium text-slate-900">
                    {MODE_LABEL[active.mode]} preview coming soon
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {LIVE_MODES.has(active.mode)
                      ? 'This widget is being set up. Your Huminic team can help finish it.'
                      : 'This widget type is being finished. The embed code already works and the demo will appear here once it is live.'}
                  </p>
                </div>
              )}
            </aside>
          )}
        </div>
      )}
    </div>
  )
}

function UnifiedWidgetPanel(props: {
  profile: string
  settings: StudioConfig['tools_widget']
  copied: boolean
  setCopied: (value: boolean) => void
}) {
  const origin = getPublicOrigin()
  const embedSnippet = `<script async src="${origin}/widget/dealer/${props.profile}.js"></script>`
  const publicPreviewUrl = `${origin}/p/${encodeURIComponent(props.profile)}`

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
      <section className="flex flex-col gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-slate-900">
              Unified Widget
            </h3>
            <span className="rounded-full bg-[#3b82f6]/10 px-2 py-0.5 text-[10px] font-medium text-[#2563eb]">
              Live
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            One launcher lets visitors choose Web Chat, Instant Call Back,
            Contact Form, or Two-Way Video from the same website button.
          </p>
        </div>

        {props.settings.show_embed_snippet && (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-900">
                Add to your website
              </span>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(embedSnippet)
                  props.setCopied(true)
                  window.setTimeout(() => props.setCopied(false), 2000)
                }}
                className="rounded-md bg-[#3b82f6] px-3 py-1 text-xs font-medium text-white hover:bg-[#2563eb]"
              >
                {props.copied ? 'Copied' : 'Copy code'}
              </button>
            </div>
            <p className="mb-2 text-xs text-slate-500">
              Paste this one line into your website where you want the launcher
              to appear.
            </p>
            <pre className="overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800">
              {embedSnippet}
            </pre>
          </div>
        )}

        {props.settings.show_live_demo && (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-900">
                Live demo
              </span>
              <a
                href={publicPreviewUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-[#3b82f6] hover:underline"
              >
                Open in new tab
              </a>
            </div>
            <p className="text-xs text-slate-500">
              This uses the same unified launcher your website visitors will
              see.
            </p>
          </div>
        )}
      </section>

      {props.settings.show_live_demo && (
        <aside className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 text-sm font-medium text-slate-900">Preview</div>
          <iframe
            title="Preview of Unified Widget"
            srcDoc={buildUnifiedPreviewHtml(origin, props.profile)}
            className="h-[480px] w-full rounded-md border border-slate-200 bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms"
          />
        </aside>
      )}
    </div>
  )
}

function ModeBadge({ mode }: { mode: WidgetMode }) {
  const live = LIVE_MODES.has(mode)
  return (
    <span
      className={
        'rounded-full px-2 py-0.5 text-[10px] font-medium ' +
        (live
          ? 'bg-[#3b82f6]/10 text-[#2563eb]'
          : 'bg-slate-100 text-slate-500')
      }
    >
      {live ? 'Live' : 'Coming soon'}
    </span>
  )
}

function getPublicOrigin(): string {
  if (typeof window === 'undefined' || !window.location?.origin) {
    return 'https://studio.huminic.app'
  }
  return window.location.origin
}

function buildUnifiedPreviewHtml(origin: string, profile: string): string {
  const widgetSrc = `${origin}/widget/dealer/${profile}.js`
  const title = prettifySlug(profile)
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #0f172a;
      background: #f8fafc;
    }
    body {
      margin: 0;
      min-height: 100vh;
      background: #f8fafc;
    }
    main {
      box-sizing: border-box;
      min-height: 100vh;
      padding: 28px;
    }
    .preview-page {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      background: #ffffff;
      padding: 22px;
      box-shadow: 0 14px 40px rgba(15, 23, 42, 0.08);
    }
    .eyebrow {
      margin: 0 0 8px;
      color: #64748b;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 24px;
      line-height: 1.2;
    }
    p {
      margin: 0;
      max-width: 28rem;
      color: #64748b;
      font-size: 14px;
      line-height: 1.55;
    }
  </style>
</head>
<body>
  <main>
    <section class="preview-page">
      <p class="eyebrow">Website preview</p>
      <h1>${escapeHtml(title)}</h1>
      <p>The unified launcher appears in the corner of this preview, just like it will on the dealership website.</p>
    </section>
  </main>
  <script async src="${escapeAttribute(widgetSrc)}"></script>
</body>
</html>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;')
}

/** Drop a leading markdown "# Heading" line from the description preview. */
function stripHeading(body: string): string {
  return body.replace(/^\s*#[^\n]*\n?/, '')
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
    `title: ${prettifySlug(row.slug)}`,
    `greeting: Welcome to ${prettifySlug(row.slug)}`,
    'type: widget',
    'status: draft',
    '---',
    '',
    `# ${prettifySlug(row.slug)}`,
    '',
    'Edit this widget content. Your changes are reviewed before they go live.',
    '',
  ].join('\n')
}
