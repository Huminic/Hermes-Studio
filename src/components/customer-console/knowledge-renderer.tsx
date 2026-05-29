/**
 * customer-console.knowledge — Phase C.3 (AC.3.1–AC.3.4).
 *
 * Tree on the left, editor on the right. KSG-gated save + promote.
 * Frontmatter panel sits above the textarea so the customer can see
 * what shape the file declares.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { extractFrontmatter, readWikiFields } from '../../lib/frontmatter'
import type { StudioConfig } from '../../lib/studio-config'

type Node = {
  name: string
  path: string
  type: 'dir' | 'file'
  size?: number
  modified?: number
  children?: Array<Node>
}

type TreeResponse = {
  ok: boolean
  tree: Array<Node>
  root_exists: boolean
}

type SaveResponse = {
  ok: boolean
  warnings?: Array<string>
  error?: string
  rule?: string
}

type ReadResponse = {
  ok: boolean
  content?: string
  error?: string
}

export function CustomerKnowledgeRenderer(props: {
  profile: string
  config: StudioConfig
}) {
  const [tree, setTree] = useState<Array<Node>>([])
  const [rootExists, setRootExists] = useState(true)
  const [treeError, setTreeError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [draft, setDraft] = useState('')
  const [saveBusy, setSaveBusy] = useState(false)
  const [feedback, setFeedback] = useState<{
    kind: 'ok' | 'err' | 'warn'
    message: string
  } | null>(null)
  const accent = props.config.branding.accent_color ?? '#1e40af'

  const loadTree = useCallback(async () => {
    setTreeError(null)
    try {
      const res = await fetch(
        `/api/customer/wiki/tree?profile=${encodeURIComponent(props.profile)}`,
        { credentials: 'include' },
      )
      const j = (await res.json().catch(() => ({}))) as TreeResponse
      if (!res.ok || !j.ok) {
        setTreeError(`HTTP ${res.status}`)
        return
      }
      setTree(j.tree)
      setRootExists(j.root_exists)
    } catch (err) {
      setTreeError(err instanceof Error ? err.message : 'fetch failed')
    }
  }, [props.profile])

  useEffect(() => {
    void loadTree()
  }, [loadTree])

  const openFile = useCallback(
    async (path: string) => {
      setSelected(path)
      setFeedback(null)
      try {
        const res = await fetch(
          `/api/customer/wiki/read?profile=${encodeURIComponent(props.profile)}&path=${encodeURIComponent(path)}`,
          { credentials: 'include' },
        )
        const j = (await res.json().catch(() => ({}))) as ReadResponse
        if (!res.ok || !j.ok || j.content === undefined) {
          setContent('')
          setDraft('')
          setFeedback({ kind: 'err', message: j.error ?? `HTTP ${res.status}` })
          return
        }
        setContent(j.content)
        setDraft(j.content)
      } catch (err) {
        setFeedback({
          kind: 'err',
          message: err instanceof Error ? err.message : 'load failed',
        })
      }
    },
    [props.profile],
  )

  const save = useCallback(async () => {
    if (!selected) return
    setSaveBusy(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/customer/wiki/save', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: props.profile,
          path: selected,
          content: draft,
        }),
      })
      const j = (await res.json().catch(() => ({}))) as SaveResponse
      if (!res.ok || !j.ok) {
        setFeedback({
          kind: 'err',
          message: `KSG blocked save: ${j.error ?? `HTTP ${res.status}`}${j.rule ? ` (${j.rule})` : ''}`,
        })
        return
      }
      setContent(draft)
      const warnings = j.warnings ?? []
      if (warnings.length) {
        setFeedback({
          kind: 'warn',
          message: `Saved with warnings: ${warnings.join('; ')}`,
        })
      } else {
        setFeedback({ kind: 'ok', message: 'Saved.' })
      }
    } catch (err) {
      setFeedback({
        kind: 'err',
        message: err instanceof Error ? err.message : 'save failed',
      })
    } finally {
      setSaveBusy(false)
    }
  }, [draft, props.profile, selected])

  const promote = useCallback(async () => {
    if (!selected) return
    setSaveBusy(true)
    setFeedback(null)
    try {
      const res = await fetch('/api/customer/wiki/promote', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: props.profile,
          path: selected,
        }),
      })
      const j = (await res.json().catch(() => ({}))) as {
        ok: boolean
        to?: string
        error?: string
        rule?: string
      }
      if (!res.ok || !j.ok) {
        setFeedback({
          kind: 'err',
          message: `Promote blocked: ${j.error ?? `HTTP ${res.status}`}${j.rule ? ` (${j.rule})` : ''}`,
        })
        return
      }
      setFeedback({ kind: 'ok', message: `Promoted → ${j.to}` })
      await loadTree()
      if (j.to) await openFile(j.to)
    } catch (err) {
      setFeedback({
        kind: 'err',
        message: err instanceof Error ? err.message : 'promote failed',
      })
    } finally {
      setSaveBusy(false)
    }
  }, [loadTree, openFile, props.profile, selected])

  const fm = useMemo(() => {
    if (!draft) return { frontmatter: null, body: '' }
    return extractFrontmatter(draft)
  }, [draft])
  const wikiFields = useMemo(() => readWikiFields(fm.frontmatter), [fm])

  const dirty = draft !== content

  return (
    <div className="grid h-full max-h-[calc(100dvh-220px)] gap-3 lg:grid-cols-[280px_1fr]">
      <aside className="overflow-y-auto rounded border border-white/10 bg-black/10 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wide opacity-60">
            {props.profile} wiki
          </h3>
          <button
            type="button"
            onClick={() => void loadTree()}
            className="text-[10px] opacity-50 hover:opacity-100"
          >
            ↻
          </button>
        </div>
        {treeError ? (
          <div className="text-xs text-red-300">{treeError}</div>
        ) : !rootExists ? (
          <div className="text-xs opacity-60">Profile not found.</div>
        ) : tree.length === 0 ? (
          <div className="text-xs opacity-60">Empty wiki.</div>
        ) : (
          <TreeView
            nodes={tree}
            selected={selected}
            onSelect={openFile}
            accent={accent}
          />
        )}
      </aside>

      <section className="flex flex-col gap-2 rounded border border-white/10 bg-black/10 p-3">
        {selected ? (
          <>
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-xs opacity-70">{selected}</div>
              <div className="flex gap-2">
                {selected.startsWith('knowledge/inbox/') ||
                selected.startsWith('knowledge/drafts/') ? (
                  <button
                    type="button"
                    onClick={() => void promote()}
                    disabled={saveBusy}
                    className="rounded border border-white/10 px-2 py-1 text-xs opacity-80 hover:opacity-100 disabled:opacity-40"
                  >
                    Promote →{' '}
                    {selected.startsWith('knowledge/inbox/')
                      ? 'drafts'
                      : 'published'}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={!dirty || saveBusy}
                  className="rounded px-3 py-1 text-xs font-medium disabled:opacity-40"
                  style={{ background: accent, color: '#fff' }}
                >
                  {saveBusy ? '…' : dirty ? 'Save' : 'Saved'}
                </button>
              </div>
            </header>

            {fm.frontmatter ? (
              <div className="rounded border border-white/10 bg-white/5 p-2 text-xs">
                <div className="mb-1 font-medium opacity-60">Frontmatter</div>
                <ul className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
                  {Object.entries(wikiFields)
                    .filter(([, v]) => v !== undefined && v !== '')
                    .map(([k, v]) => (
                      <li key={k} className="flex gap-2">
                        <span className="opacity-60">{k}:</span>
                        <span className="font-medium">
                          {Array.isArray(v) ? v.join(', ') : String(v)}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            ) : (
              <div className="rounded border border-amber-400/30 bg-amber-400/10 p-2 text-xs">
                No frontmatter detected. KSG requires `title`, `type`, `status`.
              </div>
            )}

            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="flex-1 resize-none rounded border border-white/10 bg-black/30 px-2 py-2 text-xs font-mono"
              spellCheck={false}
            />

            {feedback && (
              <div
                className={
                  'rounded border p-2 text-xs ' +
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
          </>
        ) : (
          <div className="m-auto text-xs opacity-60">
            Pick a file from the tree to edit. Canon/governance pages are
            read-only here.
          </div>
        )}
      </section>
    </div>
  )
}

function TreeView({
  nodes,
  selected,
  onSelect,
  accent,
  depth = 0,
}: {
  nodes: Array<Node>
  selected: string | null
  onSelect: (path: string) => void
  accent: string
  depth?: number
}) {
  return (
    <ul className="text-xs">
      {nodes.map((node) =>
        node.type === 'dir' ? (
          <li key={node.path} className="my-0.5">
            <details open={depth < 1}>
              <summary className="cursor-pointer truncate opacity-80 hover:opacity-100">
                {node.name}/
              </summary>
              <div className="ml-3 border-l border-white/10 pl-2">
                {node.children && node.children.length > 0 && (
                  <TreeView
                    nodes={node.children}
                    selected={selected}
                    onSelect={onSelect}
                    accent={accent}
                    depth={depth + 1}
                  />
                )}
              </div>
            </details>
          </li>
        ) : (
          <li key={node.path}>
            <button
              type="button"
              onClick={() => onSelect(node.path)}
              className={
                'block w-full truncate rounded px-1 py-0.5 text-left ' +
                (selected === node.path
                  ? 'font-semibold'
                  : 'opacity-70 hover:opacity-100')
              }
              style={
                selected === node.path
                  ? { background: `${accent}33`, color: '#fff' }
                  : undefined
              }
            >
              {node.name}
            </button>
          </li>
        ),
      )}
    </ul>
  )
}
