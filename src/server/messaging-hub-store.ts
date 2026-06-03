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
  const now = Date.now()
  const db = getDb(input.profile)

  if (input.existing_thread_id) {
    const found = getThread(input.profile, input.existing_thread_id)
    if (found) return found
  }

  // Try to reuse the most-recent open thread for this contact_handle+channel
  // (so multi-turn chats stay on one thread by default).
  const reuse = findOpenThreadFor(input.profile, {
    contact_handle: input.contact_handle,
    channel: input.channel,
    domain: input.domain,
  })
  if (reuse) return reuse

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
  return thread
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
