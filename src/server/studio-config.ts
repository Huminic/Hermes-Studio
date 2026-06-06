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
  label?: string
  enabled?: boolean
}

/**
 * Persist the per-profile notification routing matrix (#207) into studio.yaml,
 * leaving every other config key intact. Reads the raw YAML (or the default
 * config when the file is missing), replaces only `notifications.routing`,
 * validates the result against the schema, then writes. Returns the saved
 * routing on success.
 */
export function updateNotificationRouting(
  profile: string,
  routing: Array<NotificationRuleInput>,
):
  | { ok: true; routing: Array<NotificationRuleInput> }
  | { ok: false; error: string } {
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

  const notifications =
    obj.notifications && typeof obj.notifications === 'object'
      ? (obj.notifications as Record<string, unknown>)
      : {}
  notifications.routing = routing
  obj.notifications = notifications

  const text = YAML.stringify(obj)
  // Round-trip through the schema before committing to disk.
  const check = parseStudioConfig(text)
  if (!check.ok) {
    return {
      ok: false,
      error: `resulting studio.yaml invalid: ${check.errors.join('; ')}`,
    }
  }
  fs.writeFileSync(file, text, 'utf8')
  return { ok: true, routing }
}
