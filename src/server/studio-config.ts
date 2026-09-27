/**
 * Server-side studio.yaml reader. Hands the API endpoint a parsed config or a
 * default if the file is missing or malformed.
 */

import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { getProfileWorkspaceRoot } from './profiles-browser'
import {
  parseStudioConfig,
  defaultStudioConfig,
  type StudioConfig,
} from '../lib/studio-config'

export type ReadStudioConfigResult = {
  config: StudioConfig
  source: 'file' | 'default'
  parseErrors?: Array<string>
}

export function readStudioConfig(profile: string): ReadStudioConfigResult {
  let root: string
  try {
    root = getProfileWorkspaceRoot(profile)
  } catch (err) {
    return {
      config: defaultStudioConfig(profile),
      source: 'default',
      parseErrors: [(err as Error).message],
    }
  }

  const file = path.join(root, 'studio.yaml')
  if (!fs.existsSync(file)) {
    return { config: defaultStudioConfig(profile), source: 'default' }
  }
  const text = fs.readFileSync(file, 'utf8')
  const parsed = parseStudioConfig(text)
  if (parsed.ok) {
    return { config: parsed.config, source: 'file' }
  }
  return {
    config: defaultStudioConfig(profile),
    source: 'default',
    parseErrors: parsed.errors,
  }
}

export type NotificationRuleInput = {
  event: string
  to: string
  channel?: 'email' | 'sms'
  /** Per-notification template: 'email' card vs 'adf-xml' DMS document (#NW). */
  format?: 'adf-xml' | 'email'
  label?: string
  enabled?: boolean
}

/**
 * Mutate a single concern in a profile's studio.yaml, leaving every other key
 * intact. Reads the raw YAML (or the default config when the file is missing),
 * applies `mutate`, validates the result against the schema, then writes.
 */
function mutateStudioYaml(
  profile: string,
  mutate: (obj: Record<string, unknown>) => void,
): { ok: true } | { ok: false; error: string } {
  let root: string
  try {
    root = getProfileWorkspaceRoot(profile)
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
  const file = path.join(root, 'studio.yaml')

  let obj: Record<string, unknown>
  if (fs.existsSync(file)) {
    try {
      obj = (YAML.parse(fs.readFileSync(file, 'utf8')) ?? {}) as Record<
        string,
        unknown
      >
    } catch (err) {
      return {
        ok: false,
        error: `existing studio.yaml parse error: ${(err as Error).message}`,
      }
    }
  } else {
    // No file yet — start from the full default so we never write a partial.
    obj = defaultStudioConfig(profile) as unknown as Record<string, unknown>
  }

  mutate(obj)

  const text = YAML.stringify(obj)
  const check = parseStudioConfig(text)
  if (!check.ok) {
    return {
      ok: false,
      error: `resulting studio.yaml invalid: ${check.errors.join('; ')}`,
    }
  }
  fs.writeFileSync(file, text, 'utf8')
  return { ok: true }
}

/**
 * Persist the per-profile notification routing matrix (#207) into studio.yaml.
 */
export function updateNotificationRouting(
  profile: string,
  routing: Array<NotificationRuleInput>,
):
  | { ok: true; routing: Array<NotificationRuleInput> }
  | { ok: false; error: string } {
  const res = mutateStudioYaml(profile, (obj) => {
    const notifications =
      obj.notifications && typeof obj.notifications === 'object'
        ? (obj.notifications as Record<string, unknown>)
        : {}
    notifications.routing = routing
    obj.notifications = notifications
  })
  return res.ok ? { ok: true, routing } : res
}

export type ManagementAudience = {
  emails: Array<string>
  cells: Array<string>
  reportsEnabled: boolean
  alertsEnabled: boolean
  /** Report-scheduling tz override (else business_hours.tz). */
  tz?: string
  /** Display store name for report subjects/headers (else the profile slug). */
  storeName?: string
}

/**
 * Read a profile's management audience + report/alert switches from studio.yaml
 * (N3.1). Fail-safe: an unreadable/absent config yields empty lists + both
 * switches off, never throws.
 */
export function readManagementAudience(profile: string): ManagementAudience {
  try {
    const comms = readStudioConfig(profile).config.comms
    const ma = comms?.management_audience ?? { emails: [], cells: [] }
    return {
      emails: (ma.emails ?? []).filter((e): e is string => typeof e === 'string' && e.length > 0),
      cells: (ma.cells ?? []).filter((c): c is string => typeof c === 'string' && c.length > 0),
      reportsEnabled: comms?.reports?.enabled ?? false,
      alertsEnabled: comms?.alerts?.enabled ?? false,
      tz: comms?.reports?.tz,
      storeName: comms?.reports?.store_name,
    }
  } catch {
    return { emails: [], cells: [], reportsEnabled: false, alertsEnabled: false }
  }
}

export type ManagementAudienceInput = {
  emails: Array<string>
  cells: Array<string>
  reportsEnabled: boolean
  alertsEnabled: boolean
}

/**
 * Persist the per-profile management audience + report/alert switches into
 * studio.yaml (N3.1). Validates against the schema (emails + E.164 cells) via
 * mutateStudioYaml, leaving every other key intact.
 */
export function updateManagementAudience(
  profile: string,
  input: ManagementAudienceInput,
): { ok: true } | { ok: false; error: string } {
  return mutateStudioYaml(profile, (obj) => {
    const comms =
      obj.comms && typeof obj.comms === 'object'
        ? (obj.comms as Record<string, unknown>)
        : {}
    comms.management_audience = { emails: input.emails, cells: input.cells }
    const reports =
      comms.reports && typeof comms.reports === 'object'
        ? (comms.reports as Record<string, unknown>)
        : {}
    reports.enabled = input.reportsEnabled
    comms.reports = reports
    const alerts =
      comms.alerts && typeof comms.alerts === 'object'
        ? (comms.alerts as Record<string, unknown>)
        : {}
    alerts.enabled = input.alertsEnabled
    comms.alerts = alerts
    obj.comms = comms
  })
}

export type DashboardCardInput = {
  title: string
  source: string
  sources?: Array<string>
  visualization?: 'number' | 'bar' | 'table'
  display?: 'summary' | 'detail'
}

/**
 * Persist the per-profile custom dashboard cards (data builder) into studio.yaml.
 */
export function updateDashboards(
  profile: string,
  dashboards: Array<DashboardCardInput>,
): { ok: true; dashboards: Array<DashboardCardInput> } | { ok: false; error: string } {
  const res = mutateStudioYaml(profile, (obj) => {
    obj.dashboards = dashboards
  })
  return res.ok ? { ok: true, dashboards } : res
}
