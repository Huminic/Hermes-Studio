/**
 * Hermes self-improvement watcher (SRS Tranche A.8).
 *
 * Hermes maintains internal files that reflect its own learning across
 * sessions (memory deltas, skill refinements, gateway tuning markers).
 * When those files change we must NOT silently absorb them — they must
 * pass through the appropriate Semantic Guardian and surface as hunches
 * so the operator and the consultative agent can review.
 *
 * This module is the Cron-friendly watcher:
 *   - Reads the configured watch list (per-profile + global)
 *   - Hashes each file
 *   - Compares against the last-recorded checksum in
 *     `self_improvement_events`
 *   - When a change is detected, opens a hunch via the appropriate
 *     guardian and records the event
 *
 * The actual Cron schedule is established in
 * `src/server/self-improvement-cron.ts`.
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { openBrain, now, uuid } from './brain-store'
import { recordHunch } from './hunches-store'
import { recordAudit } from './metadata-substrate'

export type WatchTarget = {
  path: string
  /** Which guardian inspects changes to this path. */
  routed_to: 'KSG' | 'DSG'
  /** Optional human-friendly label for hunch text. */
  label?: string
}

/**
 * Default watch list. Profile-scoped paths use `<profile-root>` token.
 * Global paths are absolute.
 *
 * The set covers the files Hermes touches when it "learns" — memory
 * snapshots, agent definition deltas, skill activation logs, and the
 * skill marketplace state. Operators can extend per-profile via
 * `~/.hermes/profiles/<profile>/self-improvement.watch.yaml`.
 */
export function defaultWatchList(profileRoot: string): Array<WatchTarget> {
  return [
    {
      path: path.join(profileRoot, 'SOUL.md'),
      routed_to: 'KSG',
      label: 'profile SOUL',
    },
    {
      path: path.join(profileRoot, 'persona.md'),
      routed_to: 'KSG',
      label: 'profile persona',
    },
    {
      path: path.join(profileRoot, 'config.yaml'),
      routed_to: 'DSG',
      label: 'profile config',
    },
    {
      path: path.join(profileRoot, 'state.db'),
      routed_to: 'DSG',
      label: 'profile state.db',
    },
    {
      path: path.join(os.homedir(), '.runtime', 'agent-definitions.json'),
      routed_to: 'KSG',
      label: 'runtime agent definitions',
    },
    {
      path: path.join(os.homedir(), '.runtime', 'skill-activations.json'),
      routed_to: 'KSG',
      label: 'runtime skill activations',
    },
  ]
}

export type ScanReport = {
  profile: string
  scanned: number
  changes: Array<{
    file_path: string
    change_type: 'created' | 'modified' | 'deleted'
    routed_to: 'KSG' | 'DSG'
    hunch_id?: string
    event_id: string
  }>
  errors: Array<{ file_path: string; error: string }>
}

/**
 * Run one scan pass. Idempotent — repeated scans without file changes
 * produce no new hunches or events.
 */
export function scanSelfImprovement(
  profile: string,
  options: {
    profileRoot?: string
    watchList?: Array<WatchTarget>
  } = {},
): ScanReport {
  const profileRoot =
    options.profileRoot ??
    path.join(
      os.homedir(),
      '.hermes',
      'profiles',
      profile.replace(/[^a-zA-Z0-9_-]/g, '_'),
    )
  const watchList = options.watchList ?? defaultWatchList(profileRoot)

  const report: ScanReport = {
    profile,
    scanned: watchList.length,
    changes: [],
    errors: [],
  }

  const handle = openBrain(profile, { profileRoot })
  try {
    for (const target of watchList) {
      try {
        const change = inspectOne(handle, target)
        if (!change) continue
        const eventId = uuid()
        const hunch = recordHunch(
          {
            profile,
            originating_guardian: target.routed_to,
            subject_type: 'file',
            subject_id: target.path,
            statement: `${target.label ?? target.path} ${change.change_type}. Review for governance impact before promoting.`,
            evidence_refs: [
              { kind: 'self-improvement-event', value: eventId },
              { kind: 'file-path', value: target.path },
              {
                kind: 'checksum-before',
                value: change.before_checksum ?? null,
              },
              {
                kind: 'checksum-after',
                value: change.after_checksum ?? null,
              },
            ],
            confidence_label: 'B-2',
            proposed_action:
              target.routed_to === 'KSG' ? 'wiki_update' : 'brain_update',
            actor: 'system:self-improvement-watcher',
          },
          { profileRoot },
        )
        handle.run(
          `INSERT INTO self_improvement_events (
            id, ts, file_path, change_type, before_checksum,
            after_checksum, routed_to, hunch_id, resolution
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          eventId,
          now(),
          target.path,
          change.change_type,
          change.before_checksum,
          change.after_checksum,
          target.routed_to,
          hunch.ok ? hunch.id : null,
          'pending',
        )
        recordAudit(profile, {
          ts: now(),
          surface: target.routed_to === 'KSG' ? 'wiki' : 'brain',
          actor: 'system:self-improvement-watcher',
          action: 'self_improvement',
          target_type: 'file',
          target_id: target.path,
          version_before: change.before_checksum ?? null,
          version_after: change.after_checksum ?? null,
          reason: `${change.change_type} detected; hunch=${hunch.id ?? '(none)'} routed_to=${target.routed_to}`,
          outcome: 'ok',
          gate_event_id: hunch.gate_event_id,
        }, { profileRoot })
        report.changes.push({
          file_path: target.path,
          change_type: change.change_type,
          routed_to: target.routed_to,
          hunch_id: hunch.id,
          event_id: eventId,
        })
      } catch (err) {
        report.errors.push({
          file_path: target.path,
          error: (err as Error).message,
        })
      }
    }
  } finally {
    handle.close()
  }
  return report
}

function inspectOne(
  handle: ReturnType<typeof openBrain>,
  target: WatchTarget,
): {
  change_type: 'created' | 'modified' | 'deleted'
  before_checksum: string | null
  after_checksum: string | null
} | null {
  const exists = fs.existsSync(target.path)
  const current = exists ? hashFile(target.path) : null

  const last = handle.get<{
    after_checksum: string | null
  }>(
    `SELECT after_checksum FROM self_improvement_events
     WHERE file_path = ? ORDER BY ts DESC LIMIT 1`,
    target.path,
  )

  if (!last) {
    if (!exists) return null // never existed; nothing to do
    return {
      change_type: 'created',
      before_checksum: null,
      after_checksum: current,
    }
  }

  if (!exists && last.after_checksum) {
    return {
      change_type: 'deleted',
      before_checksum: last.after_checksum,
      after_checksum: null,
    }
  }

  if (exists && current !== last.after_checksum) {
    return {
      change_type: 'modified',
      before_checksum: last.after_checksum,
      after_checksum: current,
    }
  }

  return null
}

function hashFile(p: string): string {
  const buf = fs.readFileSync(p)
  return createHash('sha256').update(buf).digest('hex').slice(0, 32)
}

export function listSelfImprovementEvents(
  profile: string,
  options: { profileRoot?: string; limit?: number } = {},
): Array<{
  id: string
  ts: number
  file_path: string
  change_type: string
  routed_to: string
  hunch_id: string | null
  resolution: string | null
}> {
  const handle = openBrain(profile, { profileRoot: options.profileRoot })
  try {
    return handle.all(
      `SELECT id, ts, file_path, change_type, routed_to, hunch_id, resolution
       FROM self_improvement_events
       ORDER BY ts DESC LIMIT ?`,
      options.limit ?? 200,
    )
  } finally {
    handle.close()
  }
}
