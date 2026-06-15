/**
 * Messaging hub store — per-profile SQLite file.
 *
 * Lives at ~/.hermes/profiles/<profile>/messaging-hub.db so threads,
 * messages, contacts, audiences, campaigns, agent subscriptions, and
 * reply jobs are filesystem-isolated per customer profile.
 *
 * AC.5.1 — Tables created on-demand on first write per profile.
 * AC.5.6 — Contact dedup keys on (profile, channel, handle).
 * AC.5.8 — thread_agent_subscriptions + agent_reply_jobs land here too.
 *
 * Uses better-sqlite3 (sync API; production ssr.external) and falls back
 * to an in-memory map when the native module is unavailable (e.g.
 * a portable test build without native deps) so the API endpoints
 * always respond.
 */

import { createRequire } from 'node:module'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import { publishMessagingEvent } from './messaging-hub-bus'

const _require = createRequire(import.meta.url)

type SqliteDb = import('better-sqlite3').Database

function profilesRoot(): string {
  return join(os.homedir(), '.hermes', 'profiles')
}

export type ThreadStatus = 'open' | 'snoozed' | 'closed'
export type MessageDirection = 'inbound' | 'outbound'
export type MessageRole = 'user' | 'assistant' | 'system'

export type Thread = {
  id: string
  profile: string
  domain: string
  channel: string
  subject: string
  contact_handle: string
  assigned_agent_id: string | null
  status: ThreadStatus
  created_at: number
  updated_at: number
  messages: Array<Message>
}

export type Message = {
  id: string
  thread_id: string
  direction: MessageDirection
  role: MessageRole
  channel: string
  content: string
  author: string
  created_at: number
  metadata: Record<string, unknown>
}

export type Contact = {
  id: string
  profile: string
  display_name: string | null
  identifiers: Record<string, string>
  channels: Array<string>
  created_at: number
  updated_at: number
}

export type AgentSubscription = {
  thread_id: string
  agent_id: string
  profile: string
  channel: string
  mode: 'monitor' | 'reply'
  rules: Record<string, unknown>
  created_at: number
}

export type AgentReplyJob = {
  id: string
  thread_id: string
  message_id: string
  agent_id: string
  channel: string
  status: 'queued' | 'sent' | 'rejected' | 'failed'
  attempted_at: number | null
  sent_at: number | null
  reason: string | null
}

const _dbs = new Map<string, SqliteDb | null>()
const _inMemory = new Map<string, InMemoryStore>()

function dbPath(profile: string): string {
  return join(profilesRoot(), profile, 'messaging-hub.db')
}

function profileDir(profile: string): string {
  return join(profilesRoot(), profile)
}

function ensureProfileDir(profile: string): boolean {
  const dir = profileDir(profile)
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    return true
  } catch {
    return false
  }
}

