/**
 * /api/customer/agent-tasks
 *
 * Structured agent tasks for the Workspace Agents page (Tasks tab).
 *   GET    ?profile=X[&include_completed=1][&agent_id=Y]  → list
 *   POST   { profile, agent_id, title, prompt, description?, frequency,
 *            cadence?, notification_channel, notification_timing?, next_run_at? }
 *          → create (the structured record the New Task interview confirms)
 *   PATCH  { profile, id, status }  → play/pause/complete
 *   DELETE { profile, id }          → remove
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../server/customer-auth'
import { requireJsonContentType } from '../../../server/rate-limit'
import {
  createTask,
  deleteTask,
  listTasks,
  setTaskStatus,
  type CreateTaskInput,
  type TaskStatus,
} from '../../../server/agent-tasks-store'

const VALID_STATUS: ReadonlyArray<TaskStatus> = ['active', 'paused', 'completed']

export const Route = createFileRoute('/api/customer/agent-tasks')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const profile = url.searchParams.get('profile') ?? ''
        if (!profile) {
          return json({ ok: false, error: 'profile required.' }, { status: 400 })
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Unauthorized for this profile.' }, { status: 403 })
        }
        const includeCompleted =
          url.searchParams.get('include_completed') === '1' ||
          url.searchParams.get('include_completed') === 'true'
        const agentId = url.searchParams.get('agent_id') ?? undefined
        const tasks = listTasks(profile, { includeCompleted, agentId })
        return json({ ok: true, profile, tasks })
      },

      POST: async ({ request }) => {
        const csrf = requireJsonContentType(request)
        if (csrf) return csrf
        let body: Record<string, unknown>
        try {
          body = (await request.json()) as Record<string, unknown>
        } catch {
          return json({ ok: false, error: 'Invalid JSON.' }, { status: 400 })
        }
        const profile = String(body.profile ?? '')
        if (!profile) {
          return json({ ok: false, error: 'profile required.' }, { status: 400 })
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Unauthorized for this profile.' }, { status: 403 })
        }
        const input: CreateTaskInput = {
          agent_id: String(body.agent_id ?? ''),
          title: String(body.title ?? ''),
          prompt: String(body.prompt ?? ''),
          description:
            typeof body.description === 'string' ? body.description : undefined,
          frequency: body.frequency === 'recurring' ? 'recurring' : 'one_time',
          cadence: typeof body.cadence === 'string' ? body.cadence : null,
          notification_channel: String(body.notification_channel ?? ''),
          notification_timing:
            typeof body.notification_timing === 'string'
              ? body.notification_timing
              : null,
          next_run_at:
            typeof body.next_run_at === 'number' ? body.next_run_at : null,
        }
        const result = createTask(profile, input)
        if (!result.ok) return json(result, { status: 400 })
        return json({ ok: true, task: result.task })
      },

      PATCH: async ({ request }) => {
        const csrf = requireJsonContentType(request)
        if (csrf) return csrf
        let body: Record<string, unknown>
        try {
          body = (await request.json()) as Record<string, unknown>
        } catch {
          return json({ ok: false, error: 'Invalid JSON.' }, { status: 400 })
        }
        const profile = String(body.profile ?? '')
        const id = String(body.id ?? '')
        const status = String(body.status ?? '') as TaskStatus
        if (!profile || !id) {
          return json({ ok: false, error: 'profile and id required.' }, { status: 400 })
        }
        if (!VALID_STATUS.includes(status)) {
          return json({ ok: false, error: 'Invalid status.' }, { status: 400 })
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Unauthorized for this profile.' }, { status: 403 })
        }
        const result = setTaskStatus(profile, id, status)
        if (!result.ok) return json(result, { status: 404 })
        return json({ ok: true, task: result.task })
      },

      DELETE: async ({ request }) => {
        const csrf = requireJsonContentType(request)
        if (csrf) return csrf
        let body: Record<string, unknown>
        try {
          body = (await request.json()) as Record<string, unknown>
        } catch {
          return json({ ok: false, error: 'Invalid JSON.' }, { status: 400 })
        }
        const profile = String(body.profile ?? '')
        const id = String(body.id ?? '')
        if (!profile || !id) {
          return json({ ok: false, error: 'profile and id required.' }, { status: 400 })
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Unauthorized for this profile.' }, { status: 403 })
        }
        deleteTask(profile, id)
        return json({ ok: true })
      },
    },
  },
})
