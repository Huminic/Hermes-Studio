/**
 * Structured agent tasks for the Workspace "Agents" page (Tasks tab).
 *
 * Per-profile, stored in a lazily-created Brain table (tenant-scoped, mirrors
 * the dashboard_saved_queries / report_* pattern). A task is the durable,
 * STRUCTURED record produced by the New Task interview — never a free-form chat
 * blob. The interview itself runs over /api/customer/chat; only on explicit
 * confirmation does the client POST the structured fields here.
 *
 * SCHEDULER NOTE (documented debt): `next_run_at` and the recurring `cadence`
 * are persisted so the UI can show "next run" and the operator can pause/resume,
 * but NO background worker executes recurring tasks yet. Wiring a worker (poll
 * agent_tasks WHERE status='active' AND next_run_at<=now) is tracked as a
 * deferred item — see issues.md. Until then a task is a saved intent + status,
 * not an autonomously-firing job.
 */

import { openBrain, now as brainNow, uuid } from './brain-store'
import type { BrainHandle } from './brain-store'

export type TaskFrequency = 'one_time' | 'recurring'
export type TaskStatus = 'active' | 'paused' | 'completed'

export type AgentTask = {
  id: string
  agent_id: string
  title: string
  prompt: string
  description: string
  frequency: TaskFrequency
  /** Human-readable cadence for recurring tasks (e.g. "every Monday at 9am"); null for one_time. */
  cadence: string | null
  /** Where the user is notified: 'in_app' | 'email' | 'sms' | 'none' (free-form, validated as non-empty). */
  notification_channel: string
  /** Optional timing detail for the notification (e.g. "on completion", "daily at 9am"). */
  notification_timing: string | null
  /** Epoch ms of the next intended run; null when unscheduled. No worker fires this yet. */
  next_run_at: number | null
  status: TaskStatus
  created_at: number
  updated_at: number
}

export type CreateTaskInput = {
  agent_id: string
  title: string
  prompt: string
  description?: string
  frequency: TaskFrequency
  cadence?: string | null
  notification_channel: string
  notification_timing?: string | null
  next_run_at?: number | null
  /** Allow a non-default initial status (tests/migration); defaults to 'active'. */
  status?: TaskStatus
}

function ensureTable(handle: BrainHandle): void {
  handle.exec(`CREATE TABLE IF NOT EXISTS agent_tasks (
    id TEXT PRIMARY KEY,
    tenant TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    title TEXT NOT NULL,
    prompt TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    frequency TEXT NOT NULL,
    cadence TEXT,
    notification_channel TEXT NOT NULL DEFAULT 'in_app',
    notification_timing TEXT,
    next_run_at INTEGER,
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`)
}

type Row = {
  id: string
  agent_id: string
  title: string
  prompt: string
  description: string | null
  frequency: string
  cadence: string | null
  notification_channel: string | null
  notification_timing: string | null
  next_run_at: number | null
  status: string
  created_at: number
  updated_at: number
}

function rowToTask(r: Row): AgentTask {
  return {
    id: r.id,
    agent_id: r.agent_id,
    title: r.title,
    prompt: r.prompt,
    description: r.description ?? '',
    frequency: r.frequency === 'recurring' ? 'recurring' : 'one_time',
    cadence: r.cadence ?? null,
    notification_channel: r.notification_channel ?? 'in_app',
    notification_timing: r.notification_timing ?? null,
    next_run_at: r.next_run_at ?? null,
    status:
      r.status === 'paused'
        ? 'paused'
        : r.status === 'completed'
          ? 'completed'
          : 'active',
    created_at: r.created_at,
    updated_at: r.updated_at,
  }
}

