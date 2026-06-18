/**
 * GET    /api/customer/automations?profile=X — list automations (seeds the two
 *        required Serra drafts on first load so the builder is never empty).
 * POST   /api/customer/automations — create { profile, name, trigger, channel, agent_id, wait_hours?, status? }
 * PUT    /api/customer/automations — update { profile, id, ...patch } (incl. status: draft|active|paused)
 * DELETE /api/customer/automations — delete { profile, id }
 *
 * Automations drive the EXISTING gated send path (see server/automations.ts).
 * Only `active` automations fire; `draft`/`paused` never send.
 */
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { requireJsonContentType } from '../../../server/rate-limit'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../server/customer-auth'
import {
  listAutomations,
  createAutomation,
  updateAutomation,
  deleteAutomation,
  type AutomationTrigger,
  type AutomationStatus,
} from '../../../server/messaging-hub-store'
import {
  seedDefaultAutomations,
  AUTOMATION_CHANNELS,
  SALES_AGENT_ID,
  SERVICE_AGENT_ID,
} from '../../../server/automations'
import { readStudioConfig } from '../../../server/studio-config'

const TRIGGERS: ReadonlyArray<AutomationTrigger> = ['new_lead', 'lead_followup']
const STATUSES: ReadonlyArray<AutomationStatus> = ['draft', 'active', 'paused']
const AGENTS = [SALES_AGENT_ID, SERVICE_AGENT_ID] as const

type Validated = {
  name: string
  trigger: AutomationTrigger
  channel: string
  agent_id: string
  wait_hours: number
  status: AutomationStatus
}

function validate(
  body: Record<string, unknown>,
  partial: boolean,
): { ok: true; value: Partial<Validated> } | { ok: false; error: string } {
  const out: Partial<Validated> = {}

  if (body.name !== undefined || !partial) {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) return { ok: false, error: 'name is required' }
    out.name = name
  }
  if (body.trigger !== undefined || !partial) {
    const t = body.trigger as AutomationTrigger
    if (!TRIGGERS.includes(t)) {
      return { ok: false, error: `trigger must be one of ${TRIGGERS.join(', ')}` }
    }
    out.trigger = t
  }
  if (body.channel !== undefined || !partial) {
    const c = typeof body.channel === 'string' ? body.channel : ''
    if (!AUTOMATION_CHANNELS.includes(c as (typeof AUTOMATION_CHANNELS)[number])) {
      return {
        ok: false,
        error: `channel must be one of ${AUTOMATION_CHANNELS.join(', ')}`,
      }
    }
    out.channel = c
  }
  if (body.agent_id !== undefined || !partial) {
    const a = typeof body.agent_id === 'string' ? body.agent_id : ''
    if (!AGENTS.includes(a as (typeof AGENTS)[number])) {
      return { ok: false, error: `agent_id must be one of ${AGENTS.join(', ')}` }
    }
    out.agent_id = a
  }
  if (body.wait_hours !== undefined) {
    const w = Number(body.wait_hours)
    if (!Number.isFinite(w) || w < 0) {
      return { ok: false, error: 'wait_hours must be a number ≥ 0' }
    }
    out.wait_hours = Math.round(w)
  } else if (!partial) {
    out.wait_hours = 0
  }
  if (body.status !== undefined || !partial) {
    const s = (body.status as AutomationStatus) ?? 'draft'
    if (!STATUSES.includes(s)) {
      return { ok: false, error: `status must be one of ${STATUSES.join(', ')}` }
    }
    out.status = s
  }
  return { ok: true, value: out }
}

export const Route = createFileRoute('/api/customer/automations')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const profile = url.searchParams.get('profile') ?? ''
        if (!profile) {
          return json({ ok: false, error: 'profile required' }, { status: 400 })
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Forbidden' }, { status: 403 })
        }
        // Seed the two required Serra drafts on first load (idempotent).
        seedDefaultAutomations(profile)
        // Offer only the agents this store actually has (agent_picker.visible_agents).
        // A store with no service agent (e.g. Serra Honda — service lives in the
        // separate Serra Service profile) shows Sales only.
        const visible = readStudioConfig(profile).config.agent_picker
          ?.visible_agents ?? []
        const agents: Array<{ id: string; label: string; team: string }> = []
        if (visible.includes(SALES_AGENT_ID)) {
          agents.push({ id: SALES_AGENT_ID, label: 'Sales', team: 'sales' })
        }
        if (visible.includes(SERVICE_AGENT_ID)) {
          agents.push({ id: SERVICE_AGENT_ID, label: 'Service', team: 'service' })
        }
        if (agents.length === 0) {
          agents.push({ id: SALES_AGENT_ID, label: 'Sales', team: 'sales' })
        }
        return json({
          ok: true,
          automations: listAutomations(profile),
          agents,
        })
      },
      POST: async ({ request }) => {
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        const body = (await request.json().catch(() => ({}))) as Record<
          string,
          unknown
        >
        const profile = typeof body.profile === 'string' ? body.profile : ''
        if (!profile) {
          return json({ ok: false, error: 'profile required' }, { status: 400 })
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Forbidden' }, { status: 403 })
        }
        const v = validate(body, false)
        if (!v.ok) return json({ ok: false, error: v.error }, { status: 400 })
        const automation = createAutomation({
          profile,
          name: v.value.name!,
          trigger: v.value.trigger!,
          channel: v.value.channel!,
          agent_id: v.value.agent_id!,
          wait_hours: v.value.wait_hours ?? 0,
          status: v.value.status ?? 'draft',
        })
        return json({ ok: true, automation })
      },
      PUT: async ({ request }) => {
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        const body = (await request.json().catch(() => ({}))) as Record<
          string,
          unknown
        >
        const profile = typeof body.profile === 'string' ? body.profile : ''
        const id = typeof body.id === 'string' ? body.id : ''
        if (!profile || !id) {
          return json(
            { ok: false, error: 'profile and id required' },
            { status: 400 },
          )
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Forbidden' }, { status: 403 })
        }
        const v = validate(body, true)
        if (!v.ok) return json({ ok: false, error: v.error }, { status: 400 })
        const automation = updateAutomation(profile, id, v.value)
        if (!automation) {
          return json(
            { ok: false, error: 'Automation not found' },
            { status: 404 },
          )
        }
        return json({ ok: true, automation })
      },
      DELETE: async ({ request }) => {
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        const body = (await request.json().catch(() => ({}))) as Record<
          string,
          unknown
        >
        const profile = typeof body.profile === 'string' ? body.profile : ''
        const id = typeof body.id === 'string' ? body.id : ''
        if (!profile || !id) {
          return json(
            { ok: false, error: 'profile and id required' },
            { status: 400 },
          )
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Forbidden' }, { status: 403 })
        }
        const removed = deleteAutomation(profile, id)
        if (!removed) {
          return json(
            { ok: false, error: 'Automation not found' },
            { status: 404 },
          )
        }
        return json({ ok: true })
      },
    },
  },
})
