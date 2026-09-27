/**
 * Shared recipient/store-name resolution for the report + text senders (N3.1).
 *
 * Every `scripts/send-*.ts` defaults `--to` to the profile's ONE management
 * audience (emails for the email reports, cells for the text senders) when no
 * explicit `--to` is passed; an explicit `--to` always overrides. The display
 * store name defaults to `comms.reports.store_name`, then the profile slug.
 *
 * Pure over `readManagementAudience` so callers stay thin; tests inject the
 * audience directly on the send functions and never touch this resolver.
 */
import { readManagementAudience } from '../src/server/studio-config'

/** Explicit `--to` wins; otherwise the store's management-audience emails. */
export function resolveEmailRecipients(profile: string, explicitTo: string[]): string[] {
  if (explicitTo.length > 0) return explicitTo
  return readManagementAudience(profile).emails
}

/** Explicit `--to` wins; otherwise the store's management-audience cells. */
export function resolveCellRecipients(profile: string, explicitTo: string[]): string[] {
  if (explicitTo.length > 0) return explicitTo
  return readManagementAudience(profile).cells
}

/** Explicit `--store-name` wins; otherwise comms.reports.store_name, else the slug. */
export function resolveStoreName(profile: string, explicit: string): string {
  if (explicit && explicit.trim()) return explicit.trim()
  return readManagementAudience(profile).storeName ?? profile
}