export function listTasks(
  profile: string,
  opts: { profileRoot?: string; includeCompleted?: boolean; agentId?: string } = {},
): Array<AgentTask> {
  const handle = openBrain(profile, { profileRoot: opts.profileRoot })
  try {
    ensureTable(handle)
    const where: Array<string> = ['tenant = ?']
    const params: Array<unknown> = [profile]
    if (!opts.includeCompleted) where.push("status != 'completed'")
    if (opts.agentId) {
      where.push('agent_id = ?')
      params.push(opts.agentId)
    }
    return handle
      .all<Row>(
        `SELECT * FROM agent_tasks WHERE ${where.join(' AND ')} ORDER BY created_at DESC`,
        ...params,
      )
      .map(rowToTask)
  } finally {
    handle.close()
  }
}

export function getTask(
  profile: string,
  id: string,
  opts: { profileRoot?: string } = {},
): AgentTask | null {
  const handle = openBrain(profile, { profileRoot: opts.profileRoot })
  try {
    ensureTable(handle)
    const row = handle.get<Row>(
      `SELECT * FROM agent_tasks WHERE id = ? AND tenant = ?`,
      id,
      profile,
    )
    return row ? rowToTask(row) : null
  } finally {
    handle.close()
  }
}

export function createTask(
  profile: string,
  input: CreateTaskInput,
  opts: { profileRoot?: string } = {},
): { ok: true; task: AgentTask } | { ok: false; error: string } {
  const agentId = input.agent_id?.trim()
  const title = input.title?.trim()
  const prompt = input.prompt?.trim()
  const channel = input.notification_channel?.trim()
  if (!agentId) return { ok: false, error: 'agent_id required.' }
  if (!title) return { ok: false, error: 'title required.' }
  if (!prompt) return { ok: false, error: 'prompt required.' }
  if (input.frequency !== 'one_time' && input.frequency !== 'recurring') {
    return { ok: false, error: 'frequency must be one_time or recurring.' }
  }
  if (input.frequency === 'recurring' && !input.cadence?.trim()) {
    return { ok: false, error: 'cadence required for recurring tasks.' }
  }
  if (!channel) return { ok: false, error: 'notification_channel required.' }

  const handle = openBrain(profile, { profileRoot: opts.profileRoot })
  try {
    ensureTable(handle)
    const id = uuid()
    const ts = brainNow()
    const cadence =
      input.frequency === 'recurring' ? (input.cadence?.trim() ?? null) : null
    handle.run(
      `INSERT INTO agent_tasks
       (id, tenant, agent_id, title, prompt, description, frequency, cadence,
        notification_channel, notification_timing, next_run_at, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id,
      profile,
      agentId,
      title,
      prompt,
      input.description?.trim() ?? '',
      input.frequency,
      cadence,
      channel,
      input.notification_timing?.trim() ?? null,
      input.next_run_at ?? null,
      input.status ?? 'active',
      ts,
      ts,
    )
    const task = getTask(profile, id, opts)
    return task
      ? { ok: true, task }
      : { ok: false, error: 'Task create failed.' }
  } finally {
    handle.close()
  }
}

export function setTaskStatus(
  profile: string,
  id: string,
  status: TaskStatus,
  opts: { profileRoot?: string } = {},
): { ok: true; task: AgentTask } | { ok: false; error: string } {
  const handle = openBrain(profile, { profileRoot: opts.profileRoot })
  try {
    ensureTable(handle)
    const res = handle.run(
      `UPDATE agent_tasks SET status = ?, updated_at = ? WHERE id = ? AND tenant = ?`,
      status,
      brainNow(),
      id,
      profile,
    )
    if (res.changes === 0) return { ok: false, error: 'Task not found.' }
    const task = getTask(profile, id, opts)
    return task ? { ok: true, task } : { ok: false, error: 'Task missing.' }
  } finally {
    handle.close()
  }
}

export function deleteTask(
  profile: string,
  id: string,
  opts: { profileRoot?: string } = {},
): { ok: true } {
  const handle = openBrain(profile, { profileRoot: opts.profileRoot })
  try {
    ensureTable(handle)
    handle.run(`DELETE FROM agent_tasks WHERE id = ? AND tenant = ?`, id, profile)
    return { ok: true }
  } finally {
    handle.close()
  }
}
