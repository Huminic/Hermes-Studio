# Lead Follow-up Flow — Spec

**Status:** IMPLEMENTED 2026-06-04 (Phase 1: engine + form). Browser-verified end-to-end on
serra-honda (form renders → edits → saves → round-trips via API). 656 tests pass (+15), build clean.
Not yet committed/deployed. Phase 2 (agent setup) deferred.
**Scope:** customer-facing storefront only (customer-console). No Studio/admin UI change.
**Supersedes nothing.** Extends the existing lead-follow-up trigger (`vin-watcher.ts`, WS-2)
from a hardcoded SMS-only sequence into a customer-configurable, multi-channel,
stop-on-reply escalation.

---

## 1. Problem

Today the lead follow-up is a **hardcoded, SMS-only** two-step sequence (immediate text +
24h check-in) in `src/server/vin-watcher.ts`. Nexxus 2.2 is the same shape — three
hardcoded SMS-only triggers, no user-configurable sequencing, no multi-channel. Customers
cannot define *what* happens when a lead doesn't answer, and cannot use email/phone as
follow-up channels.

The customer also asked: **"how can we see what messages went out?"** — answered by the
existing Data dashboard substrate (no new surface; see §7).

## 2. What we are building

A small **Follow-up** sub-tab under the Campaigns page. The customer defines up to **3
ordered steps** — *channel + how long to wait if no reply* — and turns it on. When a new
lead arrives it sends step 1; it only walks to the next step if the lead has **not replied**
within the wait window; the moment the lead replies, the flow **stops**.

```
Follow-up for new leads                      [ On ⬤ ]
  Step 1   [ Text  ▾ ]   send immediately
  Step 2   [ Email ▾ ]   if no reply after [ 4 ] hours
  Step 3   [ Call  ▾ ]   if no reply after [ 24 ] hours
  ✓ Stop as soon as the customer replies   (always on)
  [ Save ]
```

No content rules, no NLP, no branching. Deterministic: channel + wait + stop-on-reply.

## 3. Locked decisions (from brainstorm 2026-06-04)

| # | Decision |
|---|---|
| D1 | **Trigger conditions:** time/elapsed + CRM event (new lead) + inbound-reply rule. **No NLP** to autonomously fire sends (respects the Nexxus prompt-injection guardrail). |
| D2 | **Multi-channel = escalation/fallback** (Text → no reply → Email → no reply → Call). Channels swappable. Not fan-out, not pick-one. |
| D3 | **Enrollment entry point = new lead arrives only.** No list/CSV enrollment in v1 (campaigns already cover blasts). |
| D4 | **Setup = simple form now, talk-to-an-agent later.** Engine + form ship first (Phase 1). Agent setup (Phase 2) writes the same config; the form becomes the review/edit view. |
| D5 | **One flow per profile, max 3 steps** — simplest first. |

## 4. Architecture — three small units (mirrors campaign-worker on top of the store)

| Unit | Responsibility | File |
|---|---|---|
| **Flow config + enrollment state (data)** | `lead_flow` (1 row/profile) + `flow_enrollments` tables in the per-profile `messaging-hub.db`; CRUD. | `src/server/messaging-hub-store.ts` (existing store owner) |
| **Flow engine (behavior)** | `enrollLead()` on a new lead; `tickFlows()` advances due enrollments; reply-detection; per-step dispatch. | `src/server/lead-flow.ts` (new) |
| **Config API** | `GET`/`PUT /api/customer/lead-flow` — customer-admin reads/saves the flow. | `src/routes/api/customer/lead-flow.ts` (new) |
| **Form UI** | "Follow-up" view in the Campaigns renderer. | `src/components/customer-console/campaigns-renderer.tsx` (extend) |

Reuses everything safety-critical: `dispatchOutbound()` (CommGate-wrapped, channel-agnostic),
`allowedByPrelaunchLock()` (pre-launch allowlist), business-hours/TCPA/DNC gates, and the
messaging-hub thread model for reply detection. **No new send path, no new channel code.**

### 4.1 Why the config lives in `messaging-hub.db`, NOT `studio.yaml`

`studio.yaml` is **operator-controlled** (customer-admins cannot edit it; see studio-config.ts
header). The flow steps are **customer-editable**. Putting customer-editable data in the
operator-only file would need a YAML writer + KSG gate and blur the boundary. So the flow
config is stored in the per-profile `messaging-hub.db` (same place campaigns/audiences live —
all customer-editable). The operator keeps the **master on/off gate** in `studio.yaml`
(`vin.watcher.enabled`): if the watcher is off, nothing enrolls regardless of the flow. Two
gates, by design (mirrors `OUTBOUND_LIVE_ENABLED` env + `comms.outbound_enabled`).

## 5. Data model

