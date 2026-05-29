---
id: hand-off-operator-guide
type: reference
title: Operator Hand-off Guide — Running the Consultative Agent
status: active
domain: governance
created: 2026-05-29
updated: 2026-05-29
owner: role:platform-architect
links: [consultative-agent-scope-contract, human-relay-specification, approval-matrix, method-overview, crews-overview, engagement-state-schema]
edit_policy: governed
review_required: false
gated: false
authority: canonical
---
# Operator Hand-off Guide — Running the Consultative Agent

This guide is for the operator (`role:consultative-operator`) to run the consultative agent against the first customer engagement. Phase 1 (revised) installed the agent's brain and seeded engagement state. This document is how you exercise it.

Operator note: you said you want to run the first engagement yourself for feedback. This guide is the minimum scaffolding for that run.

## What's in place

- The consultative-agent profile (`~/.hermes/profiles/consultative-agent/`) contains the full operating wiki: scope contract, human relay spec, approval matrix, method, prescription templates, strawman library.
- Three customer profiles (`huminic`, `serra-automotive`, `strukture`) each have `engagement-state.yaml` seeded at stage `draft`.
- Three governor profiles (`*-data-governor`) have unified KSG + DSG SOULs declaring their watch paths and coordination role.
- The customer-console plugin is installed at `~/.hermes/studio-plugins/customer-console/` (UI surface comes in Phase 5).

## Recommended first run — strukture

You said strukture first. Reasons confirmed:
- Lowest live activity (active gateway is on serra-automotive).
- Strukture has a pending ClickUp agent that needs context the consultative agent will produce.
- Lower blast radius to surface method bugs.

### Step 1 — Switch active profile in Studio

In Huminic Studio's `/profiles` screen, set the active profile to `consultative-agent`.

This makes the consultative agent's SOUL.md and wiki the operating brain for subsequent chat sessions.

### Step 2 — Start a chat session

Open `/chat` (the chat screen) and create a new session. Use a descriptive name like "strukture-orient-2026-05-29".

### Step 3 — Give it the first goal

Recommended initial prompt:

```
You are running the consultative method on the customer profile "strukture".

Before doing anything else:
1. Read your own scope contract (governance/consultative-agent-scope-contract.md).
2. Read the human relay specification (governance/human-relay-specification.md).
3. Read the approval matrix (governance/approval-matrix.md).
4. Read your method overview (knowledge/method/method-overview.md).
5. Read strukture's current engagement state (/root/.hermes/profiles/strukture/engagement-state.yaml).

Then begin the orient phase per knowledge/method/orient.md. Lead with the strawman from knowledge/strawman-library/. Surface every input request and approval gate as a discrete question to me. Maintain deployment notes as you go. Update strukture's engagement-state.yaml when you complete each step.

When you encounter:
- An open decision: pause and ask me.
- A readiness gate: produce the artifact, then pause for my approval.
- A trivial-seeming step: state why it might be trivial, surface as a finding, do not skip.
- A missing data source: ask me whether to wait, defer, or proceed without it.

Strukture has a pending ClickUp agent that needs context from this engagement. Treat the ClickUp integration as a "next most likely data neighbor."

Begin.
```

### Step 4 — Be a disciplined human relay

Per `governance/human-relay-specification.md`, your job during the session is to:

- **Answer input requests** truthfully or escalate. Don't make up answers to avoid the friction.
- **Approve or reject readiness gates** explicitly. Record the decision in `engagement-state.yaml.readiness_gates` (the agent updates the file; you confirm the proposed update).
- **Log feedback** so it can feed back into wiki refinement. The consultative method gets smarter from operator feedback.

### Step 5 — Watch for the things you said matter

You explicitly want the agent to:

- **Continuously decide if data is included.** Watch for "I'm including X because… / I'm excluding Y because…" framing.
- **Stay aware of other agents and workflows.** Watch for it reading strukture's existing `AGENTS.md`, `persona.md`, and integration notes.
- **Frame next most likely data neighbors.** Watch for an `adjacent_data_neighbors` populated in `engagement-state.yaml` by the end of orient/audit.
- **Keep deployment notes.** Watch for the `Impact of Missing Details` sections in prescription drafts.

If the agent skips any of these, treat it as a method bug and surface it. The wiki is operator-promoted; corrections become wiki edits.

## Subsequent runs — huminic and serra-automotive

Once strukture's first pass is buttoned up:

1. **serra-automotive next** — most realistic test conditions (active CRM, live gateway). Risk is that prescription writes happen alongside live agent activity. Mitigation: the consultative-agent writes to `knowledge/inbox/` and `knowledge/drafts/` only; nothing lands in `canon/` without your approval.
2. **huminic last** — highest-fidelity self-test because Huminic IS you. The prescription will inform Huminic's own operating model going forward.

Use the same prompt template, swapping the customer name.

## What the agent will NOT do (per scope contract)

- Will not deploy infrastructure.
- Will not write production code for client agents.
- Will not maintain the client wiki after handoff (that's the per-customer KSG's job).
- Will not touch sensitive financial or identity data.
- Will not silently rewrite canonical knowledge.

