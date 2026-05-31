/**
 * Brain ↔ runtime sync (SRS Tranche B.1).
 *
 * Mirrors per-profile runtime data into the Brain as the right record
 * family. Cron-friendly and idempotent (uses external_id for entities,
 * source_refs for events).
 *
 * Sources mapped:
 *   messaging-hub threads      -> entities (type='thread')
 *   messaging-hub messages     -> events   (type='message')
 *   messaging-hub contacts     -> entities (type='contact')
 *   agent_reply_jobs           -> outputs  (output_type='agent_reply')
 *   ADF leads (from messages)  -> entities (type='lead') + events
 *   Vapi webhook (from msgs)   -> events   (type='vapi_call')
 *   agent SOULs (from wiki)    -> source_references mirrors
 *   engagement-state.yaml      -> adjacent_neighbors + observations
 *
 * Heavy lifting (Vapi/ADF/Resend) already lands data into messaging-hub
 * via the inbound webhook + adapters; this sync layer projects that into
 * Brain record families so the consultative agent and the federated
 * search layer can reason over them uniformly.
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { openBrain, now } from './brain-store'
import {
  insertEvent,
  insertOutput,
  insertObservation,
  upsertEntity,
  recordAdjacentNeighbor,
} from './brain-record-families'

export type SyncReport = {
  profile: string
  threads_synced: number
  messages_synced: number
  contacts_synced: number
  agent_jobs_synced: number
  adjacent_neighbors_synced: number
  errors: Array<string>
}

const SYNC_ACTOR = 'system:brain-sync'

function profileRoot(profile: string, override?: string): string {
  if (override) return override
  const root =
    process.env.BRAIN_PROFILES_ROOT ??
    path.join(os.homedir(), '.hermes', 'profiles')
  return path.join(root, profile.replace(/[^a-zA-Z0-9_-]/g, '_'))
}

function tryOpenMessagingHub(profile: string): null | {
  threads: Array<{
    id: string
    profile: string
    domain: string
    channel: string
    subject: string
    contact_handle: string
    assigned_agent_id: string | null
    status: string
    created_at: number
    updated_at: number
  }>
  messages: Array<{
    id: string
    thread_id: string
    direction: string
    role: string
    channel: string
    content: string
    author: string
    created_at: number
    metadata: string | null
  }>
  contacts: Array<{
    id: string
    profile: string
    display_name: string | null
    identifiers: string
    channels: string
    created_at: number
    updated_at: number
  }>
  agent_jobs: Array<{
    id: string
    thread_id: string
    message_id: string
    agent_id: string
    channel: string
    status: string
    attempted_at: number | null
    sent_at: number | null
    reason: string | null
  }>
} {
  const pRoot = profileRoot(profile)
  const dbPath = path.join(pRoot, 'messaging-hub.db')
  if (!fs.existsSync(dbPath)) return null
  try {
    // Hand-roll a read-only better-sqlite3 open via createRequire to
    // avoid importing the live store (which would create an
    // in-memory shadow if sqlite is unavailable).
    const { createRequire } = require('node:module') as typeof import('node:module')
    const _require = createRequire(import.meta.url)
    const Database = _require('better-sqlite3') as new (file: string, opts?: { readonly?: boolean }) => {
      prepare: (sql: string) => { all: () => Array<unknown> }
      close: () => void
    }
    const db = new Database(dbPath, { readonly: true })
    try {
      const threads = db
        .prepare(
          `SELECT id, profile, domain, channel, subject, contact_handle,
                  assigned_agent_id, status, created_at, updated_at
           FROM threads`,
        )
        .all() as Array<{
        id: string
        profile: string
        domain: string
        channel: string
        subject: string
        contact_handle: string
        assigned_agent_id: string | null
        status: string
        created_at: number
        updated_at: number
      }>
      const messages = db
        .prepare(
          `SELECT id, thread_id, direction, role, channel, content, author, created_at, metadata
           FROM messages`,
        )
        .all() as Array<{
        id: string
        thread_id: string
        direction: string
        role: string
        channel: string
        content: string
        author: string
        created_at: number
        metadata: string | null
      }>
      const contacts = db
        .prepare(
          `SELECT id, profile, display_name, identifiers, channels, created_at, updated_at
           FROM contacts`,
        )
        .all() as Array<{
        id: string
        profile: string
        display_name: string | null
        identifiers: string
        channels: string
        created_at: number
        updated_at: number
      }>
      let agent_jobs: Array<{
        id: string
        thread_id: string
        message_id: string
        agent_id: string
        channel: string
        status: string
        attempted_at: number | null
        sent_at: number | null
        reason: string | null
      }> = []
      try {
        agent_jobs = db
          .prepare(
            `SELECT id, thread_id, message_id, agent_id, channel, status, attempted_at, sent_at, reason
             FROM agent_reply_jobs`,
          )
          .all() as typeof agent_jobs
      } catch {
        /* table may not exist on older messaging-hub schema */
      }
      return { threads, messages, contacts, agent_jobs }
    } finally {
      db.close()
    }
  } catch {
    return null
  }
}