```
lead_flow (per profile, single row)
  profile      TEXT PRIMARY KEY
  enabled      INTEGER         -- customer's on/off for the flow
  steps        TEXT (JSON)     -- [{channel, wait_hours}], max 3; step 1 wait ignored
  updated_at   INTEGER

flow_enrollments
  id               TEXT PRIMARY KEY
  profile          TEXT
  contact_key      TEXT          -- the lead's phone (dedup key; one active enrollment per key)
  handles          TEXT (JSON)   -- {sms?, voice?, email?} resolved at enroll time
  first_name       TEXT
  vehicle          TEXT
  dealer           TEXT
  step_index       INTEGER       -- 0-based; index of the LAST step sent
  last_step_sent_at INTEGER
  next_due_at      INTEGER       -- when the next step may fire (null = no more)
  status           TEXT          -- active | replied | completed | stopped
  created_at       INTEGER
  updated_at       INTEGER
```

`FlowChannel = 'sms' | 'email' | 'voice'` for v1 (video deferred — no inbound handle to
escalate to). UI labels: Text / Email / Call.

## 6. Engine behavior

### 6.1 Enroll (on new lead)
`vin-watcher` already detects new leads. At its IMMEDIATE send decision point, if a flow is
**enabled with ≥1 step**, it calls `enrollLead()` instead of the hardcoded immediate text:
1. Resolve handles from the lead (`sms`/`voice` = phone; `email` = lead email if present).
2. Create a `flow_enrollments` row at `step_index = -1`.
3. Send **step 1** via its channel (through `dispatchOutbound`, gated + prelaunch-locked).
4. Set `step_index = 0`, `last_step_sent_at = now`, `next_due_at = now + step2.wait_hours`
   (or null if only one step → `completed`).

Step 1 creates a hub thread, so the watcher's existing `known.has(phone)` dedup skips the
lead on subsequent cycles (no double-enroll). The watcher's 24h-checkin branch keys off
`triggerStore` 'immediate', which the flow path does **not** write — so it stays dormant when
a flow is active. **No flow configured → vin-watcher behavior is exactly as today** (backward
compatible).

### 6.2 Advance (`tickFlows`, every cron cycle via `comms-scheduler.runDueWork`)
For each `active` enrollment with `next_due_at <= now`:
1. **Reply check:** any inbound message on the contact's thread(s) since `last_step_sent_at`?
   → **yes:** set status `replied`, stop.
2. **Business hours:** if out of hours, leave it; retry next cycle (no queue table needed).
3. Take the next step. If we have no handle for that step's channel → record skip, advance to
   the following step immediately (don't wait). If out of steps → status `completed`.
4. Dispatch the step via `dispatchOutbound`; append the hub message (author `lead-flow`);
   set `step_index`, `last_step_sent_at = now`, `next_due_at = now + nextStep.wait_hours`.

Every send passes CommGate + the pre-launch allowlist — identical safety to the watcher.

### 6.3 Stop-on-reply
Always on. Reply detection reuses the hub: inbound messages on any thread whose
`contact_handle` is one of the enrollment's handles, `created_at >= last_step_sent_at`.

## 7. Visibility (no new surface)

- **Teambox:** flow sends already land as per-contact thread activity (unchanged).
- **"What went out":** a **Data dashboard** on the existing substrate (WS-6). Every flow send
  is a `messaging-hub` message with `author = 'lead-flow'`, a channel, and a timestamp —
  already queryable via `aggregateMessagesByAuthor(profile, 'lead-flow')`. We surface a
  "follow-up messages sent, by channel" card. No new screen.

## 8. Out of scope (now)

- Multi-node branching, content/NLP conditions, multiple named flows, list/CSV enrollment.
- **Phase 2 (fast-follow):** agent setup ("text them, then email if quiet, then call") that
  writes the same `lead_flow.steps[]`; the form becomes the review/edit view. Engine + form
  ship first.

## 9. Test plan

- `lead-flow.test.ts`: enroll sends step 1; tick advances to step 2 after the wait when no
  reply; tick stops on inbound reply; step with no handle is skipped-and-advanced; disabled
  flow is a no-op; >3 steps rejected on save; idempotent re-tick (no double-send of a step);
  out-of-hours holds (no send, retried).
- `lead-flow-api.test.ts`: GET returns default-empty flow; PUT saves + validates (channel
  enum, ≤3 steps, wait ≥0); auth gate (403 cross-profile).
- `vin-watcher.test.ts`: with a flow active, a new lead enrolls (step 1 sent) and the
  hardcoded 24h checkin does **not** fire; with no flow, today's behavior is unchanged.

## 10. Files

- `src/server/messaging-hub-store.ts` — tables + CRUD (extend).
- `src/server/lead-flow.ts` — engine (new).
- `src/server/vin-watcher.ts` — enroll-on-new-lead integration (extend).
- `src/server/comms-scheduler.ts` — `tickFlows` in `runDueWork` (extend).
- `src/routes/api/customer/lead-flow.ts` — config API (new).
- `src/components/customer-console/campaigns-renderer.tsx` — Follow-up view (extend).
- Tests as in §9.