If you see the agent attempting any of these, stop the session and report. It's a method bug.

## Readiness gates you'll be asked to approve

From `governance/approval-matrix.md`, in order:

| Gate | When | What you confirm |
|------|------|-----------------|
| ready_to_blueprint | end of audit | Audit complete, open questions enumerated |
| ready_to_instantiate_runtime | end of author | Wiki conformant, semantic specs complete |
| ready_to_publish_mcp_projections | mid-package | Access spec + scope model complete |
| ready_to_hand_off_externally | end of package | Topology decided, scope contracts validated |
| topology_decided | during design | We host / hybrid / external — your call with options |

Each approval gets recorded in `engagement-state.yaml.readiness_gates`.

## When ready_to_run is approved

The engagement transitions to stage `ready_to_run`. At that point:

1. Build-time crew is dissolved.
2. Run-time crew (consultative-agent + KSG + DSG + customer runtime agents) begins.
3. Customer runtime agents from your Nexxus port (lead-follow-up, lead-response, service, crm-data-guru, plus strukture's ClickUp agent) are dispatched.
4. The customer-console plugin's engagement-tracker panel (Phase 5 deliverable) starts showing this customer as "Ready to Run."

## Feedback loop into the wiki

When you correct the agent or observe a method gap, the correction MUST close per `governance/human-relay-specification.md`:

1. Feedback logged (destination will be the metadata DB once Pillar 2 is online; for now, log directly into `~/.hermes/profiles/consultative-agent/log.md` or `hot.md`).
2. Reviewed at the end of each engagement (per-engagement retrospective).
3. Validated feedback becomes a wiki edit (refined strawman, new case, tightened procedure).

The wiki is governed; edits flow through inbox → drafts → canon per `knowledge/authoring/folder-grouping-rule.md`.

## Authentication setup (do this before exposing Studio publicly)

Studio's production container currently runs in **no-auth mode** — `HERMES_PASSWORD` is not set, and no profile has an `auth.yaml` file. The only thing keeping random visitors off `studio.huminic.app` is Coolify's reverse proxy on that subdomain. Before going live, provision profile-synced credentials.

### Choose your auth model

| Model | When | How |
|-------|------|-----|
| **Single shared password (legacy)** | Quick setup; one operator | Set `HERMES_PASSWORD=<pwd>` in the hermes-studio Coolify env, redeploy. Studio shows the existing login screen; one shared password unlocks everything. Implicit admin. |
| **Profile-synced (recommended)** | Real auth tied to profiles, admin role gated | Create per-profile `auth.yaml` files with the CLI below. As soon as ANY profile has `auth.yaml`, Studio switches into username+password mode and the legacy password path is bypassed. Admin flag controls global active-profile switching. |

### Create a profile user (recommended path)

Inside the hermes-agent container (where the volume is mounted at `/root/.hermes`):

```bash
# From the host:
docker exec -it hermes-agent-nh5vnz9kz226cj9ib3nodg1j-084604266840 sh -c \
  "cd /tmp/Hermes_Cursor_Implementation_Package && \
   pnpm tsx scripts/create-user.ts --profile huminic --username duane --admin"
```

The script prompts for the password twice (hidden input), hashes it with scrypt, and writes `/root/.hermes/profiles/huminic/auth.yaml` with mode 0600. Mark `--admin` for any user that needs to switch the global active profile.

Repeat per profile that should have a login. Non-admin users (omit `--admin`) are pinned to their own profile — they can chat, browse files, etc., but `/api/profiles/activate` returns 403 if they try to switch profiles.

### Verify

After creating at least one user and triggering a Coolify redeploy:

1. Visit `studio.huminic.app`. You should see a login form.
2. `GET /api/auth-session` (in browser devtools) should report `{ authenticated: false, profile_auth_mode: true }` before login.
3. Log in. The response includes `{ profile, username, is_admin }` and a `hermes-auth` cookie is set.
4. After login, `/api/auth-session` returns `{ authenticated: true, profile, username, is_admin }`.
5. Logged in as non-admin, `POST /api/profiles/activate` returns 403.

### Where the credentials live

```
~/.hermes/profiles/<profile>/auth.yaml   # one per login identity
```

Schema (commit only the hash; never commit raw passwords):

```yaml
username: duane
password_hash: scrypt$16384$8$1$<saltHex>$<keyHex>
is_admin: true
```

Studio scans all profile dirs at login time and matches the username. Tokens stored in memory; if `REDIS_URL` is set, also persisted with metadata across container restarts.

### Migrating off the legacy password

Once profile-mode is active (any auth.yaml exists), you can remove `HERMES_PASSWORD` from the Coolify env — Studio no longer uses it. Keep it set if you want a break-glass admin fallback (the legacy password path still works when no username is submitted).

---

## Where this guide lives

- Production: this file is installed at `~/.hermes/profiles/consultative-agent/HAND_OFF_OPERATOR_GUIDE.md`.
- Source: `docs/consulting_package/Hermes_Cursor_Implementation_Package/HAND_OFF_OPERATOR_GUIDE.md` (in the Huminic Studio fork).

If you find this guide is incomplete or misleading during your first run, that itself is a method finding worth recording.
