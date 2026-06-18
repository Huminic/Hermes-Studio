/**
 * Dashboard "Ask AI" — natural-language Q&A grounded in the profile's REAL
 * federated dashboard data (Funnel / Leads / Pipeline / AI Activity), reusing
 * the same inference provider as customer chat. It does NOT invent an analytics
 * engine: it serializes the already-computed, real metrics as grounding context
 * and instructs the model to answer ONLY from them.
 *
 * No provider configured → honest unconfigured response (never a fake answer).
 * "data source pending" metrics are passed through as such so the model says it
 * doesn't have that figure rather than guessing.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildDashboard } from './dashboard-metrics'
import { VENDOR_GUARDRAIL, scrubVendorTerms } from './dealer-safe'
import type { DashboardPayload, Metric } from './dashboard-metrics'

const HERMES_URL = process.env.HERMES_API_URL || 'http://hermes-agent:8642'

function readKeyFromHermesEnv(varName: string): string | null {
  try {
    const envPath = path.join(os.homedir(), '.hermes', '.env')
    const raw = fs.readFileSync(envPath, 'utf8')
    for (const line of raw.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq === -1) continue
      if (t.slice(0, eq).trim() === varName) return t.slice(eq + 1).trim()
    }
  } catch {
    return null
  }
  return null
}

function keys() {
  return {
    hermes:
      process.env.API_SERVER_KEY ||
      process.env.HERMES_API_KEY ||
      readKeyFromHermesEnv('API_SERVER_KEY'),
    openai: process.env.OPENAI_API_KEY || readKeyFromHermesEnv('OPENAI_API_KEY'),
    model: process.env.HERMES_MODEL || 'gpt-4.1',
  }
}

/** Compact, model-readable view of the real dashboard data. */
export function groundingForDashboard(d: DashboardPayload): string {
  const metricLine = (m: Metric) =>
    m.status === 'pending'
      ? `- ${m.label}: data source pending`
      : `- ${m.label}: ${m.value ?? 'n/a'}${
          m.unit === 'days' ? ' days' : m.unit === 'percent' ? '%' : ''
        }${
          m.trend && m.trend.prior != null
            ? ` (prior ${m.trend.prior}, ${m.trend.direction})`
            : ''
        }`

  const lines: Array<string> = [
    `Window: last ${d.window_days} days (compared to the prior ${d.comparison_window_days} days).`,
    ``,
    `## Lead Performance`,
    ...d.funnel.lead_performance.map(metricLine),
    ``,
    `## Pipeline Performance (now vs comparison)`,
    ...d.funnel.pipeline_performance.stages.map(
      (s) =>
        `- ${s.label}: ${s.status === 'pending' ? 'data source pending' : `${s.now ?? 'n/a'} (comparison ${s.comparison ?? 'n/a'})`}`,
    ),
    ``,
    `## Lead sources (by volume)`,
    ...(d.funnel.lead_sources.length
      ? d.funnel.lead_sources
          .slice(0, 12)
          .map((r) => `- ${r.lead_source}: ${r.total_leads ?? 0} leads, ${r.sold_from_leads ?? 0} sold`)
      : ['- data source pending']),
    ``,
    `## Leads`,
    d.leads.source === 'pending'
      ? `- data source pending (${d.leads.reason ?? 'no live lead source'})`
      : `- New ${d.leads.statuses.new.count}, Active ${d.leads.statuses.active.count}, Abandoned ${d.leads.statuses.abandoned.count}`,
    ``,
    `## Pipeline by salesperson`,
    ...(d.pipeline.status === 'pending'
      ? ['- data source pending']
      : d.pipeline.rows
          .slice(0, 20)
          .map(
            (r) =>
              `- ${r.salesperson}: ${r.leads ?? 0} leads, ${r.opportunities ?? 0} opportunities, ${r.appointments ?? 0} appts, ${r.sales ?? 0} sales`,
          )),
    ``,
    `## AI Activity`,
    ...d.ai_activity.metrics.map(metricLine),
  ]
  return lines.join('\n')
}

export type AskResult =
  | { ok: true; answer: string; via: 'hermes' | 'openai-direct' }
  | { ok: false; error: string; unconfigured?: boolean }

export async function askDashboard(
  profile: string,
  question: string,
  opts: { windowDays?: number; now?: number } = {},
): Promise<AskResult> {
  const q = question.trim()
  if (!q) return { ok: false, error: 'Empty question.' }

  const dashboard = await buildDashboard(profile, {
    windowDays: opts.windowDays ?? 30,
    now: opts.now,
  })
  const grounding = groundingForDashboard(dashboard)

  const system = [
    VENDOR_GUARDRAIL,
    ``,
    `You are this dealership's analytics assistant. Answer the user's question USING ONLY the dashboard data below. The data is real and already scoped to this store and time window.`,
    `Rules:`,
    `- If a figure is marked "data source pending", say it isn't available yet — do NOT estimate or invent it.`,
    `- Do not state numbers that are not present below.`,
    `- Be concise. Prefer plain language over jargon. No vendor/CRM names.`,
    ``,
    `# Dashboard data`,
    grounding,
  ].join('\n')

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: q },
  ]
  const { hermes, openai, model } = keys()

  try {
    if (hermes) {
      const res = await fetch(`${HERMES_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${hermes}` },
        body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 500 }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: { message?: string }
        choices?: Array<{ message?: { content?: string } }>
      }
      if (res.ok && !data.error) {
        return {
          ok: true,
          answer: scrubVendorTerms(data.choices?.[0]?.message?.content ?? ''),
          via: 'hermes',
        }
      }
    }
    if (openai) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openai}` },
        body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: 500 }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        error?: { message?: string }
        choices?: Array<{ message?: { content?: string } }>
      }
      if (!res.ok || data.error) {
        return { ok: false, error: data.error?.message ?? 'Upstream provider error.' }
      }
      return {
        ok: true,
        answer: scrubVendorTerms(data.choices?.[0]?.message?.content ?? ''),
        via: 'openai-direct',
      }
    }
    return {
      ok: false,
      unconfigured: true,
      error: 'Ask AI is not configured for this workspace yet.',
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Provider call failed.' }
  }
}
