/**
 * customer-console.agents — the Workspace Agents management page.
 *
 * Two top tabs:
 *  - Agents: a card per agent (name + engaging description), a gear that opens
 *    the Configuration modal (Contextual Instructions + Uploads), a "Chat"
 *    button that jumps to the Chat page with the agent pre-selected, and a
 *    "New Task" button that opens the structured New Task interview.
 *  - Tasks: a sortable table of structured task records with play/pause + redo
 *    actions, a "Show completed" toggle, and a click-to-open chat modal with a
 *    task-metadata visor.
 *
 * No Teams concept anywhere. Net-new persistence lives in the Brain via
 * /api/customer/agent-tasks + /api/customer/agent-config (see docs/agents-chat-schema.md).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  Delete02Icon,
  File01Icon,
  PauseIcon,
  PlayIcon,
  RefreshIcon,
  Settings02Icon,
  Tick02Icon,
  Upload01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { StudioConfig } from '../../lib/studio-config'
import { Dropdown, Modal } from './console-ui'

const ACCENT = '#2f3b4d'

type CustomerAgent = {
  id: string
  name: string
  summary: string
  scope: string | null
  source: 'governance/agents' | 'profile-SOUL'
  has_chat_persona: boolean
}

type AgentTask = {
  id: string
  agent_id: string
  title: string
  prompt: string
  description: string
  frequency: 'one_time' | 'recurring'
  cadence: string | null
  notification_channel: string
  notification_timing: string | null
  next_run_at: number | null
  status: 'active' | 'paused' | 'completed'
  created_at: number
  updated_at: number
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName
}

function engagingDescription(a: CustomerAgent): string {
  const s = (a.summary ?? '').trim()
  if (s) return s
  return `${firstName(a.name)} is one of your AI agents, ready to help your team and customers.`
}

function fmtDate(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return ''
  }
}

export function CustomerAgentsRenderer(props: {
  profile: string
  config: StudioConfig
}) {
  const [tab, setTab] = useState<'agents' | 'tasks'>('agents')
  const [agents, setAgents] = useState<Array<CustomerAgent>>([])
  const [rosterError, setRosterError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Modals
  const [configAgent, setConfigAgent] = useState<CustomerAgent | null>(null)
  const [taskAgent, setTaskAgent] = useState<CustomerAgent | null>(null)
  const [taskPrefill, setTaskPrefill] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/customer/agents?profile=${encodeURIComponent(props.profile)}`, {
      credentials: 'include',
    })
      .then(async (res) => {
        const j = (await res.json().catch(() => ({}))) as {
          ok: boolean
          agents?: Array<CustomerAgent>
          error?: string
        }
        if (cancelled) return
        if (!res.ok || !j.ok || !j.agents) {
          setRosterError(j.error ?? `HTTP ${res.status}`)
          return
        }
        setAgents(j.agents)
      })
      .catch((err) => {
        if (!cancelled)
          setRosterError(err instanceof Error ? err.message : 'fetch failed')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [props.profile])

  const agentName = useCallback(
    (id: string) => agents.find((a) => a.id === id)?.name ?? id,
    [agents],
  )

  function goToChat(agentId: string) {
    if (typeof window !== 'undefined') {
      window.location.assign(
        `/p/${encodeURIComponent(props.profile)}/chat?agent=${encodeURIComponent(agentId)}`,
      )
    }
  }

  function openNewTask(agent: CustomerAgent, prefill = '') {
    setTaskPrefill(prefill)
    setTaskAgent(agent)
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-slate-900">Agents</h2>
        <p className="text-sm text-slate-600">
          Manage your agents, their configuration, and the tasks they run.
        </p>
      </header>

      {/* Top tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {(['agents', 'tasks'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={
              '-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize transition-colors ' +
              (tab === t
                ? 'text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800')
            }
            style={tab === t ? { borderColor: ACCENT, color: ACCENT } : undefined}
          >
            {t}
          </button>
        ))}
      </div>

      {rosterError ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Your agents aren’t available right now. Please refresh, or contact your
          Huminic administrator.
        </div>
      ) : loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
          Loading your agents…
        </div>
      ) : tab === 'agents' ? (
        <AgentsTab
          agents={agents}
          onConfigure={setConfigAgent}
          onChat={goToChat}
          onNewTask={(a) => openNewTask(a)}
        />
      ) : (
        <TasksTab
          profile={props.profile}
          agentName={agentName}
          agents={agents}
          onRedo={(task) => {
            const agent = agents.find((a) => a.id === task.agent_id)
            if (agent) openNewTask(agent, task.prompt)
          }}
        />
      )}

      {configAgent && (
        <ConfigModal
          profile={props.profile}
          agent={configAgent}
          onClose={() => setConfigAgent(null)}
        />
      )}
      {taskAgent && (
        <NewTaskModal
          profile={props.profile}
          agent={taskAgent}
          initialPrompt={taskPrefill}
          onClose={() => setTaskAgent(null)}
          onCreated={() => {
            setTaskAgent(null)
            // If we're on the Tasks tab, it re-fetches on mount/refreshKey.
            setTab('tasks')
          }}
        />
      )}
    </div>
  )
}

// ── Agents tab ────────────────────────────────────────────────────────────

function AgentsTab(props: {
  agents: Array<CustomerAgent>
  onConfigure: (a: CustomerAgent) => void
  onChat: (agentId: string) => void
  onNewTask: (a: CustomerAgent) => void
}) {
  if (props.agents.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        No agents are set up for this storefront yet. Your Huminic team will add
        them shortly.
      </div>
    )
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {props.agents.map((a) => (
        <article
          key={a.id}
          data-testid="agent-card"
          className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-full text-base font-semibold text-white"
                style={{ background: ACCENT }}
              >
                {firstName(a.name).charAt(0).toUpperCase()}
              </span>
              <h3 className="text-base font-semibold text-slate-900">{a.name}</h3>
            </div>
            <button
              type="button"
              onClick={() => props.onConfigure(a)}
              aria-label={`Configure ${a.name}`}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <HugeiconsIcon icon={Settings02Icon} size={18} strokeWidth={1.8} />
            </button>
          </div>
          <p className="min-h-[3rem] flex-1 text-sm leading-relaxed text-slate-600">
            {engagingDescription(a)}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => props.onChat(a.id)}
              className="flex-1 rounded-lg px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ background: ACCENT }}
            >
              Chat
            </button>
            <button
              type="button"
              onClick={() => props.onNewTask(a)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              <HugeiconsIcon icon={Add01Icon} size={15} strokeWidth={1.8} />
              New Task
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}

// ── Configuration modal ─────────────────────────────────────────────────────

type UploadRow = {
  id: string
  filename: string
  classification: string
  size_bytes: number
}

function ConfigModal(props: {
  profile: string
  agent: CustomerAgent
  onClose: () => void
}) {
  const [tab, setTab] = useState<'instructions' | 'uploads'>('instructions')
  const [instructions, setInstructions] = useState('')
  const [instrSource, setInstrSource] = useState<'local' | 'wiki'>('local')
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [uploads, setUploads] = useState<Array<UploadRow>>([])
  const [uploadBusy, setUploadBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const p = encodeURIComponent(props.profile)
    const a = encodeURIComponent(props.agent.id)
    fetch(`/api/customer/agent-config?profile=${p}&agent_id=${a}`, {
      credentials: 'include',
    })
      .then(async (res) => {
        const j = (await res.json().catch(() => ({}))) as {
          ok: boolean
          instructions?: { instructions: string; source: 'local' | 'wiki' }
        }
        if (j.ok && j.instructions) {
          setInstructions(j.instructions.instructions)
          setInstrSource(j.instructions.source)
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
    void loadUploads()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.profile, props.agent.id])

  async function loadUploads() {
    try {
      const res = await fetch(
        `/api/customer/data-uploads?profile=${encodeURIComponent(props.profile)}`,
        { credentials: 'include' },
      )
      const j = (await res.json().catch(() => ({}))) as {
        ok: boolean
        uploads?: Array<UploadRow>
      }
      if (j.ok && j.uploads) setUploads(j.uploads)
    } catch {
      /* ignore */
    }
  }

  async function saveInstructions() {
    setSaving(true)
    setErr(null)
    try {
      const res = await fetch('/api/customer/agent-config', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: props.profile,
          agent_id: props.agent.id,
          instructions,
        }),
      })
      const j = (await res.json().catch(() => ({}))) as { ok: boolean }
      if (!res.ok || !j.ok) {
        setErr('Could not save instructions. Please try again.')
        return
      }
      setSavedAt(Date.now())
    } catch {
      setErr('Could not save instructions. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadBusy(true)
    setErr(null)
    try {
      const buf = await file.arrayBuffer()
      let binary = ''
      const bytes = new Uint8Array(buf)
      for (let i = 0; i < bytes.length; i++)
        binary += String.fromCharCode(bytes[i])
      const base64 = btoa(binary)
      const res = await fetch('/api/customer/data-uploads', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: props.profile,
          filename: file.name,
          content_base64: base64,
          mime_type: file.type || undefined,
          classification: 'document',
        }),
      })
      const j = (await res.json().catch(() => ({}))) as {
        ok: boolean
        uploads?: Array<UploadRow>
        error?: string
      }
      if (!res.ok || !j.ok) {
        setErr(j.error ?? 'Upload failed.')
        return
      }
      if (j.uploads) setUploads(j.uploads)
    } catch {
      setErr('Upload failed.')
    } finally {
      setUploadBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function removeUpload(id: string) {
    try {
      const res = await fetch('/api/customer/data-uploads', {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: props.profile, id }),
      })
      const j = (await res.json().catch(() => ({}))) as {
        ok: boolean
        uploads?: Array<UploadRow>
      }
      if (j.ok && j.uploads) setUploads(j.uploads)
    } catch {
      /* ignore */
    }
  }

  return (
    <Modal
      open
      onClose={props.onClose}
      title={`Configure ${props.agent.name}`}
      subtitle="Contextual instructions and base-context documents"
      size="lg"
      footer={
        tab === 'instructions' ? (
          <>
            {savedAt && (
              <span className="mr-auto text-xs text-emerald-600">Saved.</span>
            )}
            <button
              type="button"
              onClick={props.onClose}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
            <button
              type="button"
              onClick={saveInstructions}
              disabled={saving || !loaded}
              className="rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ background: ACCENT }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        )
      }
    >
      <div className="mb-4 flex gap-1 border-b border-slate-200">
        {(
          [
            ['instructions', 'Contextual Instructions'],
            ['uploads', 'Uploads'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ' +
              (tab === id
                ? 'text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800')
            }
            style={tab === id ? { borderColor: ACCENT, color: ACCENT } : undefined}
          >
            {label}
          </button>
        ))}
      </div>

      {err && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-600">
          {err}
        </div>
      )}

      {tab === 'instructions' ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-slate-500">
            These instructions guide {firstName(props.agent.name)} on top of its
            base persona.{' '}
            {instrSource === 'wiki'
              ? 'Sourced from your company wiki.'
              : 'Stored locally; will sync from your company wiki once available.'}
          </p>
          <textarea
            value={instructions}
            onChange={(e) => {
              setInstructions(e.target.value)
              setSavedAt(null)
            }}
            rows={10}
            placeholder={`e.g. Always confirm the customer's preferred contact method before ending a conversation.`}
            className="w-full resize-y rounded-lg border border-slate-300 p-3 text-sm text-slate-900 focus:outline-none focus:ring-2"
            style={{ outlineColor: ACCENT }}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-slate-500">
            Documents added here become part of {firstName(props.agent.name)}'s
            base context.
          </p>
          <div>
            <input
              ref={fileRef}
              type="file"
              onChange={onFile}
              className="hidden"
              data-testid="upload-input"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploadBusy}
              className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <HugeiconsIcon icon={Upload01Icon} size={16} strokeWidth={1.8} />
              {uploadBusy ? 'Uploading…' : 'Upload document'}
            </button>
          </div>
          {uploads.length === 0 ? (
            <p className="text-xs text-slate-400">No documents uploaded yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-200">
              {uploads.map((u) => (
                <li
                  key={u.id}
                  className="flex items-center gap-2 px-3 py-2 text-sm"
                >
                  <HugeiconsIcon
                    icon={File01Icon}
                    size={16}
                    strokeWidth={1.8}
                    color="#64748b"
                  />
                  <span className="min-w-0 flex-1 truncate text-slate-700">
                    {u.filename}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeUpload(u.id)}
                    aria-label={`Remove ${u.filename}`}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <HugeiconsIcon icon={Delete02Icon} size={15} strokeWidth={1.8} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  )
}

// ── New Task interview ──────────────────────────────────────────────────────

type InterviewStep =
  | 'describe'
  | 'checking'
  | 'declined'
  | 'cadence'
  | 'notify'
  | 'review'
  | 'error'

type InterviewMsg = { role: 'agent' | 'you'; content: string }

function NewTaskModal(props: {
  profile: string
  agent: CustomerAgent
  initialPrompt?: string
  onClose: () => void
  onCreated: () => void
}) {
  const [step, setStep] = useState<InterviewStep>('describe')
  const [prompt, setPrompt] = useState(props.initialPrompt ?? '')
  const [thread, setThread] = useState<Array<InterviewMsg>>([])
  const [frequency, setFrequency] = useState<'one_time' | 'recurring'>('one_time')
  const [cadence, setCadence] = useState('')
  const [channel, setChannel] = useState('in_app')
  const [timing, setTiming] = useState('')
  const [capabilityNote, setCapabilityNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const agentFirst = firstName(props.agent.name)

  function pushAgent(content: string) {
    setThread((prev) => [...prev, { role: 'agent', content }])
  }

  async function checkCapability() {
    const task = prompt.trim()
    if (!task) return
    setStep('checking')
    setErr(null)
    setThread([{ role: 'you', content: task }])
    // FEASIBILITY-ONLY framing: a real agent SOUL will otherwise "do" the task
    // and report it as done (verified live against Hermes). This wording makes
    // the agent judge feasibility and emit a parseable verdict without acting.
    const framed =
      `FEASIBILITY CHECK ONLY. Do NOT perform, schedule, or claim to perform ` +
      `anything — you are only judging whether a task is within your abilities. ` +
      `A teammate may assign you this task: "${task}". ` +
      `Respond with EXACTLY "[CAPABLE]" or "[NOT_CAPABLE]" as the first line, ` +
      `then one short sentence explaining why. Take no action.`
    try {
      const res = await fetch('/api/customer/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: props.profile,
          agent_id: props.agent.id,
          new_session: true,
          message: framed,
        }),
      })
      const j = (await res.json().catch(() => ({}))) as {
        ok: boolean
        reply?: string
        error?: string
      }
      if (!res.ok || !j.ok || !j.reply) {
        setErr(
          `Couldn't reach ${agentFirst} to confirm this task right now. No task was created — please try again later.`,
        )
        setStep('error')
        return
      }
      const reply = j.reply.trim()
      const capable = /^\[?\s*capable\s*\]?/i.test(reply)
      const notCapable = /^\[?\s*not[_\s]?capable\s*\]?/i.test(reply)
      const explanation = reply.replace(/^\[?\s*(not[_\s]?capable|capable)\s*\]?:?\s*/i, '').trim()
      pushAgent(explanation || reply)
      if (notCapable || !capable) {
        // Treat ambiguity conservatively as "cannot" only when explicitly not capable;
        // if the verdict token is missing entirely, still allow continuing.
        if (notCapable) {
          setStep('declined')
          return
        }
      }
      setCapabilityNote(explanation || reply)
      setStep('cadence')
    } catch {
      setErr(
        `Couldn't reach ${agentFirst} to confirm this task right now. No task was created — please try again later.`,
      )
      setStep('error')
    }
  }

  const restatement = useMemo(() => {
    const freqPhrase =
      frequency === 'recurring'
        ? cadence.trim()
          ? ` ${cadence.trim()}`
          : ' on a recurring basis'
        : ' once'
    const channelLabel =
      channel === 'in_app'
        ? 'in-app'
        : channel === 'email'
          ? 'by email'
          : channel === 'sms'
            ? 'by text'
            : 'with no notification'
    const timingPhrase = timing.trim() ? ` (${timing.trim()})` : ''
    return `OK — I'll ${prompt.trim()}${freqPhrase}, and notify you ${channelLabel}${timingPhrase}. Shall I set this up?`
  }, [prompt, frequency, cadence, channel, timing])

  async function confirmTask() {
    setSubmitting(true)
    setErr(null)
    try {
      const title = prompt.trim().slice(0, 60)
      const res = await fetch('/api/customer/agent-tasks', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: props.profile,
          agent_id: props.agent.id,
          title,
          prompt: prompt.trim(),
          description: capabilityNote || prompt.trim(),
          frequency,
          cadence: frequency === 'recurring' ? cadence.trim() : null,
          notification_channel: channel,
          notification_timing: timing.trim() || null,
        }),
      })
      const j = (await res.json().catch(() => ({}))) as {
        ok: boolean
        error?: string
      }
      if (!res.ok || !j.ok) {
        setErr(j.error ?? 'Could not create the task.')
        return
      }
      props.onCreated()
    } catch {
      setErr('Could not create the task.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open
      onClose={props.onClose}
      title={`New Task — ${props.agent.name}`}
      subtitle="A quick guided setup. Nothing is saved until you confirm."
      size="md"
    >
      {/* Conversation so far */}
      {thread.length > 0 && (
        <ul className="mb-3 flex flex-col gap-2">
          {thread.map((m, i) => (
            <li
              key={i}
              className={
                'max-w-[85%] rounded-lg px-3 py-2 text-sm ' +
                (m.role === 'you'
                  ? 'ml-auto text-white'
                  : 'mr-auto border border-slate-200 bg-white text-slate-800')
              }
              style={m.role === 'you' ? { background: ACCENT } : undefined}
            >
              <span className="whitespace-pre-wrap">{m.content}</span>
            </li>
          ))}
        </ul>
      )}

      {err && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-600">
          {err}
        </div>
      )}

      {step === 'describe' && (
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-slate-700">
            What would you like {agentFirst} to do?
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            autoFocus
            placeholder="e.g. Send me a summary of new leads every Monday morning."
            className="w-full resize-y rounded-lg border border-slate-300 p-3 text-sm text-slate-900 focus:outline-none focus:ring-2"
            style={{ outlineColor: ACCENT }}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={props.onClose}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={checkCapability}
              disabled={!prompt.trim()}
              className="rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ background: ACCENT }}
            >
              Ask {agentFirst}
            </button>
          </div>
        </div>
      )}

      {step === 'checking' && (
        <p className="py-4 text-center text-sm text-slate-500">
          {agentFirst} is reviewing your request…
        </p>
      )}

      {step === 'declined' && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-600">
            {agentFirst} can’t take this one on, so no task was created.
          </p>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={props.onClose}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {step === 'error' && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      )}

      {step === 'cadence' && (
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium text-slate-700">
            How often should {agentFirst} do this?
          </span>
          <div className="flex gap-2">
            {(
              [
                ['one_time', 'One time'],
                ['recurring', 'Recurring'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setFrequency(val)}
                className={
                  'flex-1 rounded-lg border px-3 py-2 text-sm transition-colors ' +
                  (frequency === val
                    ? 'font-semibold text-white'
                    : 'border-slate-300 text-slate-700 hover:bg-slate-50')
                }
                style={
                  frequency === val
                    ? { background: ACCENT, borderColor: ACCENT }
                    : undefined
                }
              >
                {label}
              </button>
            ))}
          </div>
          {frequency === 'recurring' && (
            <input
              type="text"
              value={cadence}
              onChange={(e) => setCadence(e.target.value)}
              placeholder="e.g. every Monday at 9am"
              className="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:outline-none focus:ring-2"
              style={{ outlineColor: ACCENT }}
            />
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setStep('describe')}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep('notify')}
              disabled={frequency === 'recurring' && !cadence.trim()}
              className="rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ background: ACCENT }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {step === 'notify' && (
        <div className="flex flex-col gap-3">
          <span className="text-sm font-medium text-slate-700">
            How should we notify you?
          </span>
          <Dropdown
            value={channel}
            ariaLabel="Notification channel"
            options={[
              { value: 'in_app', label: 'In-app' },
              { value: 'email', label: 'Email' },
              { value: 'sms', label: 'Text message' },
              { value: 'none', label: 'No notification' },
            ]}
            onChange={setChannel}
          />
          <input
            type="text"
            value={timing}
            onChange={(e) => setTiming(e.target.value)}
            placeholder="Optional: when? (e.g. on completion, each morning)"
            className="w-full rounded-lg border border-slate-300 p-2.5 text-sm focus:outline-none focus:ring-2"
            style={{ outlineColor: ACCENT }}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setStep('cadence')}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => {
                pushAgent(restatement)
                setStep('review')
              }}
              className="rounded-lg px-3 py-2 text-sm font-medium text-white"
              style={{ background: ACCENT }}
            >
              Review
            </button>
          </div>
        </div>
      )}

      {step === 'review' && (
        <div className="flex flex-col gap-3">
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setStep('notify')}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={confirmTask}
              disabled={submitting}
              data-testid="confirm-task"
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              style={{ background: ACCENT }}
            >
              <HugeiconsIcon icon={Tick02Icon} size={15} strokeWidth={2} />
              {submitting ? 'Creating…' : 'Confirm & create task'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ── Tasks tab ───────────────────────────────────────────────────────────────

type SortKey = 'date' | 'type'

function TasksTab(props: {
  profile: string
  agents: Array<CustomerAgent>
  agentName: (id: string) => string
  onRedo: (task: AgentTask) => void
}) {
  const [tasks, setTasks] = useState<Array<AgentTask>>([])
  const [showCompleted, setShowCompleted] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [loading, setLoading] = useState(true)
  const [chatTask, setChatTask] = useState<AgentTask | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    const inc = showCompleted ? '&include_completed=1' : ''
    fetch(`/api/customer/agent-tasks?profile=${encodeURIComponent(props.profile)}${inc}`, {
      credentials: 'include',
    })
      .then(async (res) => {
        const j = (await res.json().catch(() => ({}))) as {
          ok: boolean
          tasks?: Array<AgentTask>
        }
        if (j.ok && j.tasks) setTasks(j.tasks)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [props.profile, showCompleted])

  useEffect(() => {
    load()
  }, [load])

  async function setStatus(id: string, status: 'active' | 'paused') {
    try {
      const res = await fetch('/api/customer/agent-tasks', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: props.profile, id, status }),
      })
      const j = (await res.json().catch(() => ({}))) as { ok: boolean }
      if (j.ok) load()
    } catch {
      /* ignore */
    }
  }

  const sorted = useMemo(() => {
    const arr = [...tasks]
    arr.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'date') cmp = a.created_at - b.created_at
      else cmp = a.frequency.localeCompare(b.frequency)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return arr
  }, [tasks, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir(key === 'date' ? 'desc' : 'asc')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => toggleSort('type')}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          data-testid="sort-type"
        >
          Sort by type{sortKey === 'type' ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
        </button>
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={showCompleted}
            onChange={(e) => setShowCompleted(e.target.checked)}
            data-testid="show-completed"
          />
          Show completed
        </label>
      </div>

      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
          Loading tasks…
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
          No tasks yet. Open an agent and choose “New Task” to create one.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => toggleSort('date')}
                    className="flex items-center gap-1 font-semibold hover:text-slate-800"
                    data-testid="sort-date"
                  >
                    Date
                    {sortKey === 'date' && (
                      <HugeiconsIcon
                        icon={sortDir === 'asc' ? ArrowUp01Icon : ArrowDown01Icon}
                        size={12}
                        strokeWidth={2}
                      />
                    )}
                  </button>
                </th>
                <th className="px-3 py-2 font-semibold">Agent</th>
                <th className="px-3 py-2 font-semibold">Task</th>
                <th className="px-3 py-2 font-semibold">Description</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sorted.map((t) => (
                <tr key={t.id} data-testid="task-row" className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-3 py-2 text-slate-600">
                    {fmtDate(t.created_at)}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {props.agentName(t.agent_id)}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setChatTask(t)}
                      className="text-left font-medium text-slate-900 hover:underline"
                    >
                      {t.title}
                    </button>
                    <div className="mt-0.5">
                      <span
                        className={
                          'inline-block rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ' +
                          (t.frequency === 'recurring'
                            ? 'bg-indigo-50 text-indigo-700'
                            : 'bg-slate-100 text-slate-600')
                        }
                      >
                        {t.frequency.replace('_', '-')}
                      </span>
                    </div>
                  </td>
                  <td className="max-w-[220px] px-3 py-2 text-slate-600">
                    <span className="line-clamp-2">{t.description}</span>
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    {t.status === 'completed' ? (
                      <button
                        type="button"
                        onClick={() => props.onRedo(t)}
                        aria-label="Redo task"
                        data-testid="redo-task"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                      >
                        <HugeiconsIcon icon={RefreshIcon} size={16} strokeWidth={1.8} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setStatus(t.id, t.status === 'active' ? 'paused' : 'active')
                        }
                        aria-label={t.status === 'active' ? 'Pause task' : 'Resume task'}
                        data-testid="toggle-task"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                      >
                        <HugeiconsIcon
                          icon={t.status === 'active' ? PauseIcon : PlayIcon}
                          size={16}
                          strokeWidth={1.8}
                        />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {chatTask && (
        <TaskChatModal
          profile={props.profile}
          task={chatTask}
          agentName={props.agentName(chatTask.agent_id)}
          onClose={() => setChatTask(null)}
        />
      )}
    </div>
  )
}

function StatusBadge(props: { status: AgentTask['status'] }) {
  const map: Record<AgentTask['status'], { label: string; cls: string }> = {
    active: { label: 'Active', cls: 'bg-emerald-50 text-emerald-700' },
    paused: { label: 'Paused', cls: 'bg-amber-50 text-amber-700' },
    completed: { label: 'Completed', cls: 'bg-slate-100 text-slate-600' },
  }
  const m = map[props.status]
  return (
    <span className={'inline-block rounded-full px-2 py-0.5 text-xs font-medium ' + m.cls}>
      {m.label}
    </span>
  )
}

// ── Task chat modal (chat + metadata visor) ─────────────────────────────────

function TaskChatModal(props: {
  profile: string
  task: AgentTask
  agentName: string
  onClose: () => void
}) {
  const [turns, setTurns] = useState<Array<{ role: 'you' | 'agent'; content: string }>>(
    [],
  )
  const [draft, setDraft] = useState('')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [turns])

  async function send() {
    const message = draft.trim()
    if (!message || busy) return
    const wasNew = sessionId === null
    setBusy(true)
    setTurns((p) => [...p, { role: 'you', content: message }])
    setDraft('')
    try {
      const res = await fetch('/api/customer/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile: props.profile,
          agent_id: props.task.agent_id,
          session_id: sessionId ?? undefined,
          new_session: wasNew,
          message,
        }),
      })
      const j = (await res.json().catch(() => ({}))) as {
        ok: boolean
        reply?: string
        session_id?: string
      }
      if (j.ok && j.reply) {
        if (j.session_id) setSessionId(j.session_id)
        setTurns((p) => [...p, { role: 'agent', content: j.reply! }])
      } else {
        setTurns((p) => [
          ...p,
          { role: 'agent', content: 'Sorry — I’m unavailable right now.' },
        ])
      }
    } catch {
      setTurns((p) => [
        ...p,
        { role: 'agent', content: 'Sorry — I’m unavailable right now.' },
      ])
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={props.onClose}
      title={props.task.title}
      subtitle={`Task · ${props.agentName}`}
      size="lg"
    >
      <div className="flex flex-col gap-4 md:flex-row">
        {/* Chat */}
        <div className="flex min-h-[320px] flex-1 flex-col rounded-lg border border-slate-200">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3">
            {turns.length === 0 ? (
              <p className="text-xs text-slate-400">
                Ask {firstName(props.agentName)} about this task.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {turns.map((t, i) => (
                  <li
                    key={i}
                    className={
                      'max-w-[85%] rounded-lg px-3 py-2 text-sm ' +
                      (t.role === 'you'
                        ? 'ml-auto text-white'
                        : 'mr-auto border border-slate-200 bg-white text-slate-800')
                    }
                    style={t.role === 'you' ? { background: ACCENT } : undefined}
                  >
                    <span className="whitespace-pre-wrap">{t.content}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <form
            className="flex items-end gap-2 border-t border-slate-200 p-2"
            onSubmit={(e) => {
              e.preventDefault()
              void send()
            }}
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
              rows={1}
              placeholder="Message…"
              className="max-h-32 flex-1 resize-none border-0 bg-transparent py-1 text-sm focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              aria-label="Send"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40"
              style={{ background: ACCENT }}
            >
              <HugeiconsIcon icon={ArrowUp01Icon} size={16} strokeWidth={2.2} />
            </button>
          </form>
        </div>

        {/* Visor */}
        <aside className="w-full shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm md:w-56">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Task details
          </h4>
          <dl className="flex flex-col gap-2">
            <VisorRow label="Frequency" value={props.task.frequency.replace('_', '-')} />
            {props.task.cadence && (
              <VisorRow label="Cadence" value={props.task.cadence} />
            )}
            <VisorRow
              label="Next run"
              value={
                props.task.next_run_at ? fmtDate(props.task.next_run_at) : 'Not scheduled'
              }
            />
            <VisorRow label="Notify" value={props.task.notification_channel} />
            {props.task.notification_timing && (
              <VisorRow label="When" value={props.task.notification_timing} />
            )}
            <VisorRow label="Status" value={props.task.status} />
          </dl>
        </aside>
      </div>
    </Modal>
  )
}

function VisorRow(props: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-slate-400">
        {props.label}
      </dt>
      <dd className="capitalize text-slate-700">{props.value}</dd>
    </div>
  )
}
