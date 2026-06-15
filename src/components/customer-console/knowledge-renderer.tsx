/**
 * customer-console.knowledge — SERRA-UI-5.
 *
 * A clean, customer-facing company wiki. Tree on the left, page editor on the
 * right. The tree is served ONLY from the curated `company-wiki/` subtree by
 * the API (see src/server/customer-wiki.ts), so no backend files or paths can
 * ever reach this component. As a defence in depth, this renderer additionally
 * NEVER displays raw filenames or relative paths — it derives a human-readable
 * page title from the first heading or the filename — and shows plain-language
 * empty states.
 *
 * Workspace gunmetal theme: white / slate-50 surfaces, slate-200 borders,
 * slate-900 text, gunmetal blue (#2f3b4d) for primary actions and active states.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { extractFrontmatter, readWikiFields } from '../../lib/frontmatter'
import type { StudioConfig } from '../../lib/studio-config'

const PRIMARY = '#2f3b4d'
const ACTIVE = '#2f3b4d'

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

/**
 * Translate a save-gate outcome into plain customer copy. The gate's raw
 * reasons reference internal concepts (protected trees, canonical pages,
 * frontmatter) that must never surface in the storefront.
 */
function friendlySaveError(rule?: string): string {
  switch (rule) {
    case 'protected-tree':
      return 'This page is read-only and can’t be edited here.'
    case 'canonical-frozen':
      return 'This page is locked and can’t be changed directly. Please reach out to have it updated.'
    case 'missing-frontmatter':
      return 'This page is missing some required details and can’t be saved.'
    default:
      return 'This change could not be saved. Please try again.'
  }
}

type ReadResponse = {
  ok: boolean
  content?: string
  error?: string
}

/**
 * Turn a wiki filename or directory name into a readable title.
 *   "how-to-edit-this-wiki.md" -> "How to edit this wiki"
 *   "00-start-here"            -> "Start here"
 *   "README.md"                -> "Overview"
 * Numeric ordering prefixes (e.g. "01-") are stripped from the label.
 */
function humanizeName(name: string): string {
  let base = name.replace(/\.md$/i, '')
  if (/^readme$/i.test(base)) return 'Overview'
  // Strip a leading numeric ordering prefix like "00-" or "1-".
  base = base.replace(/^\d+[-_]/, '')
  base = base.replace(/[-_]+/g, ' ').trim()
  if (!base) return name
  // Capitalise the first letter only — keep the rest as authored so acronyms
  // and proper nouns aren't mangled.
  return base.charAt(0).toUpperCase() + base.slice(1)
}

/**
 * Split a markdown document into its raw frontmatter prefix (the `---` block,
 * including delimiters and the trailing newline) and the body. The prefix is
 * preserved verbatim so saving never reformats or loses the original YAML.
 *   - If no frontmatter block is present, `prefix` is '' and `body` is content.
 */
function splitFrontmatterPrefix(content: string): {
  prefix: string
  body: string
} {
  const fm = extractFrontmatter(content)
  if (!fm.hasFrontmatter || fm.frontmatter === null) {
    return { prefix: '', body: content }
  }
  // The body returned by extractFrontmatter is everything after the closing
  // delimiter line. Recover the exact prefix by removing that body from the end.
  if (fm.body && content.endsWith(fm.body)) {
    return { prefix: content.slice(0, content.length - fm.body.length), body: fm.body }
  }
  return { prefix: '', body: content }
}

/**
 * Prefer the page's own first H1 heading as its title; fall back to the
 * humanised filename. Frontmatter `title:` is honoured first when present.
 */
