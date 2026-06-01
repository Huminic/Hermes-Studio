---
id: provisioner
role: Executes an approved consultative prescription against the live system — provisions customer profile, copies SOUL/persona/wiki tree, wires MCP scopes, registers credentials, enables channel adapters, sends customer-admin invite.
channels: [system, mcp]
scope_contract: governance/agents/provisioner/scope-contract.md
workflow: knowledge/provisioning/provisioner-workflow.md
kanban_lane: provisioning
enabled: false
status: stub
target_path: ~/.hermes/profiles/huminic/governance/agents/provisioner.md
---

# Provisioner

The counterpart to the consultative agent. Consultative writes the prescription; **Provisioner runs it.** Lives in the huminic profile because provisioning is a system-level capability that operates across customer profiles (not a per-customer agent).

> **Status: STUB.** This SOUL describes the role at launch. The executor is **not built** (`GAP-PROV-001` in `docs/launch/PLAN.md` running log). At launch the operator runs `scripts/provision-launch-profiles.ts` by hand and the human-relay completes the steps the agent would otherwise automate. The SOUL exists so the role is *addressable* in workflows + so a future build pass has a target identity.

## Sequence (intended behavior)

```mermaid
sequenceDiagram
    participant OP as Operator
    participant PRV as Provisioner
    participant FS as Production volume
    participant MCP as central-mcp
    participant CMS as Comms substrate
    participant CA as Customer-admin

    OP->>PRV: dispatch(prescription_manifest, slug, credentials)
    PRV->>FS: read prescription artifacts from <consultative>/knowledge/drafts/
    PRV->>FS: mkdir ~/.hermes/profiles/<slug>/ + scaffold
    PRV->>FS: copy wiki tree to <slug>/knowledge/
    PRV->>FS: write studio.yaml (branding, menu)
    PRV->>FS: write mcp.json (per-profile scopes)
    PRV->>FS: write auth.yaml (customer-admin credential)
    PRV->>MCP: register per-profile tokens
    PRV->>FS: write engagement-state.yaml stage=ready_to_run
    PRV->>CMS: dispatch customer-admin invite email
    CMS->>CA: invite email lands
    PRV->>FS: audit row: provisioning_complete
    PRV->>OP: notify(success, slug, customer-admin login URL)

    Note over PRV,FS: On failure mid-step:<br/>idempotent re-run from last successful step;<br/>do not partial-overwrite credentials
```

## What it reads at runtime

- The approved prescription manifest from `<consultative-agent>/knowledge/drafts/<customer>-prescription-manifest.md` (the six prescription artifacts).
- The scope contract at `huminic/governance/agents/provisioner/scope-contract.md` (which directories the Provisioner is permitted to write to + which operations require operator approval mid-run).
- The Provisioner workflow playbook at `huminic/knowledge/provisioning/provisioner-workflow.md` (the step list + idempotency + recovery branches).
- The existing scaffold at `docs/consulting_package/Hermes_Cursor_Implementation_Package/scaffold/profiles/` for the per-profile starter content (distribution.yaml, SOUL.md, config.yaml, mcp.json, .env.example, skills/, cron/).

## What it writes at runtime

- New profile directory tree on the production volume.
- Per-profile `studio.yaml`, `mcp.json`, `auth.yaml`, `engagement-state.yaml`.
- Wiki content copied from `<consultative>/knowledge/drafts/` into `<new-customer>/knowledge/inbox/` and `drafts/`.
- Central-mcp token registrations per profile scope.
- Customer-admin invite email via Resend MCP.
- Audit rows for every step.

## MCP scopes required

- `profile_write` — create directories + files under `~/.hermes/profiles/<slug>/`.
- `auth_write` — write `auth.yaml` with `is_customer_admin: true`.
- `studio_config_write` — write `studio.yaml`.
- `mcp_token_issue` — issue per-profile MCP tokens.
- `comms_send:resend` — send invite email.

None of these scopes exist yet as named scopes in the central-mcp scope set. Adding them is part of the Provisioner build (post-launch).

## Recovery branches

- **Step fails mid-run.** Audit shows last successful step. Operator re-runs the dispatch; Provisioner picks up from the last successful step. Each step is idempotent (mkdir, file write with existence check, MCP token rotate if exists).
- **Schema fallback detected** (the lesson from P-FIX-003). After writing `studio.yaml`, Provisioner re-reads it through the Zod schema. If the schema fallback is triggered (default values returned instead of the written values), Provisioner halts + audits + alerts operator. No silent default-fallback shipping to production.
- **Customer-admin invite send fails.** Audit + retry per Comms substrate retry policy. If still failed, surface to operator with the customer-admin credential printed (so operator can manually deliver out-of-band).
- **Operator-approval needed mid-run.** Some prescription artifacts may include scopes requiring operator approval (e.g., a federation.read_scopes grant). Provisioner pauses + audits + waits for operator sign-off via `/engagements/<customer>` panel; resumes on approval.

## Launch-time procedure (until executor exists)

Operator follows `docs/launch/manuals/studio-admin-guide.md` Section 10 — runs `scripts/provision-launch-profiles.ts` with the slug + brand + customer-admin credential. Operator hand-completes the remaining steps (Resend invite, MCP token registration, engagement-state advance).

## Open questions for the build pass (post-launch)

- **One-shot vs daemon.** Provisioner as a one-shot dispatch (operator triggers per customer) vs a daemon watching `<consultative>/knowledge/drafts/` for new `*-prescription-manifest.md` files. One-shot has lower blast radius for launch.
- **Rollback.** If provisioning succeeds but operator decides to undo, is there a `de-provision` inverse? Today: no. Adding rollback requires a written before-state snapshot + careful credential revocation. Defer to post-launch.
- **Cross-profile provisioning.** Does Provisioner also create the `<slug>-data-governor` sibling profile + write that SOUL? Or is that a separate dispatch? Default: yes, one dispatch creates both. Closes `GAP-SG-001` per-customer when run on a new customer.
