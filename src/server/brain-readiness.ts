/**
 * Brain readiness + sixth-invariant conformance check (SRS A.1 + A.5).
 *
 * The sixth wiki invariant requires that every customer deployment carry
 * an always-on metadata substrate. A configuration without it is
 * non-conformant. This module is the synchronous readiness probe that:
 *
 *   1. Ensures the per-profile Brain directory exists
 *   2. Opens the Brain to apply any pending migrations
 *   3. Verifies metadata_audit table is present
 *   4. Returns a structured report Studio's readiness endpoint can consume
 *
 * Studio MUST call provisionBrainForProfile() at profile creation time
 * (mcp__create_profile path) and refuse to mark the profile launch-ready
 * until checkBrainReadiness() returns ok=true.
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { openBrain, resolveBrainPaths, pendingMigrations } from './brain-store'
import { metadataSubstratePresent } from './metadata-substrate'

export type ReadinessReport = {
  profile: string
  ok: boolean
  reasons: Array<string>
  brain_dir_exists: boolean
  schema_version: number
  pending_migration_count: number
  metadata_substrate_present: boolean
  in_memory: boolean
  paths: {
    brain_root: string
    db: string
    backups: string
    vectors: string
    uploads: string
  }
}

export function provisionBrainForProfile(
  profile: string,
  options: { profileRoot?: string } = {},
): ReadinessReport {
  const paths = resolveBrainPaths(profile, options.profileRoot)
  fs.mkdirSync(paths.brainRoot, { recursive: true })
  fs.mkdirSync(paths.backupsDir, { recursive: true })
  fs.mkdirSync(paths.vectorsDir, { recursive: true })
  fs.mkdirSync(paths.uploadsDir, { recursive: true })
  const handle = openBrain(profile, { profileRoot: options.profileRoot })
  try {
    return buildReport(profile, handle, paths, options)
  } finally {
    handle.close()
  }
}

export function checkBrainReadiness(
  profile: string,
  options: { profileRoot?: string } = {},
): ReadinessReport {
  const paths = resolveBrainPaths(profile, options.profileRoot)
  const reasons: Array<string> = []
  const brainDirExists = fs.existsSync(paths.brainRoot)
  if (!brainDirExists) reasons.push('brain directory missing')

  let handle: ReturnType<typeof openBrain> | null = null
  try {
    handle = openBrain(profile, { profileRoot: options.profileRoot })
    const report = buildReport(profile, handle, paths, options)
    if (!report.metadata_substrate_present) {
      report.reasons.push(
        'sixth wiki invariant violation: metadata_audit absent — deployment non-conformant',
      )
      report.ok = false
    }
    return report
  } catch (err) {
    return {
      profile,
      ok: false,
      reasons: [...reasons, (err as Error).message],
      brain_dir_exists: brainDirExists,
      schema_version: 0,
      pending_migration_count: -1,
      metadata_substrate_present: false,
      in_memory: false,
      paths: pathsAsReport(paths),
    }
  } finally {
    handle?.close()
  }
}

function buildReport(
  profile: string,
  handle: ReturnType<typeof openBrain>,
  paths: ReturnType<typeof resolveBrainPaths>,
  options: { profileRoot?: string },
): ReadinessReport {
  const reasons: Array<string> = []
  const ms = metadataSubstratePresent(profile, options)
  if (!ms.ok) reasons.push(ms.reason ?? 'metadata substrate check failed')
  const pending = handle.inMemory ? [] : pendingMigrations(profile)
  if (pending.length > 0)
    reasons.push(`${pending.length} pending migration(s); profile must not serve agents`)
  return {
    profile,
    ok: reasons.length === 0,
    reasons,
    brain_dir_exists: true,
    schema_version: handle.schemaVersion,
    pending_migration_count: pending.length,
    metadata_substrate_present: ms.ok,
    in_memory: handle.inMemory,
    paths: pathsAsReport(paths),
  }
}

function pathsAsReport(p: ReturnType<typeof resolveBrainPaths>): ReadinessReport['paths'] {
  return {
    brain_root: p.brainRoot,
    db: p.dbPath,
    backups: p.backupsDir,
    vectors: p.vectorsDir,
    uploads: p.uploadsDir,
  }
}

/**
 * Bulk readiness check across every profile dir on the production
 * volume. Used by the deployment readiness endpoint and by the
 * provisioning script.
 */
export function listProfilesNeedingBrain(): Array<string> {
  const root =
    process.env.BRAIN_PROFILES_ROOT ??
    path.join(os.homedir(), '.hermes', 'profiles')
  if (!fs.existsSync(root)) return []
  const out: Array<string> = []
  for (const entry of fs.readdirSync(root)) {
    const profileDir = path.join(root, entry)
    if (!fs.statSync(profileDir).isDirectory()) continue
    const brain = path.join(profileDir, 'brain')
    if (!fs.existsSync(brain)) out.push(entry)
  }
  return out
}