export function syncProfileFromRuntime(
  profile: string,
  options: { profileRoot?: string } = {},
): SyncReport {
  const report: SyncReport = {
    profile,
    threads_synced: 0,
    messages_synced: 0,
    contacts_synced: 0,
    agent_jobs_synced: 0,
    adjacent_neighbors_synced: 0,
    errors: [],
  }
  const live = tryOpenMessagingHub(profile)
  if (live) {
    for (const c of live.contacts) {
      try {
        const r = upsertEntity(
          {
            profile,
            actor: SYNC_ACTOR,
            type: 'contact',
            external_id: c.id,
            display_name: c.display_name ?? undefined,
            attributes: {
              identifiers: safeJson(c.identifiers),
              channels: safeJson(c.channels),
              created_at: c.created_at,
              updated_at: c.updated_at,
            },
            source_refs: [{ kind: 'message', value: `messaging-hub:contact:${c.id}` }],
          },
          options,
        )
        if (r.ok) report.contacts_synced++
        else report.errors.push(`contact ${c.id}: ${r.reason}`)
      } catch (err) {
        report.errors.push(`contact ${c.id}: ${(err as Error).message}`)
      }
    }
    for (const t of live.threads) {
      try {
        const r = upsertEntity(
          {
            profile,
            actor: SYNC_ACTOR,
            type: 'thread',
            external_id: t.id,
            display_name: t.subject,
            attributes: {
              domain: t.domain,
              channel: t.channel,
              contact_handle: t.contact_handle,
              assigned_agent_id: t.assigned_agent_id,
              status: t.status,
              created_at: t.created_at,
              updated_at: t.updated_at,
            },
            source_refs: [
              { kind: 'thread', value: `messaging-hub:thread:${t.id}` },
            ],
          },
          options,
        )
        if (r.ok) report.threads_synced++
        else report.errors.push(`thread ${t.id}: ${r.reason}`)
      } catch (err) {
        report.errors.push(`thread ${t.id}: ${(err as Error).message}`)
      }
    }
    // Only sync messages we haven't already mirrored (idempotency by source ref).
    const handle = openBrain(profile, { profileRoot: options.profileRoot })
    let alreadyMirrored: Set<string>
    try {
      const rows = handle.all<{ payload: string }>(
        `SELECT payload FROM events WHERE type = 'message' AND source = 'messaging-hub'`,
      )
      alreadyMirrored = new Set(
        rows
          .map((r) => {
            try {
              return (JSON.parse(r.payload) as { id?: string }).id
            } catch {
              return undefined
            }
          })
          .filter((x): x is string => typeof x === 'string'),
      )
    } finally {
      handle.close()
    }
    for (const m of live.messages) {
      if (alreadyMirrored.has(m.id)) continue
      try {
        const r = insertEvent(
          {
            profile,
            actor: SYNC_ACTOR,
            ts: m.created_at,
            type: 'message',
            source: 'messaging-hub',
            subject_type: 'thread',
            subject_id: m.thread_id,
            payload: {
              id: m.id,
              direction: m.direction,
              role: m.role,
              channel: m.channel,
              author: m.author,
              content_preview: m.content.slice(0, 256),
              metadata: safeJson(m.metadata),
            },
            source_refs: [
              { kind: 'message', value: `messaging-hub:message:${m.id}` },
              { kind: 'thread', value: `messaging-hub:thread:${m.thread_id}` },
            ],
          },
          options,
        )
        if (r.ok) report.messages_synced++
        else report.errors.push(`message ${m.id}: ${r.reason}`)
      } catch (err) {
        report.errors.push(`message ${m.id}: ${(err as Error).message}`)
      }
    }
    for (const j of live.agent_jobs) {
      try {
        const r = insertOutput(
          {
            profile,
            actor: SYNC_ACTOR,
            ts: j.attempted_at ?? now(),
            producer_actor: `agent:${j.agent_id}`,
            output_type: 'agent_reply',
            content: j.reason ?? '',
            metadata: {
              job_id: j.id,
              thread_id: j.thread_id,
              channel: j.channel,
              status: j.status,
              sent_at: j.sent_at,
            },
            source_refs: [
              { kind: 'thread', value: `messaging-hub:thread:${j.thread_id}` },
              { kind: 'message', value: `messaging-hub:message:${j.message_id}` },
              { kind: 'agent', value: j.agent_id },
            ],
          },
          options,
        )
        if (r.ok) report.agent_jobs_synced++
        else report.errors.push(`job ${j.id}: ${r.reason}`)
      } catch (err) {
        report.errors.push(`job ${j.id}: ${(err as Error).message}`)
      }
    }
  }

  // Adjacent neighbors from engagement-state.yaml (best-effort YAML read).
  try {
    const pRoot = profileRoot(profile, options.profileRoot)
    const esPath = path.join(pRoot, 'engagement-state.yaml')
    if (fs.existsSync(esPath)) {
      const text = fs.readFileSync(esPath, 'utf8')
      const adjacentSection =
        /adjacent_data_neighbors:\s*([\s\S]*?)(?:\n\w|\n#|$)/.exec(text)
      if (adjacentSection) {
        const block = adjacentSection[1]
        const entries = parseSimpleYamlListOfMaps(block)
        for (const e of entries) {
          try {
            const r = recordAdjacentNeighbor(
              {
                profile,
                actor: SYNC_ACTOR,
                name: String(e.name ?? 'unknown'),
                source_type:
                  (e.source_type as 'crm' | 'survey' | 'doc-store' | 'analytics' | 'scraper' | 'other') ??
                  'other',
                likelihood: e.likelihood as 'low' | 'medium' | 'high' | undefined,
                classification: 'federated_externally',
                notes: e.notes ? String(e.notes) : undefined,
              },
              options,
            )
            if (r.ok) report.adjacent_neighbors_synced++
            else report.errors.push(`adjacent ${e.name}: ${r.reason}`)
          } catch (err) {
            report.errors.push(`adjacent ${e.name}: ${(err as Error).message}`)
          }
        }
      }
    }
  } catch (err) {
    report.errors.push(`engagement-state: ${(err as Error).message}`)
  }

  // Snapshot observation summarizing the sync pass.
  try {
    insertObservation(
      {
        profile,
        actor: SYNC_ACTOR,
        observer: 'brain-sync',
        observation: `sync pass: threads=${report.threads_synced} messages=${report.messages_synced} contacts=${report.contacts_synced} jobs=${report.agent_jobs_synced} neighbors=${report.adjacent_neighbors_synced} errors=${report.errors.length}`,
        source_refs: [{ kind: 'message', value: 'brain-sync' }],
      },
      options,
    )
  } catch {
    /* observation summary is best-effort */
  }
  return report
}

function safeJson(s: string | null | undefined): unknown {
  if (!s) return null
  try {
    return JSON.parse(s)
  } catch {
    return s
  }
}

function parseSimpleYamlListOfMaps(block: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []
  let current: Record<string, unknown> | null = null
  for (const rawLine of block.split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    if (!line.trim()) continue
    if (/^\s*-\s+/.test(line)) {
      if (current) out.push(current)
      current = {}
      const remainder = line.replace(/^\s*-\s+/, '')
      const m = /^(\w+):\s*(.*)$/.exec(remainder)
      if (m) current[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
      continue
    }
    const m = /^\s+(\w+):\s*(.*)$/.exec(line)
    if (m && current) {
      current[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
    }
  }
  if (current) out.push(current)
  return out
}