function derivePageTitle(name: string, content: string): string {
  const fm = extractFrontmatter(content)
  const fields = readWikiFields(fm.frontmatter ?? {})
  if (fields.title) return String(fields.title)
  const body = fm.body ?? content
  const h1 = body.match(/^\s*#\s+(.+?)\s*$/m)
  if (h1?.[1]) return h1[1].trim()
  return humanizeName(name)
}

export function CustomerKnowledgeRenderer(props: {
  profile: string
  config: StudioConfig
}) {
  const [tree, setTree] = useState<Array<Node>>([])
  const [rootExists, setRootExists] = useState(true)
  const [treeError, setTreeError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Node | null>(null)
  const [content, setContent] = useState('')
  // The textarea edits the markdown BODY only; the frontmatter block is held
  // verbatim in `prefix` and re-attached on save so nothing is ever lost.
  const [prefix, setPrefix] = useState('')
  const [bodyDraft, setBodyDraft] = useState('')
  const [saveBusy, setSaveBusy] = useState(false)
  const [feedback, setFeedback] = useState<{
    kind: 'ok' | 'err' | 'warn'
    message: string
  } | null>(null)

  const loadTree = useCallback(async () => {
    setTreeError(null)
    try {
      const res = await fetch(
        `/api/customer/wiki/tree?profile=${encodeURIComponent(props.profile)}`,
        { credentials: 'include' },
      )
      const j = (await res.json().catch(() => ({}))) as TreeResponse
      if (!res.ok || !j.ok) {
        setTreeError('Could not load the wiki right now.')
        return
      }
      setTree(j.tree)
      setRootExists(j.root_exists)
    } catch {
      setTreeError('Could not load the wiki right now.')
    }
  }, [props.profile])

  useEffect(() => {
    void loadTree()
  }, [loadTree])

  const openFile = useCallback(
    async (node: Node) => {
      setSelected(node)
      setFeedback(null)
      try {
        const res = await fetch(
          `/api/customer/wiki/read?profile=${encodeURIComponent(props.profile)}&path=${encodeURIComponent(node.path)}`,
          { credentials: 'include' },
        )
        const j = (await res.json().catch(() => ({}))) as ReadResponse
        if (!res.ok || !j.ok || j.content === undefined) {
          setContent('')
          setPrefix('')
          setBodyDraft('')
          setFeedback({
            kind: 'err',
            message: 'This page could not be opened.',
          })
          return
        }
        const split = splitFrontmatterPrefix(j.content)
        setContent(j.content)
        setPrefix(split.prefix)
        setBodyDraft(split.body)
      } catch {
        setFeedback({ kind: 'err', message: 'This page could not be opened.' })
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
          path: selected.path,
          content: prefix + bodyDraft,
        }),
      })
      const j = (await res.json().catch(() => ({}))) as SaveResponse
      if (!res.ok || !j.ok) {
        setFeedback({
          kind: 'err',
          message: friendlySaveError(j.rule),
        })
        return
      }
      setContent(prefix + bodyDraft)
      const warnings = j.warnings ?? []
      if (warnings.length) {
        setFeedback({
          kind: 'warn',
          message: 'Saved. Some page details are missing — add a title, type, and status to help others find this page.',
        })
      } else {
        setFeedback({ kind: 'ok', message: 'Saved.' })
      }
      // Refresh tree after successful save (new entries will now appear)
      void loadTree()
    } catch {
      setFeedback({
        kind: 'err',
        message: 'This change could not be saved. Please try again.',
      })
    } finally {
      setSaveBusy(false)
    }
  }, [prefix, bodyDraft, props.profile, selected, loadTree])

  const newEntry = useCallback(() => {
    const timestamp = Date.now()
    const safePath = `drafts/new-entry-${timestamp}.md`
    const template = `---
title: New Entry
type: guide
status: draft
---

# New Entry

Add your content here. Update the title, type, and status above to help others find this page.

**Available types**: guide, policy, procedure, reference, faq
**Available statuses**: draft, active, archived
`
    // Create a synthetic node for the new draft
    const draftNode: Node = {
      name: `new-entry-${timestamp}.md`,
      path: safePath,
      type: 'file',
    }
    setSelected(draftNode)
    const split = splitFrontmatterPrefix(template)
    setContent(template)
    setPrefix(split.prefix)
    setBodyDraft(split.body)
    setFeedback(null)
  }, [])

  const pageTitle = useMemo(
    () => (selected ? derivePageTitle(selected.name, content) : ''),
    [selected, content],
  )

  // The "Page details" panel reads the preserved frontmatter block; the body
  // textarea never shows the raw `--- ... ---` delimiters.
  const fm = useMemo(() => extractFrontmatter(content), [content])
  const wikiFields = useMemo(() => readWikiFields(fm.frontmatter), [fm])

  const dirty = prefix + bodyDraft !== content

  return (
    <div className="grid h-full max-h-[calc(100dvh-220px)] gap-4 text-slate-900 lg:grid-cols-[300px_1fr]">
      <aside className="overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="mb-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Company Wiki
            </h3>
            <button
              type="button"
              onClick={() => void loadTree()}
              aria-label="Refresh"
              className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700"
            >
              ↻
            </button>
          </div>
          <button
            type="button"
            onClick={newEntry}
            className="rounded-md px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-95"
            style={{ background: PRIMARY }}
          >
            + New Entry
          </button>
        </div>
        {treeError ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            {treeError}
          </div>
        ) : !rootExists ? (
          <div className="text-xs leading-relaxed text-slate-500">
            Your company wiki hasn’t been set up yet. Once it’s ready, your
            pages will appear here.
          </div>
        ) : tree.length === 0 ? (
          <div className="text-xs leading-relaxed text-slate-500">
            This wiki is empty for now.
          </div>
        ) : (
          <TreeView nodes={tree} selected={selected} onSelect={openFile} />
        )}
      </aside>

      <section className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
        {selected ? (
          <>
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">
                {pageTitle}
              </h2>
              <button
                type="button"
                onClick={() => void save()}
                disabled={!dirty || saveBusy}
                className="rounded-md px-3 py-1.5 text-xs font-semibold text-white transition disabled:opacity-40"
                style={{ background: PRIMARY }}
              >
                {saveBusy ? 'Saving…' : dirty ? 'Save' : 'Saved'}
              </button>
            </header>

            {fm.frontmatter ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs">
                <div className="mb-1 font-medium text-slate-500">
                  Page details
                </div>
                <ul className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
                  {Object.entries(wikiFields)
                    .filter(([, v]) => v !== undefined && v !== '')
                    .map(([k, v]) => (
                      <li key={k} className="flex gap-2">
                        <span className="text-slate-500">{k}:</span>
                        <span className="font-medium text-slate-800">
                          {Array.isArray(v) ? v.join(', ') : String(v)}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                This page has no details block yet. Add a title, type, and
                status at the top to help others find it.
              </div>
            )}

            <textarea
              value={bodyDraft}
              onChange={(e) => setBodyDraft(e.target.value)}
              className="flex-1 resize-none rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
              spellCheck={false}
            />

            {feedback && (
              <div
                className={
                  'rounded-md border p-2 text-xs ' +
                  (feedback.kind === 'ok'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : feedback.kind === 'warn'
                      ? 'border-amber-200 bg-amber-50 text-amber-800'
                      : 'border-red-200 bg-red-50 text-red-700')
                }
              >
                {feedback.message}
              </div>
            )}
          </>
        ) : (
          <div className="m-auto max-w-sm text-center text-sm leading-relaxed text-slate-500">
            Select a page from the wiki to read or edit it. Your changes are
            saved straight to your company wiki.
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
  depth = 0,
}: {
  nodes: Array<Node>
  selected: Node | null
  onSelect: (node: Node) => void
  depth?: number
}) {
  return (
    <ul className="text-sm">
      {nodes.map((node) =>
        node.type === 'dir' ? (
          <li key={node.path} className="my-0.5">
            <details open={depth < 1}>
              <summary className="cursor-pointer truncate font-medium text-slate-700 hover:text-slate-900">
                {humanizeName(node.name)}
              </summary>
              <div className="ml-2 border-l border-slate-200 pl-2">
                {node.children && node.children.length > 0 ? (
                  <TreeView
                    nodes={node.children}
                    selected={selected}
                    onSelect={onSelect}
                    depth={depth + 1}
                  />
                ) : (
                  <div className="py-0.5 text-xs italic text-slate-400">
                    Nothing here yet.
                  </div>
                )}
              </div>
            </details>
          </li>
        ) : (
          <li key={node.path}>
            <button
              type="button"
              onClick={() => onSelect(node)}
              className={
                'block w-full truncate rounded px-2 py-1 text-left transition ' +
                (selected?.path === node.path
                  ? 'font-semibold text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')
              }
              style={
                selected?.path === node.path
                  ? { background: ACTIVE }
                  : undefined
              }
            >
              {humanizeName(node.name)}
            </button>
          </li>
        ),
      )}
    </ul>
  )
}
