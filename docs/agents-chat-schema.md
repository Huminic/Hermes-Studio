# Workspace Chat & Agents — data schema

Net-new persistence for the Workspace Chat page slide-out and the Agents page
(Configuration + Tasks). Everything is per-profile and tenant-scoped, stored in
the existing per-profile Brain (`~/.hermes/profiles/<profile>/brain/brain.db`)
via the lazy `ensureTable` pattern used by `dashboard_saved_queries` and
`report_*`. No new technologies, services, or storage engines were introduced.

## Chat sessions — REUSED, not new

Chat sessions are **not** a new table. They are the existing messaging-hub
threads (`domain='chat'`, `channel='chat'`) that `/api/customer/chat` already
writes. The slide-out reads them via `GET /api/customer/sessions` →
`listChatSessions()` (`src/server/customer-chat-sessions.ts`), filtered by
`assigned_agent_id`. This means:

- Existing chat sessions migrate cleanly through the "Agents → Chat" rename —
  the rename is UI-only; thread storage is untouched. No orphans.
- A session is surfaced only when it has ≥1 message. The Chat page only creates
  a thread on the first send (`new_session` → `force_new`), so empty
  interactions never produce a record.
- "New chat" / "switch agent" always starts a fresh thread bound to that agent
  (`force_new` skips the most-recent-open-thread reuse), so sessions stay
  per-agent and are never silently resumed.

## `agent_tasks` (src/server/agent-tasks-store.ts)

Structured task records produced by the New Task interview on explicit
confirmation (never a chat blob).

| column | type | notes |
|---|---|---|
| id | TEXT PK | uuid |
| tenant | TEXT | = profile |
| agent_id | TEXT | the agent the task belongs to |
| title | TEXT | short label (Tasks table "Task" column) |
| prompt | TEXT | the underlying request (used by redo prefill) |
| description | TEXT | longer description (Tasks table "Description") |
| frequency | TEXT | `one_time` \| `recurring` |
| cadence | TEXT NULL | human cadence for recurring (e.g. "every Monday at 9am"); null for one_time |
| notification_channel | TEXT | `in_app` \| `email` \| `sms` \| `none` (validated non-empty) |
| notification_timing | TEXT NULL | optional detail (e.g. "on completion") |
| next_run_at | INTEGER NULL | epoch ms of intended next run |
| status | TEXT | `active` \| `paused` \| `completed` |
| created_at | INTEGER | epoch ms |
| updated_at | INTEGER | epoch ms |

**Scheduler debt (documented):** `next_run_at` + `cadence` are persisted and the
UI exposes pause/resume, but no background worker executes recurring tasks yet.
A worker (poll `WHERE status='active' AND next_run_at<=now`) is a deferred item
tracked in `issues.md`. Tasks today are saved intents + status, not
autonomously-firing jobs. Nothing is mocked — the records are real and durable.

## `agent_contextual_instructions` (src/server/agent-config-store.ts)

Per-agent contextual instructions edited in the Configuration modal.

| column | type | notes |
|---|---|---|
| tenant | TEXT | = profile (PK part) |
| agent_id | TEXT | PK part |
| instructions | TEXT | the editable instructions |
| source | TEXT | `local` (default) \| `wiki` |
| wiki_ref | TEXT NULL | wiki page path when `source='wiki'` — the integration hook |
| updated_at | INTEGER | epoch ms |

### Wiki integration point

The wiki backend may not own this surface yet, so instructions are stored
locally now (`source='local'`). When the wiki is ready, a sync step should:

1. read the canonical page via `/api/customer/wiki/read`,
2. upsert here with `source='wiki'` and `wiki_ref` set to the page path,
3. route subsequent saves from the modal through `/api/customer/wiki/save`
   instead of the local store.

`source` + `wiki_ref` exist precisely so this swap is a clean, explicit change
rather than a rewrite. Until then the local store is authoritative and real
(no mock, no silent no-op).

## Uploads — REUSED

The Configuration modal "Uploads" tab uses the existing
`/api/customer/data-uploads` surface (Brain `uploads` table,
`src/server/upload-surface.ts`). Documents uploaded there are auto-embedded into
the agent's base context exactly as today. No new upload storage was added.
