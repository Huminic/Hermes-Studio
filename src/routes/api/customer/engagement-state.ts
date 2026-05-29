/**
 * GET  /api/customer/engagement-state?profile=X
 * POST /api/customer/engagement-state — advance a stage or approve a gate.
 *
 * AC.13.2 — Customer-admin / operator drives engagement state through
 * the same on-disk YAML the consultative agent reads.
 *
 * Body for POST:
 *   { profile, action: 'advance', to_stage, notes? }
 *   { profile, action: 'approve_gate', gate, approver, notes?, decision? }
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { requireJsonContentType } from '../../../server/rate-limit'
import {
  isAuthorizedForProfile,
  resolveSession,
} from '../../../server/customer-auth'
import {
  parseEngagementState,
  ENGAGEMENT_STAGES,
  type EngagementState,
  type EngagementStage,
} from '../../../lib/engagement-state'

function stateFile(profile: string): string {
  return path.join(
    os.homedir(),
    '.hermes',
    'profiles',
    profile,
    'engagement-state.yaml',
  )
}

function loadRaw(profile: string): { ok: boolean; state?: EngagementState; raw?: string; error?: string } {
  const file = stateFile(profile)
  if (!fs.existsSync(file)) return { ok: false, error: 'engagement-state.yaml not found' }
  const raw = fs.readFileSync(file, 'utf8')
  const result = parseEngagementState(raw)
  if (!result.ok) {
    return { ok: false, error: result.errors.join('; ') }
  }
  return { ok: true, state: result.state, raw }
}

function nowIso(): string {
  return new Date().toISOString()
}

function saveYaml(profile: string, data: unknown): void {
  fs.writeFileSync(stateFile(profile), stringifyYaml(data), 'utf8')
}

export const Route = createFileRoute('/api/customer/engagement-state')({
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
        const result = loadRaw(profile)
        if (!result.ok) {
          return json(result, { status: 404 })
        }
        return json({ ok: true, state: result.state })
      },
      POST: async ({ request }) => {
        const csrfCheck = requireJsonContentType(request)
        if (csrfCheck) return csrfCheck
        const body = (await request.json().catch(() => ({}))) as Record<
          string,
          unknown
        >
        const profile = typeof body.profile === 'string' ? body.profile : ''
        const action = typeof body.action === 'string' ? body.action : ''
        if (!profile || !action) {
          return json(
            { ok: false, error: 'profile and action required' },
            { status: 400 },
          )
        }
        const session = resolveSession(request)
        if (!isAuthorizedForProfile(session, profile)) {
          return json({ ok: false, error: 'Forbidden' }, { status: 403 })
        }
        const loaded = loadRaw(profile)
        if (!loaded.ok || !loaded.raw) {
          return json(loaded, { status: 404 })
        }
        const data = parseYaml(loaded.raw) as Record<string, unknown>

        if (action === 'advance') {
          const to = String(body.to_stage ?? '')
          if (!ENGAGEMENT_STAGES.includes(to as EngagementStage)) {
            return json(
              { ok: false, error: `unknown stage: ${to}` },
              { status: 400 },
            )
          }
          const history = Array.isArray(data.stage_history)
            ? (data.stage_history as Array<Record<string, unknown>>)
            : []
          const current = String(data.current_stage ?? '')
          const lastIdx = history.findIndex((h) => h.exited_at === null)
          if (lastIdx >= 0 && current !== to) {
            history[lastIdx].exited_at = nowIso()
          }
          history.push({
            stage: to,
            entered_at: nowIso(),
            exited_at: null,
            notes: typeof body.notes === 'string' ? body.notes : '',
            skipped: false,
          })
          data.stage_history = history
          data.current_stage = to
          data.stage_entered_at = nowIso()
          saveYaml(profile, data)
          return json({ ok: true })
        }

        if (action === 'approve_gate') {
          const gate = String(body.gate ?? '')
          const gates =
            (data.readiness_gates as Record<string, Record<string, unknown>>) ?? {}
          if (!gates[gate]) {
            return json(
              { ok: false, error: `unknown gate: ${gate}` },
              { status: 400 },
            )
          }
          gates[gate].status = 'approved'
          gates[gate].approved_by =
            typeof body.approver === 'string'
              ? body.approver
              : session?.username ?? 'unknown'
          gates[gate].approved_at = nowIso()
          if (typeof body.notes === 'string') {
            gates[gate].notes = body.notes
          }
          if (typeof body.decision === 'string') {
            gates[gate].decision = body.decision
          }
          data.readiness_gates = gates
          saveYaml(profile, data)
          return json({ ok: true })
        }

        return json(
          { ok: false, error: `unknown action: ${action}` },
          { status: 400 },
        )
      },
    },
  },
})