function getDb(profile: string): SqliteDb | null {
  if (_dbs.has(profile)) return _dbs.get(profile) ?? null
  if (!ensureProfileDir(profile)) {
    _dbs.set(profile, null)
    return null
  }
  try {
    const Database = _require('better-sqlite3') as typeof import('better-sqlite3')
    const db = new Database(dbPath(profile)) as SqliteDb
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = NORMAL')
    db.pragma('foreign_keys = ON')
    db.exec(SCHEMA)
    _dbs.set(profile, db)
    return db
  } catch {
    _dbs.set(profile, null)
    return null
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS threads (
  id                TEXT PRIMARY KEY,
  profile           TEXT NOT NULL,
  domain            TEXT NOT NULL,
  channel           TEXT NOT NULL,
  subject           TEXT NOT NULL,
  contact_handle    TEXT NOT NULL,
  assigned_agent_id TEXT,
  status            TEXT NOT NULL DEFAULT 'open',
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS threads_domain ON threads(profile, domain, updated_at DESC);
CREATE INDEX IF NOT EXISTS threads_contact ON threads(profile, contact_handle);

CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,
  thread_id   TEXT NOT NULL,
  direction   TEXT NOT NULL,
  role        TEXT NOT NULL,
  channel     TEXT NOT NULL,
  content     TEXT NOT NULL,
  author      TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  metadata    TEXT,
  FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS messages_thread ON messages(thread_id, created_at);

CREATE TABLE IF NOT EXISTS contacts (
  id           TEXT PRIMARY KEY,
  profile      TEXT NOT NULL,
  display_name TEXT,
  identifiers  TEXT NOT NULL,
  channels     TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS contacts_profile ON contacts(profile);

CREATE TABLE IF NOT EXISTS contact_identities (
  profile     TEXT NOT NULL,
  channel     TEXT NOT NULL,
  handle      TEXT NOT NULL,
  contact_id  TEXT NOT NULL,
  PRIMARY KEY (profile, channel, handle),
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audiences (
  id          TEXT PRIMARY KEY,
  profile     TEXT NOT NULL,
  name        TEXT NOT NULL,
  query       TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS campaigns (
  id               TEXT PRIMARY KEY,
  profile          TEXT NOT NULL,
  audience_id      TEXT NOT NULL,
  channel          TEXT NOT NULL,
  message_template TEXT NOT NULL,
  schedule         INTEGER,
  status           TEXT NOT NULL DEFAULT 'draft',
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  template         TEXT
);

CREATE TABLE IF NOT EXISTS campaign_deliveries (
  id           TEXT PRIMARY KEY,
  campaign_id  TEXT NOT NULL,
  contact_id   TEXT NOT NULL,
  thread_id    TEXT,
  status       TEXT NOT NULL,
  sent_at      INTEGER,
  error        TEXT,
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS thread_agent_subscriptions (
  thread_id   TEXT NOT NULL,
  agent_id    TEXT NOT NULL,
  profile     TEXT NOT NULL,
  channel     TEXT NOT NULL,
  mode        TEXT NOT NULL,
  rules       TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (thread_id, agent_id, channel)
);

CREATE TABLE IF NOT EXISTS agent_reply_jobs (
  id           TEXT PRIMARY KEY,
  thread_id    TEXT NOT NULL,
  message_id   TEXT NOT NULL,
  agent_id     TEXT NOT NULL,
  channel      TEXT NOT NULL,
  status       TEXT NOT NULL,
  attempted_at INTEGER,
  sent_at      INTEGER,
  reason       TEXT
);
CREATE INDEX IF NOT EXISTS agent_reply_jobs_status ON agent_reply_jobs(status, attempted_at);

CREATE TABLE IF NOT EXISTS lead_flow (
  profile     TEXT PRIMARY KEY,
  enabled     INTEGER NOT NULL DEFAULT 0,
  steps       TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS flow_enrollments (
  id                TEXT PRIMARY KEY,
  profile           TEXT NOT NULL,
  contact_key       TEXT NOT NULL,
  handles           TEXT NOT NULL,
  first_name        TEXT,
  vehicle           TEXT,
  dealer            TEXT,
  step_index        INTEGER NOT NULL,
  last_step_sent_at INTEGER,
  next_due_at       INTEGER,
  status            TEXT NOT NULL DEFAULT 'active',
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS flow_enrollments_active ON flow_enrollments(profile, status, next_due_at);
CREATE INDEX IF NOT EXISTS flow_enrollments_contact ON flow_enrollments(profile, contact_key, status);

CREATE TABLE IF NOT EXISTS lead_notify_log (
  profile        TEXT NOT NULL,
  notify_key     TEXT NOT NULL,
  last_notified  INTEGER NOT NULL,
  PRIMARY KEY (profile, notify_key)
);
`

// ─── In-memory fallback ─────────────────────────────────────────────────────

type InMemoryStore = {
  threads: Map<string, Thread>
  contacts: Map<string, Contact>
  identityIndex: Map<string, string> // `${channel}::${handle}` -> contact_id
  audiences: Map<string, { id: string; profile: string; name: string; query: Record<string, unknown>; created_at: number }>
  campaigns: Map<string, {
    id: string
    profile: string
    audience_id: string
    channel: string
    message_template: string
    schedule: number | null
    status: string
    template: string | null
    created_at: number
    updated_at: number
  }>
  subscriptions: Map<string, AgentSubscription>
  replyJobs: Map<string, AgentReplyJob>
  deliveries: Map<string, { id: string; campaign_id: string; contact_id: string; thread_id: string | null; status: string; sent_at: number | null; error: string | null }>
  leadFlow: LeadFlowRow | null
  enrollments: Map<string, FlowEnrollment>
  notifyLog: Map<string, number> // notify_key -> last_notified ms
}

function getStore(profile: string): InMemoryStore {
  let s = _inMemory.get(profile)
  if (!s) {
    s = {
      threads: new Map(),
      contacts: new Map(),
      identityIndex: new Map(),
      audiences: new Map(),
      campaigns: new Map(),
      subscriptions: new Map(),
      replyJobs: new Map(),
      deliveries: new Map(),
      leadFlow: null,
      enrollments: new Map(),
      notifyLog: new Map(),
    }
    _inMemory.set(profile, s)
  }
  return s
}

// ─── Threads ───────────────────────────────────────────────────────────────

export function getOrCreateThread(input: {
  profile: string
  domain: string
  channel: string
  existing_thread_id?: string
  subject?: string
  contact_handle: string
  assigned_agent_id?: string | null
}): Thread {
  return getOrCreateThreadEx(input).thread
}

/**
 * Like {@link getOrCreateThread} but also reports whether the thread was newly
 * created (`created: true`) vs. an existing open thread reused (`created:
 * false`). Inbound lead paths use this to fire a dealer notification ONLY on a
 * brand-new thread (a new lead) instead of on every message in an ongoing
 * conversation — which would spam the BDC.
 */
export function getOrCreateThreadEx(input: {
  profile: string
  domain: string
  channel: string
  existing_thread_id?: string
  subject?: string
  contact_handle: string
  assigned_agent_id?: string | null
}): { thread: Thread; created: boolean } {
  const now = Date.now()
  const db = getDb(input.profile)

  if (input.existing_thread_id) {
    const found = getThread(input.profile, input.existing_thread_id)
    if (found) return { thread: found, created: false }
  }

  // Try to reuse the most-recent open thread for this contact_handle+channel
  // (so multi-turn chats stay on one thread by default).
  const reuse = findOpenThreadFor(input.profile, {
    contact_handle: input.contact_handle,
    channel: input.channel,
    domain: input.domain,
  })
  if (reuse) return { thread: reuse, created: false }

  const thread: Thread = {
    id: randomUUID(),
    profile: input.profile,
    domain: input.domain,
    channel: input.channel,
    subject: input.subject ?? `${input.channel} · ${input.contact_handle}`,
    contact_handle: input.contact_handle,
    assigned_agent_id: input.assigned_agent_id ?? null,
    status: 'open',
    created_at: now,
    updated_at: now,
    messages: [],
  }
  if (db) {
    db.prepare(
      `INSERT INTO threads(id,profile,domain,channel,subject,contact_handle,assigned_agent_id,status,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      thread.id,
      thread.profile,
      thread.domain,
      thread.channel,
      thread.subject,
      thread.contact_handle,
      thread.assigned_agent_id,
      thread.status,
      thread.created_at,
      thread.updated_at,
    )
  } else {
    getStore(input.profile).threads.set(thread.id, thread)
  }
  // Auto-create contact for this handle so it shows up in /api/messaging/contacts.
  upsertContact({
    profile: input.profile,
    display_name: null,
    identifiers: { [input.channel]: input.contact_handle },
  })
  publishMessagingEvent(input.profile, {
    type: 'thread_created',
    thread_id: thread.id,
    domain: thread.domain,
    channel: thread.channel,
  })
  return { thread, created: true }
}

/**
 * Anti-spam ledger for new-lead notifications. `wasLeadNotifiedWithin` is a
 * read-only check: true if a notification for (profile, key) fired within
 * `cooldownMs`. `recordLeadNotify` stamps a successful send. Split so the
 * cooldown is consumed ONLY on a real send — a failed/unconfigured notify never
 * locks out future alerts. cooldownMs <= 0 disables the check.
 */
export function wasLeadNotifiedWithin(
  profile: string,
  key: string,
  cooldownMs: number,
  now: number = Date.now(),
): boolean {
  if (cooldownMs <= 0) return false
  const db = getDb(profile)
  if (db) {
    const row = db
      .prepare(
        `SELECT last_notified FROM lead_notify_log WHERE profile=? AND notify_key=?`,
      )
      .get(profile, key) as { last_notified: number } | undefined
    return row !== undefined && now - row.last_notified < cooldownMs
  }
  const last = getStore(profile).notifyLog.get(key)
  return last !== undefined && now - last < cooldownMs
}

export function recordLeadNotify(
  profile: string,
  key: string,
  now: number = Date.now(),
): void {
  const db = getDb(profile)
  if (db) {
    db.prepare(
      `INSERT INTO lead_notify_log(profile, notify_key, last_notified) VALUES(?,?,?)
       ON CONFLICT(profile, notify_key) DO UPDATE SET last_notified=excluded.last_notified`,
    ).run(profile, key, now)
    return
  }
  getStore(profile).notifyLog.set(key, now)
}

function findOpenThreadFor(
  profile: string,
  q: { contact_handle: string; channel: string; domain: string },
): Thread | null {
  const db = getDb(profile)
  if (db) {
    const row = db
      .prepare(
        `SELECT id FROM threads
         WHERE profile=? AND contact_handle=? AND channel=? AND domain=? AND status='open'
         ORDER BY updated_at DESC LIMIT 1`,
      )
      .get(profile, q.contact_handle, q.channel, q.domain) as
      | { id: string }
      | undefined
    if (!row) return null
    return getThread(profile, row.id)
  }
  const store = getStore(profile)
  for (const thread of [...store.threads.values()].reverse()) {
    if (
      thread.status === 'open' &&
      thread.contact_handle === q.contact_handle &&
      thread.channel === q.channel &&
      thread.domain === q.domain
    )
      return thread
  }
  return null
}

export function getThread(profile: string, id: string): Thread | null {
  const db = getDb(profile)
  if (db) {
    const row = db
      .prepare(`SELECT * FROM threads WHERE id=?`)
      .get(id) as
      | {
          id: string
          profile: string
          domain: string
          channel: string
          subject: string
          contact_handle: string
          assigned_agent_id: string | null
          status: ThreadStatus
          created_at: number
          updated_at: number
        }
      | undefined
    if (!row) return null
    const msgRows = db
      .prepare(
        `SELECT id, thread_id, direction, role, channel, content, author, created_at, metadata FROM messages WHERE thread_id=? ORDER BY created_at`,
      )
      .all(id) as Array<{
      id: string
      thread_id: string
      direction: MessageDirection
      role: MessageRole
      channel: string
      content: string
      author: string
      created_at: number
      metadata: string | null
    }>
    const messages = msgRows.map<Message>((m) => ({
      id: m.id,
      thread_id: m.thread_id,
      direction: m.direction,
      role: m.role,
      channel: m.channel,
      content: m.content,
      author: m.author,
      created_at: m.created_at,
      metadata: m.metadata ? safeJson(m.metadata) : {},
    }))
    return { ...row, messages }
  }
  return getStore(profile).threads.get(id) ?? null
}

export function listThreads(opts: {
  profile: string
  domain?: string
  channel?: string
  status?: ThreadStatus
  limit?: number
}): Array<Thread> {
  const limit = opts.limit ?? 100
  const db = getDb(opts.profile)
  if (db) {
    const where: Array<string> = ['profile=?']
    const params: Array<string> = [opts.profile]
    if (opts.domain) {
      where.push('domain=?')
      params.push(opts.domain)
    }
    if (opts.channel) {
      where.push('channel=?')
      params.push(opts.channel)
    }
    if (opts.status) {
      where.push('status=?')
      params.push(opts.status)
    }
    const rows = db
      .prepare(
        `SELECT id FROM threads WHERE ${where.join(' AND ')} ORDER BY updated_at DESC LIMIT ?`,
      )
      .all(...params, limit) as Array<{ id: string }>
    return rows
      .map((r) => getThread(opts.profile, r.id))
      .filter((t): t is Thread => t !== null)
  }
  const store = getStore(opts.profile)
  return [...store.threads.values()]
    .filter((t) => (opts.domain ? t.domain === opts.domain : true))
    .filter((t) => (opts.channel ? t.channel === opts.channel : true))
    .filter((t) => (opts.status ? t.status === opts.status : true))
    .sort((a, b) => b.updated_at - a.updated_at)
    .slice(0, limit)
}

export function setThreadStatus(
  profile: string,
  id: string,
  status: ThreadStatus,
): void {
  const now = Date.now()
  const db = getDb(profile)
  if (db) {
    db.prepare(`UPDATE threads SET status=?, updated_at=? WHERE id=?`).run(
      status,
      now,
      id,
    )
  } else {
    const t = getStore(profile).threads.get(id)
    if (t) {
      t.status = status
      t.updated_at = now
    }
  }
  publishMessagingEvent(profile, {
    type: 'thread_status_changed',
    thread_id: id,
    status,
  })
}

// ─── Messages ──────────────────────────────────────────────────────────────

export function appendMessage(input: {
  thread_id: string
  direction: MessageDirection
  role: MessageRole
  channel: string
  content: string
  author: string
  metadata?: Record<string, unknown>
}): Message {
  const message: Message = {
    id: randomUUID(),
    thread_id: input.thread_id,
    direction: input.direction,
    role: input.role,
    channel: input.channel,
    content: input.content,
    author: input.author,
    created_at: Date.now(),
    metadata: input.metadata ?? {},
  }
  // We don't know the profile in this scope without scanning. The thread
  // row holds it; resolve via getDb by listing each profile is expensive,
  // so we require callers to ensure the thread exists in their profile's
  // db. Practically, we look up by id across all open dbs and the in-mem
  // store; falling back to scanning profiles directory.
  const profile = resolveProfileForThread(input.thread_id)
  if (!profile) {
    throw new Error(`Thread ${input.thread_id} not found in any profile.`)
  }
  const db = getDb(profile)
  if (db) {
    db.prepare(
      `INSERT INTO messages(id,thread_id,direction,role,channel,content,author,created_at,metadata) VALUES(?,?,?,?,?,?,?,?,?)`,
    ).run(
      message.id,
      message.thread_id,
      message.direction,
      message.role,
      message.channel,
      message.content,
      message.author,
      message.created_at,
      JSON.stringify(message.metadata),
    )
    db.prepare(`UPDATE threads SET updated_at=? WHERE id=?`).run(
      message.created_at,
      message.thread_id,
    )
  } else {
    const t = getStore(profile).threads.get(input.thread_id)
    if (!t) throw new Error(`Thread ${input.thread_id} missing in fallback store.`)
    t.messages.push(message)
    t.updated_at = message.created_at
  }
  publishMessagingEvent(profile, {
    type: 'message_appended',
    thread_id: message.thread_id,
    message_id: message.id,
    direction: message.direction,
    channel: message.channel,
  })
  return message
}

function resolveProfileForThread(threadId: string): string | null {
  // Try in-memory stores first
  for (const [profile, store] of _inMemory) {
    if (store.threads.has(threadId)) return profile
  }
  // Try cached dbs
  for (const [profile, db] of _dbs) {
    if (!db) continue
    const row = db
      .prepare(`SELECT profile FROM threads WHERE id=?`)
      .get(threadId) as { profile: string } | undefined
    if (row) return row.profile
  }
  return null
}

function safeJson(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s) as Record<string, unknown>
  } catch {
    return {}
  }
}

// ─── Contacts ──────────────────────────────────────────────────────────────

export function upsertContact(input: {
  profile: string
  display_name: string | null
  identifiers: Record<string, string>
}): Contact {
  const db = getDb(input.profile)
  const channels = Object.keys(input.identifiers)
  // Match by any existing identifier
  const matchId = findContactByIdentifiers(input.profile, input.identifiers)
  const now = Date.now()
  if (matchId) {
    const existing = getContact(input.profile, matchId)
    if (existing) {
      const mergedIdentifiers = {
        ...existing.identifiers,
        ...input.identifiers,
      }
      const mergedChannels = Array.from(
        new Set([...existing.channels, ...channels]),
      )
      const merged: Contact = {
        ...existing,
        display_name: input.display_name ?? existing.display_name,
        identifiers: mergedIdentifiers,
        channels: mergedChannels,
        updated_at: now,
      }
      if (db) {
        db.prepare(
          `UPDATE contacts SET display_name=?, identifiers=?, channels=?, updated_at=? WHERE id=?`,
        ).run(
          merged.display_name,
          JSON.stringify(merged.identifiers),
          JSON.stringify(merged.channels),
          merged.updated_at,
          merged.id,
        )
        for (const [channel, handle] of Object.entries(input.identifiers)) {
          db.prepare(
            `INSERT OR IGNORE INTO contact_identities(profile,channel,handle,contact_id) VALUES(?,?,?,?)`,
          ).run(input.profile, channel, handle, merged.id)
        }
      } else {
        getStore(input.profile).contacts.set(merged.id, merged)
        for (const [channel, handle] of Object.entries(input.identifiers)) {
          getStore(input.profile).identityIndex.set(
            `${channel}::${handle}`,
            merged.id,
          )
        }
      }
      return merged
    }
  }
  const contact: Contact = {
    id: randomUUID(),
    profile: input.profile,
    display_name: input.display_name,
    identifiers: input.identifiers,
    channels,
    created_at: now,
    updated_at: now,
  }
  if (db) {
    db.prepare(
      `INSERT INTO contacts(id,profile,display_name,identifiers,channels,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`,
    ).run(
      contact.id,
      contact.profile,
      contact.display_name,
      JSON.stringify(contact.identifiers),
      JSON.stringify(contact.channels),
      contact.created_at,
      contact.updated_at,
    )
    for (const [channel, handle] of Object.entries(input.identifiers)) {
      db.prepare(
        `INSERT OR REPLACE INTO contact_identities(profile,channel,handle,contact_id) VALUES(?,?,?,?)`,
      ).run(input.profile, channel, handle, contact.id)
    }
  } else {
    getStore(input.profile).contacts.set(contact.id, contact)
    for (const [channel, handle] of Object.entries(input.identifiers)) {
      getStore(input.profile).identityIndex.set(
        `${channel}::${handle}`,
        contact.id,
      )
    }
  }
  return contact
}

function findContactByIdentifiers(
  profile: string,
  identifiers: Record<string, string>,
): string | null {
  const db = getDb(profile)
  if (db) {
    for (const [channel, handle] of Object.entries(identifiers)) {
      const row = db
        .prepare(
          `SELECT contact_id FROM contact_identities WHERE profile=? AND channel=? AND handle=?`,
        )
        .get(profile, channel, handle) as { contact_id: string } | undefined
      if (row) return row.contact_id
    }
    return null
  }
  const store = getStore(profile)
  for (const [channel, handle] of Object.entries(identifiers)) {
    const id = store.identityIndex.get(`${channel}::${handle}`)
    if (id) return id
  }
  return null
}

export function getContact(profile: string, id: string): Contact | null {
  const db = getDb(profile)
  if (db) {
    const row = db
      .prepare(`SELECT * FROM contacts WHERE id=?`)
      .get(id) as
      | {
          id: string
          profile: string
          display_name: string | null
          identifiers: string
          channels: string
          created_at: number
          updated_at: number
        }
      | undefined
    if (!row) return null
    return {
      ...row,
      identifiers: safeJson(row.identifiers) as Record<string, string>,
      channels: (safeJson(`{"v":${row.channels}}`).v as Array<string>) ?? [],
    }
  }
  return getStore(profile).contacts.get(id) ?? null
}

export function listContacts(profile: string): Array<Contact> {
  const db = getDb(profile)
  if (db) {
    const rows = db
      .prepare(`SELECT id FROM contacts WHERE profile=? ORDER BY updated_at DESC`)
      .all(profile) as Array<{ id: string }>
    return rows
      .map((r) => getContact(profile, r.id))
      .filter((c): c is Contact => c !== null)
  }
  return [...getStore(profile).contacts.values()].sort(
    (a, b) => b.updated_at - a.updated_at,
  )
}

// ─── Audiences + Campaigns ─────────────────────────────────────────────────

export function createAudience(input: {
  profile: string
  name: string
  query: Record<string, unknown>
}): { id: string; profile: string; name: string; query: Record<string, unknown>; created_at: number } {
  const audience = {
    id: randomUUID(),
    profile: input.profile,
    name: input.name,
    query: input.query,
    created_at: Date.now(),
  }
  const db = getDb(input.profile)
  if (db) {
    db.prepare(
      `INSERT INTO audiences(id,profile,name,query,created_at) VALUES(?,?,?,?,?)`,
    ).run(
      audience.id,
      audience.profile,
      audience.name,
      JSON.stringify(audience.query),
      audience.created_at,
    )
  } else {
    getStore(input.profile).audiences.set(audience.id, audience)
  }
  return audience
}

export function listAudiences(profile: string): Array<{
  id: string
  profile: string
  name: string
  query: Record<string, unknown>
  created_at: number
}> {
  const db = getDb(profile)
  if (db) {
    const rows = db
      .prepare(`SELECT * FROM audiences WHERE profile=? ORDER BY created_at DESC`)
      .all(profile) as Array<{
      id: string
      profile: string
      name: string
      query: string
      created_at: number
    }>
    return rows.map((r) => ({
      id: r.id,
      profile: r.profile,
      name: r.name,
      query: safeJson(r.query),
      created_at: r.created_at,
    }))
  }
  return [...getStore(profile).audiences.values()].sort(
    (a, b) => b.created_at - a.created_at,
  )
}

export function getAudience(
  profile: string,
  id: string,
): { id: string; profile: string; name: string; query: Record<string, unknown>; created_at: number } | null {
  return listAudiences(profile).find((a) => a.id === id) ?? null
}

export type Campaign = {
  id: string
  profile: string
  audience_id: string
  channel: string
  message_template: string
  schedule: number | null
  status: 'draft' | 'scheduled' | 'in_progress' | 'complete' | 'failed'
  template: string | null
  created_at: number
  updated_at: number
}

export function createCampaign(input: {
  profile: string
  audience_id: string
  channel: string
  message_template: string
  schedule?: number | null
  template?: string | null
}): Campaign {
  const now = Date.now()
  const campaign: Campaign = {
    id: randomUUID(),
    profile: input.profile,
    audience_id: input.audience_id,
    channel: input.channel,
    message_template: input.message_template,
    schedule: input.schedule ?? null,
    status: input.schedule ? 'scheduled' : 'draft',
    template: input.template ?? null,
    created_at: now,
    updated_at: now,
  }
  const db = getDb(input.profile)
  if (db) {
    db.prepare(
      `INSERT INTO campaigns(id,profile,audience_id,channel,message_template,schedule,status,template,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      campaign.id,
      campaign.profile,
      campaign.audience_id,
      campaign.channel,
      campaign.message_template,
      campaign.schedule,
      campaign.status,
      campaign.template,
      campaign.created_at,
      campaign.updated_at,
    )
  } else {
    getStore(input.profile).campaigns.set(campaign.id, campaign)
  }
  return campaign
}

export function listCampaigns(profile: string): Array<Campaign> {
  const db = getDb(profile)
  if (db) {
    const rows = db
      .prepare(`SELECT * FROM campaigns WHERE profile=? ORDER BY created_at DESC`)
      .all(profile) as Array<Campaign>
    return rows
  }
  return [...getStore(profile).campaigns.values()].sort(
    (a, b) => b.created_at - a.created_at,
  ) as Array<Campaign>
}

export function getCampaign(profile: string, id: string): Campaign | null {
  return listCampaigns(profile).find((c) => c.id === id) ?? null
}

export function updateCampaign(
  profile: string,
  id: string,
  input: {
    audience_id: string
    channel: string
    message_template: string
    schedule?: number | null
    template?: string | null
  },
): Campaign | null {
  const existing = getCampaign(profile, id)
  if (!existing) return null
  const now = Date.now()
  const updated: Campaign = {
    ...existing,
    audience_id: input.audience_id,
    channel: input.channel,
    message_template: input.message_template,
    schedule: input.schedule ?? null,
    status: input.schedule ? 'scheduled' : 'draft',
    template: input.template ?? null,
    updated_at: now,
  }
  const db = getDb(profile)
  if (db) {
    db.prepare(
      `UPDATE campaigns SET audience_id=?, channel=?, message_template=?, schedule=?, status=?, template=?, updated_at=? WHERE id=? AND profile=?`,
    ).run(
      updated.audience_id,
      updated.channel,
      updated.message_template,
      updated.schedule,
      updated.status,
      updated.template,
      updated.updated_at,
      id,
      profile,
    )
  } else {
    getStore(profile).campaigns.set(id, updated)
  }
  return updated
}

export function updateCampaignStatus(
  profile: string,
  id: string,
  status: Campaign['status'],
): void {
  const now = Date.now()
  const db = getDb(profile)
  if (db) {
    db.prepare(`UPDATE campaigns SET status=?, updated_at=? WHERE id=?`).run(
      status,
      now,
      id,
    )
  } else {
    const c = getStore(profile).campaigns.get(id)
    if (c) {
      c.status = status
      c.updated_at = now
    }
  }
}

export function recordCampaignDelivery(input: {
  profile: string
  campaign_id: string
  contact_id: string
  thread_id: string | null
  status: 'sent' | 'failed'
  error?: string | null
}): void {
  const id = randomUUID()
  const now = Date.now()
  const db = getDb(input.profile)
  if (db) {
    db.prepare(
      `INSERT INTO campaign_deliveries(id,campaign_id,contact_id,thread_id,status,sent_at,error) VALUES(?,?,?,?,?,?,?)`,
    ).run(
      id,
      input.campaign_id,
      input.contact_id,
      input.thread_id,
      input.status,
      input.status === 'sent' ? now : null,
      input.error ?? null,
    )
  } else {
    getStore(input.profile).deliveries.set(id, {
      id,
      campaign_id: input.campaign_id,
      contact_id: input.contact_id,
      thread_id: input.thread_id,
      status: input.status,
      sent_at: input.status === 'sent' ? now : null,
      error: input.error ?? null,
    })
  }
}

export function listCampaignDeliveries(
  profile: string,
  campaignId: string,
): Array<{
  id: string
  campaign_id: string
  contact_id: string
  thread_id: string | null
  status: string
  sent_at: number | null
  error: string | null
}> {
  const db = getDb(profile)
  if (db) {
    return db
      .prepare(`SELECT * FROM campaign_deliveries WHERE campaign_id=?`)
      .all(campaignId) as Array<{
      id: string
      campaign_id: string
      contact_id: string
      thread_id: string | null
      status: string
      sent_at: number | null
      error: string | null
    }>
  }
  return [...getStore(profile).deliveries.values()].filter(
    (d) => d.campaign_id === campaignId,
  )
}

// ─── Agent subscriptions + reply jobs (AC.5.8) ──────────────────────────────

export function subscribeAgentToThread(input: AgentSubscription): void {
  const db = getDb(input.profile)
  if (db) {
    db.prepare(
      `INSERT OR REPLACE INTO thread_agent_subscriptions(thread_id,agent_id,profile,channel,mode,rules,created_at) VALUES(?,?,?,?,?,?,?)`,
    ).run(
      input.thread_id,
      input.agent_id,
      input.profile,
      input.channel,
      input.mode,
      JSON.stringify(input.rules),
      input.created_at,
    )
  } else {
    getStore(input.profile).subscriptions.set(
      `${input.thread_id}::${input.agent_id}::${input.channel}`,
      input,
    )
  }
}

export function listSubscriptionsForThread(
  profile: string,
  threadId: string,
): Array<AgentSubscription> {
  const db = getDb(profile)
  if (db) {
    const rows = db
      .prepare(`SELECT * FROM thread_agent_subscriptions WHERE thread_id=?`)
      .all(threadId) as Array<{
      thread_id: string
      agent_id: string
      profile: string
      channel: string
      mode: 'monitor' | 'reply'
      rules: string
      created_at: number
    }>
    return rows.map((r) => ({
      ...r,
      rules: safeJson(r.rules),
    }))
  }
  return [...getStore(profile).subscriptions.values()].filter(
    (s) => s.thread_id === threadId,
  )
}

export function enqueueAgentReplyJob(input: {
  thread_id: string
  message_id: string
  agent_id: string
  channel: string
  profile: string
}): AgentReplyJob {
  const job: AgentReplyJob = {
    id: randomUUID(),
    thread_id: input.thread_id,
    message_id: input.message_id,
    agent_id: input.agent_id,
    channel: input.channel,
    status: 'queued',
    attempted_at: null,
    sent_at: null,
    reason: null,
  }
  const db = getDb(input.profile)
  if (db) {
    db.prepare(
      `INSERT INTO agent_reply_jobs(id,thread_id,message_id,agent_id,channel,status,attempted_at,sent_at,reason) VALUES(?,?,?,?,?,?,?,?,?)`,
    ).run(
      job.id,
      job.thread_id,
      job.message_id,
      job.agent_id,
      job.channel,
      job.status,
      job.attempted_at,
      job.sent_at,
      job.reason,
    )
  } else {
    getStore(input.profile).replyJobs.set(job.id, job)
  }
  return job
}

export function updateReplyJob(
  profile: string,
  id: string,
  patch: Partial<Pick<AgentReplyJob, 'status' | 'attempted_at' | 'sent_at' | 'reason'>>,
): void {
  const db = getDb(profile)
  if (db) {
    const sets: Array<string> = []
    const vals: Array<unknown> = []
    if (patch.status !== undefined) {
      sets.push('status=?')
      vals.push(patch.status)
    }
    if (patch.attempted_at !== undefined) {
      sets.push('attempted_at=?')
      vals.push(patch.attempted_at)
    }
    if (patch.sent_at !== undefined) {
      sets.push('sent_at=?')
      vals.push(patch.sent_at)
    }
    if (patch.reason !== undefined) {
      sets.push('reason=?')
      vals.push(patch.reason)
    }
    if (sets.length === 0) return
    vals.push(id)
    db.prepare(
      `UPDATE agent_reply_jobs SET ${sets.join(', ')} WHERE id=?`,
    ).run(...vals)
  } else {
    const j = getStore(profile).replyJobs.get(id)
    if (j) Object.assign(j, patch)
  }
}

export function listQueuedReplyJobs(profile: string): Array<AgentReplyJob> {
  const db = getDb(profile)
  if (db) {
    return db
      .prepare(
        `SELECT * FROM agent_reply_jobs WHERE status='queued' ORDER BY id`,
      )
      .all() as Array<AgentReplyJob>
  }
  return [...getStore(profile).replyJobs.values()].filter(
    (j) => j.status === 'queued',
  )
}

// ─── Report aggregates (P3 native reports) ──────────────────────────────────
//
// Read-only rollups over the per-profile store. Mirror the Nexxus Insights
// model (hardcoded queries over the local store) but against Studio's own
// messaging-hub.db. Both the SQLite and in-memory paths return identical
// shapes so portable test builds and production behave the same.

export type MessageStats = {
  total: number
  inbound: number
  outbound: number
  by_channel: Record<string, { inbound: number; outbound: number }>
}

export type ThreadStats = {
  total: number
  open: number
  closed: number
  by_domain: Record<string, number>
}

export type CampaignStats = {
  campaigns: number
  by_status: Record<string, number>
  deliveries_sent: number
  deliveries_failed: number
}

/**
 * Message volume rollup. `sinceMs` (epoch ms) optionally bounds to a recent
 * window (created_at >= sinceMs); omit for all-time.
 */
export function aggregateMessages(profile: string, sinceMs?: number): MessageStats {
  const stats: MessageStats = { total: 0, inbound: 0, outbound: 0, by_channel: {} }
  const tally = (direction: string, channel: string) => {
    stats.total += 1
    if (direction === 'inbound') stats.inbound += 1
    else if (direction === 'outbound') stats.outbound += 1
    const ch = (stats.by_channel[channel] ??= { inbound: 0, outbound: 0 })
    if (direction === 'inbound') ch.inbound += 1
    else if (direction === 'outbound') ch.outbound += 1
  }
  const db = getDb(profile)
  if (db) {
    const rows = db
      .prepare(
        `SELECT direction, channel FROM messages${sinceMs ? ' WHERE created_at >= ?' : ''}`,
      )
      .all(...(sinceMs ? [sinceMs] : [])) as Array<{ direction: string; channel: string }>
    for (const r of rows) tally(r.direction, r.channel)
    return stats
  }
  for (const thread of getStore(profile).threads.values()) {
    for (const m of thread.messages) {
      if (sinceMs && m.created_at < sinceMs) continue
      tally(m.direction, m.channel)
    }
  }
  return stats
}

/** Thread rollup: total / open / closed and a sales-vs-service domain split. */
export function aggregateThreads(profile: string): ThreadStats {
  const stats: ThreadStats = { total: 0, open: 0, closed: 0, by_domain: {} }
  const tally = (status: string, domain: string) => {
    stats.total += 1
    if (status === 'open') stats.open += 1
    else if (status === 'closed') stats.closed += 1
    stats.by_domain[domain] = (stats.by_domain[domain] ?? 0) + 1
  }
  const db = getDb(profile)
  if (db) {
    const rows = db
      .prepare(`SELECT status, domain FROM threads WHERE profile=?`)
      .all(profile) as Array<{ status: string; domain: string }>
    for (const r of rows) tally(r.status, r.domain)
    return stats
  }
  for (const t of getStore(profile).threads.values()) tally(t.status, t.domain)
  return stats
}

/**
 * Per-store performance rollup — the Dashboard backend. Read-only over the
 * existing threads + messages tables for a profile. Groups thread (lead) counts
 * and message counts by channel and by domain/type (sales/service), with
 * aggregate totals. `sinceMs` (epoch ms) optionally bounds threads/messages to
 * a recent window (created_at >= sinceMs); omit for all-time.
 *
 * Mirrors `aggregateMessages` / `aggregateThreads` (same SQL/in-memory dual
 * path), combined into one pass so the Dashboard can switch views client-side
 * without re-querying.
 */
export type PerformanceStats = {
  /** Threads = leads. */
  threads: {
    total: number
    by_channel: Record<string, number>
    by_domain: Record<string, number>
  }
  messages: {
    total: number
    by_channel: Record<string, number>
    by_domain: Record<string, number>
  }
}

export function aggregatePerformance(
  profile: string,
  sinceMs?: number,
): PerformanceStats {
  const stats: PerformanceStats = {
    threads: { total: 0, by_channel: {}, by_domain: {} },
    messages: { total: 0, by_channel: {}, by_domain: {} },
  }
  const tallyThread = (channel: string, domain: string) => {
    stats.threads.total += 1
    stats.threads.by_channel[channel] =
      (stats.threads.by_channel[channel] ?? 0) + 1
    stats.threads.by_domain[domain] =
      (stats.threads.by_domain[domain] ?? 0) + 1
  }
  const tallyMessage = (channel: string, domain: string) => {
    stats.messages.total += 1
    stats.messages.by_channel[channel] =
      (stats.messages.by_channel[channel] ?? 0) + 1
    stats.messages.by_domain[domain] =
      (stats.messages.by_domain[domain] ?? 0) + 1
  }
  const db = getDb(profile)
  if (db) {
    const threadRows = db
      .prepare(
        `SELECT channel, domain FROM threads WHERE profile=?${
          sinceMs ? ' AND created_at >= ?' : ''
        }`,
      )
      .all(...(sinceMs ? [profile, sinceMs] : [profile])) as Array<{
      channel: string
      domain: string
    }>
    for (const r of threadRows) tallyThread(r.channel, r.domain)
    // Message domain comes from the parent thread (messages carry channel, not
    // domain), so join to threads for the sales/service split.
    const msgRows = db
      .prepare(
        `SELECT m.channel AS channel, t.domain AS domain
           FROM messages m JOIN threads t ON t.id = m.thread_id
          WHERE t.profile=?${sinceMs ? ' AND m.created_at >= ?' : ''}`,
      )
      .all(...(sinceMs ? [profile, sinceMs] : [profile])) as Array<{
      channel: string
      domain: string
    }>
    for (const r of msgRows) tallyMessage(r.channel, r.domain)
    return stats
  }
  for (const t of getStore(profile).threads.values()) {
    if (sinceMs && t.created_at < sinceMs) continue
    tallyThread(t.channel, t.domain)
    for (const m of t.messages) {
      if (sinceMs && m.created_at < sinceMs) continue
      tallyMessage(m.channel, t.domain)
    }
  }
  return stats
}

/** Campaign rollup: campaign counts by status + delivery sent/failed totals. */
export function aggregateCampaignDeliveries(profile: string): CampaignStats {
  const stats: CampaignStats = {
    campaigns: 0,
    by_status: {},
    deliveries_sent: 0,
    deliveries_failed: 0,
  }
  const db = getDb(profile)
  if (db) {
    const camps = db
      .prepare(`SELECT status FROM campaigns WHERE profile=?`)
      .all(profile) as Array<{ status: string }>
    stats.campaigns = camps.length
    for (const c of camps)
      stats.by_status[c.status] = (stats.by_status[c.status] ?? 0) + 1
    const del = db
      .prepare(
        `SELECT cd.status AS status FROM campaign_deliveries cd
         JOIN campaigns c ON c.id = cd.campaign_id
         WHERE c.profile=?`,
      )
      .all(profile) as Array<{ status: string }>
    for (const d of del) {
      if (d.status === 'sent') stats.deliveries_sent += 1
      else if (d.status === 'failed') stats.deliveries_failed += 1
    }
    return stats
  }
  const store = getStore(profile)
  const campaignIds = new Set<string>()
  for (const c of store.campaigns.values()) {
    stats.campaigns += 1
    campaignIds.add(c.id)
    stats.by_status[c.status] = (stats.by_status[c.status] ?? 0) + 1
  }
  for (const d of store.deliveries.values()) {
    if (!campaignIds.has(d.campaign_id)) continue
    if (d.status === 'sent') stats.deliveries_sent += 1
    else if (d.status === 'failed') stats.deliveries_failed += 1
  }
  return stats
}

/** Watcher follow-up message rollup (hub side of follow-up performance). */
export type AuthoredMessageStats = {
  /** Messages whose `author` matches, by direction. */
  total: number
  inbound: number
  outbound: number
  /** Outbound messages split by channel (watcher sends SMS). */
  by_channel: Record<string, number>
}

/**
 * Count hub messages authored by a specific author (e.g. the `vin-watcher`
 * agent), optionally bounded to a recent window. Read-only; used by the Data
 * page to surface immediate/24h follow-up *sends* that landed in the hub.
 */
export function aggregateMessagesByAuthor(
  profile: string,
  author: string,
  sinceMs?: number,
): AuthoredMessageStats {
  const stats: AuthoredMessageStats = {
    total: 0,
    inbound: 0,
    outbound: 0,
    by_channel: {},
  }
  const tally = (direction: string, channel: string) => {
    stats.total += 1
    if (direction === 'inbound') stats.inbound += 1
    else if (direction === 'outbound') {
      stats.outbound += 1
      stats.by_channel[channel] = (stats.by_channel[channel] ?? 0) + 1
    }
  }
  const db = getDb(profile)
  if (db) {
    const rows = db
      .prepare(
        `SELECT direction, channel FROM messages WHERE author=?${
          sinceMs ? ' AND created_at >= ?' : ''
        }`,
      )
      .all(...(sinceMs ? [author, sinceMs] : [author])) as Array<{
      direction: string
      channel: string
    }>
    for (const r of rows) tally(r.direction, r.channel)
    return stats
  }
  for (const thread of getStore(profile).threads.values()) {
    for (const m of thread.messages) {
      if (m.author !== author) continue
      if (sinceMs && m.created_at < sinceMs) continue
      tally(m.direction, m.channel)
    }
  }
  return stats
}

// ─── Lead follow-up flow (config + enrollments) ─────────────────────────────
//
// The customer-editable escalation flow (Text → no reply → Email → no reply →
// Call) and the per-lead enrollment state that walks it. Config is ONE row per
// profile; the operator master gate stays in studio.yaml (vin.watcher.enabled).
// See docs/launch/NEXXUS_FOLLOWUP_FLOW_SPEC.md.

export type LeadFlowStep = { channel: string; wait_hours: number }

export type LeadFlowRow = {
  profile: string
  enabled: boolean
  steps: Array<LeadFlowStep>
  updated_at: number
}

export type FlowEnrollmentStatus = 'active' | 'replied' | 'completed' | 'stopped'

export type FlowEnrollment = {
  id: string
  profile: string
  /** Dedup key — the lead's phone. One active enrollment per key. */
  contact_key: string
  /** Resolved per-channel handles at enroll time: {sms?, voice?, email?}. */
  handles: Record<string, string>
  first_name: string | null
  vehicle: string | null
  dealer: string | null
  /** 0-based index of the LAST step sent (-1 = none sent yet). */
  step_index: number
  last_step_sent_at: number | null
  next_due_at: number | null
  status: FlowEnrollmentStatus
  created_at: number
  updated_at: number
}

export function getLeadFlow(profile: string): LeadFlowRow | null {
  const db = getDb(profile)
  if (db) {
    const row = db
      .prepare(`SELECT * FROM lead_flow WHERE profile=?`)
      .get(profile) as
      | { profile: string; enabled: number; steps: string; updated_at: number }
      | undefined
    if (!row) return null
    return {
      profile: row.profile,
      enabled: !!row.enabled,
      steps: (safeJson(`{"v":${row.steps}}`).v as Array<LeadFlowStep>) ?? [],
      updated_at: row.updated_at,
    }
  }
  return getStore(profile).leadFlow
}

export function saveLeadFlow(input: {
  profile: string
  enabled: boolean
  steps: Array<LeadFlowStep>
}): LeadFlowRow {
  const row: LeadFlowRow = {
    profile: input.profile,
    enabled: input.enabled,
    steps: input.steps,
    updated_at: Date.now(),
  }
  const db = getDb(input.profile)
  if (db) {
    db.prepare(
      `INSERT INTO lead_flow(profile,enabled,steps,updated_at) VALUES(?,?,?,?)
       ON CONFLICT(profile) DO UPDATE SET enabled=excluded.enabled, steps=excluded.steps, updated_at=excluded.updated_at`,
    ).run(row.profile, row.enabled ? 1 : 0, JSON.stringify(row.steps), row.updated_at)
  } else {
    getStore(input.profile).leadFlow = row
  }
  return row
}

export function createFlowEnrollment(input: {
  profile: string
  contact_key: string
  handles: Record<string, string>
  first_name?: string | null
  vehicle?: string | null
  dealer?: string | null
  step_index: number
  last_step_sent_at: number | null
  next_due_at: number | null
  status?: FlowEnrollmentStatus
}): FlowEnrollment {
  const now = Date.now()
  const e: FlowEnrollment = {
    id: randomUUID(),
    profile: input.profile,
    contact_key: input.contact_key,
    handles: input.handles,
    first_name: input.first_name ?? null,
    vehicle: input.vehicle ?? null,
    dealer: input.dealer ?? null,
    step_index: input.step_index,
    last_step_sent_at: input.last_step_sent_at,
    next_due_at: input.next_due_at,
    status: input.status ?? 'active',
    created_at: now,
    updated_at: now,
  }
  const db = getDb(input.profile)
  if (db) {
    db.prepare(
      `INSERT INTO flow_enrollments(id,profile,contact_key,handles,first_name,vehicle,dealer,step_index,last_step_sent_at,next_due_at,status,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      e.id,
      e.profile,
      e.contact_key,
      JSON.stringify(e.handles),
      e.first_name,
      e.vehicle,
      e.dealer,
      e.step_index,
      e.last_step_sent_at,
      e.next_due_at,
      e.status,
      e.created_at,
      e.updated_at,
    )
  } else {
    getStore(input.profile).enrollments.set(e.id, e)
  }
  return e
}

function rowToEnrollment(r: {
  id: string
  profile: string
  contact_key: string
  handles: string
  first_name: string | null
  vehicle: string | null
  dealer: string | null
  step_index: number
  last_step_sent_at: number | null
  next_due_at: number | null
  status: string
  created_at: number
  updated_at: number
}): FlowEnrollment {
  return {
    id: r.id,
    profile: r.profile,
    contact_key: r.contact_key,
    handles: safeJson(r.handles) as Record<string, string>,
    first_name: r.first_name,
    vehicle: r.vehicle,
    dealer: r.dealer,
    step_index: r.step_index,
    last_step_sent_at: r.last_step_sent_at,
    next_due_at: r.next_due_at,
    status: r.status as FlowEnrollmentStatus,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }
}

/** Active enrollment for a contact_key, if any (dedup guard against re-enroll). */
export function getActiveFlowEnrollment(
  profile: string,
  contactKey: string,
): FlowEnrollment | null {
  const db = getDb(profile)
  if (db) {
    const row = db
      .prepare(
        `SELECT * FROM flow_enrollments WHERE profile=? AND contact_key=? AND status='active' LIMIT 1`,
      )
      .get(profile, contactKey) as Parameters<typeof rowToEnrollment>[0] | undefined
    return row ? rowToEnrollment(row) : null
  }
  for (const e of getStore(profile).enrollments.values()) {
    if (e.contact_key === contactKey && e.status === 'active') return e
  }
  return null
}

/** All active enrollments for a profile (the engine filters by due time). */
export function listActiveFlowEnrollments(profile: string): Array<FlowEnrollment> {
  const db = getDb(profile)
  if (db) {
    const rows = db
      .prepare(`SELECT * FROM flow_enrollments WHERE profile=? AND status='active'`)
      .all(profile) as Array<Parameters<typeof rowToEnrollment>[0]>
    return rows.map(rowToEnrollment)
  }
  return [...getStore(profile).enrollments.values()].filter(
    (e) => e.status === 'active',
  )
}

export function updateFlowEnrollment(
  profile: string,
  id: string,
  patch: Partial<
    Pick<
      FlowEnrollment,
      'step_index' | 'last_step_sent_at' | 'next_due_at' | 'status'
    >
  >,
): void {
  const now = Date.now()
  const db = getDb(profile)
  if (db) {
    const sets: Array<string> = []
    const vals: Array<unknown> = []
    if (patch.step_index !== undefined) {
      sets.push('step_index=?')
      vals.push(patch.step_index)
    }
    if (patch.last_step_sent_at !== undefined) {
      sets.push('last_step_sent_at=?')
      vals.push(patch.last_step_sent_at)
    }
    if (patch.next_due_at !== undefined) {
      sets.push('next_due_at=?')
      vals.push(patch.next_due_at)
    }
    if (patch.status !== undefined) {
      sets.push('status=?')
      vals.push(patch.status)
    }
    sets.push('updated_at=?')
    vals.push(now)
    vals.push(id)
    db.prepare(`UPDATE flow_enrollments SET ${sets.join(', ')} WHERE id=?`).run(...vals)
  } else {
    const e = getStore(profile).enrollments.get(id)
    if (e) {
      Object.assign(e, patch, { updated_at: now })
    }
  }
}

/**
 * Did the contact send ANY inbound message (on any of these handles' threads)
 * at or after `sinceMs`? The stop-on-reply signal for the flow engine. Reuses
 * the hub thread model: a reply lands as an inbound message on the contact's
 * thread regardless of which channel the step went out on.
 */
export function hasInboundSince(
  profile: string,
  handles: Array<string>,
  sinceMs: number,
): boolean {
  const uniq = [...new Set(handles.filter(Boolean))]
  if (uniq.length === 0) return false
  const db = getDb(profile)
  if (db) {
    const placeholders = uniq.map(() => '?').join(',')
    const row = db
      .prepare(
        `SELECT 1 FROM messages m JOIN threads t ON t.id = m.thread_id
         WHERE t.profile=? AND t.contact_handle IN (${placeholders})
           AND m.direction='inbound' AND m.created_at >= ? LIMIT 1`,
      )
      .get(profile, ...uniq, sinceMs) as { 1: number } | undefined
    return !!row
  }
  for (const t of getStore(profile).threads.values()) {
    if (!uniq.includes(t.contact_handle)) continue
    for (const m of t.messages) {
      if (m.direction === 'inbound' && m.created_at >= sinceMs) return true
    }
  }
  return false
}

// ─── Test helpers ───────────────────────────────────────────────────────────

export function _resetForTests(profile?: string): void {
  if (profile) {
    const db = _dbs.get(profile)
    if (db) {
      try {
        db.close()
      } catch {
        // ignore
      }
    }
    _inMemory.delete(profile)
    _dbs.delete(profile)
    return
  }
  for (const db of _dbs.values()) {
    if (db) {
      try {
        db.close()
      } catch {
        // ignore
      }
    }
  }
  _inMemory.clear()
  _dbs.clear()
}
