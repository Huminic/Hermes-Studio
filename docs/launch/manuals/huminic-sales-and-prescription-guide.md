# Huminic sales + prescription quick-start guide

Two front-of-house personas, two quick-starts:

1. **Huminic salesperson** — *analyze a prospective customer* before a formal engagement.
2. **Huminic project team** — *create the prescription* (the consultative deliverable) once the prospect is committed.

Both run on the **consultative agent**, driven **interactively** through the Studio chat against an **active profile**. There is no automated "analysis" or "prescription" wizard at launch — the human drives the agent turn-by-turn and approves the gates. Every step below was confirmed working on the live deploy (`studio.huminic.app`) on 2026-06-02.

> **What is verified live:** Studio profile login; `/profiles` → **Activate**; Chat against the `consultative-agent` profile returns real model replies (gpt-4.1 via the gateway); `/engagements` overview + `/engagements/<customer>` detail render the stage strip, crews, readiness gates, and deployment notes; provisioning via `scripts/provision-launch-profiles.ts --slug` runs in-container.
>
> **Honest limits:** the agent is driven by a human relay (no one-click "analyze"/"prescribe"); readiness gates require a **real** human approver (no `simulated-operator`); the scripted `consultative-engine.ts` path uses a synthetic completion and is NOT the operator path — use the **Studio chat** path below.

---

## Persona 1 — Huminic salesperson: analyze a prospective customer

**Goal.** Size up a prospective dealer (rooftops, brands, market, data sources, likely AI opportunities) and produce the discovery questions + an industry brief that frame whether/how to pursue them — before committing the project team.

**Quick start (≈10 minutes).**

1. **Log in** to Studio at `https://studio.huminic.app/` with your operator credentials (username + password).
2. **Make the consultative agent active.** Sidebar → **Profiles** → find `consultative-agent` → **Activate**. The card should read `ACTIVE · gpt-4.1 MODEL · ✓ ENV`. (Activating a profile points the chat + gateway at that profile's SOUL.)
3. **Open Chat** (sidebar → Chat → New Session). The active agent is the consultative agent; its first reply is grounded in the consultative method (orient → audit → design → author → validate → package).
4. **Run an ORIENT pass on the prospect.** Paste a prompt like:
   > "Analyze **Cedar Ridge Automotive** — a 2-rooftop Honda/Nissan group in the Columbia, SC market with sales + service + BDC. Give me: (a) a one-page industry brief, (b) the most likely data sources we'd integrate, (c) the top 10 discovery questions I should ask the dealer principal, (d) the adjacent data neighbors worth probing."
5. **Iterate.** Ask follow-ups ("what would disqualify this prospect?", "what's the fastest first win for them?"). Each reply is a real model answer; treat the thread as your account record (it persists).
6. **Decide + hand off.** If you're pursuing the prospect, ask the project team to seed the engagement (a profile dir + `engagement-state.yaml` at stage `draft`), then track progress under **Engagements**. Hand your ORIENT notes + discovery answers to the project team for the full prescription (Persona 2).

**What you'll see / where it lives.**
- Your analysis lives in the chat session (and, once an engagement exists, the orient/audit outputs land in the customer profile).
- The **Engagements** screen shows each prospect's current stage once seeded; a brand-new prospect sits at `draft`.

**Notes & limits.**
- No dedicated "prospect analysis" screen exists at launch — the chat + the Engagements tracker are the tools.
- The agent's quality scales with the detail you give it (it will say so). Vague inputs → generic briefs.
- Nothing you do here writes to a customer's canon; analysis is conversational until the project team seeds an engagement.

---

## Persona 2 — Huminic project team: create the prescription

**Goal.** Drive the consultative agent through the full six-phase method to produce the **prescription** (the six artifacts) and advance the engagement to `ready_to_run` with all readiness gates approved — the package provisioning consumes.

**Prereqs.** The customer profile exists with an `engagement-state.yaml` at stage `draft` (seeded during/after the sales hand-off). If not, see "Seed an engagement" below.

**Quick start (the six phases).**

1. **Make the customer active.** Sidebar → **Profiles** → the customer (e.g. `cedar-ridge-automotive`) → **Activate** (or activate `consultative-agent` and name the customer in your prompts). Open **Chat**.
2. **Drive the six phases, one at a time**, relaying real inputs as the agent asks (per the human-relay specification):
   - **Orient** — industry brief + strawman.
   - **Audit** — read existing state; the agent surfaces evidence gaps as input requests (answer them).
   - **Design** — agentic topology + knowledge shape. *This is where the `topology_decided` gate comes due.*
   - **Author** — the agent writes the **six prescription artifacts** into the customer's `canon/` (client wiki, agentic design, data-storage spec, MCP-access spec, and the two semantic-agent specs + manifest).
   - **Validate** — challenge loop with confidence scores.
   - **Package** — assemble the manifest + readiness gates + deployment notes.
3. **Watch the engagement advance.** Open `/engagements/<customer>`. As phases complete, the stage flips:
   `draft → gathering_data` (orient/audit) `→ solution_discovery` (design) `→ creation` (author) `→ submission` (validate) `→ feedback` (operator review) `→ ready_to_run` (package).
4. **Approve the five readiness gates** as they come due (a gate needs a **real** human approver — never self-approve your own implementation):
   - `ready_to_blueprint`
   - `ready_to_instantiate_runtime`
   - `ready_to_publish_mcp_projections`
   - `ready_to_hand_off_externally`
   - `topology_decided` (carries a `decision`, e.g. single-tenant vs we-host — not a free-text note)

   Approve via the engagement panel, or `POST /api/customer/engagement-state` with `{action: 'approve_gate', ...}`. Gate status is `pending → approved` (or `rejected`).
5. **Resolve open decisions + deployment notes.** Park/assumption text goes in `open_decisions[].resolution`; deployment notes track `area` + `status` (`unknown`/`partial`/`confirmed`) + `impact_if_missing`. Clear the blockers before hand-off.
6. **Hand off to provisioning.** When the engagement is `ready_to_run` and all gates are `approved`, provision the live customer:
   ```
   docker exec <hermes-studio-container> npx tsx scripts/provision-launch-profiles.ts \
     --slug <customer-slug> --brand "<Brand Name>" \
     --customer-admin-username <user> --customer-admin-password '<temp-pw>'
   ```
   (Run `--dry-run` first; the script is idempotent and skips existing files.) Then create the storefront login per the studio-admin guide.

**Seed an engagement (if `draft` doesn't exist yet).** Create the customer profile dir + an `engagement-state.yaml` at `current_stage: draft` with non-empty `deployment_notes`, `readiness_gates` (the five above, each `pending`), and `open_decisions`. The studio-admin guide's "Provisioning a new customer" section covers the profile scaffold.

**Notes & limits.**
- The agent **authors** the artifacts; the project team's job is to relay real inputs, spot-check the output, and approve gates — not to hand-write the prescription.
- Gate approvals are real and auditable; a launch readiness chain containing any `simulated-operator` approval is not acceptable.
- The prescription artifacts land in the customer's `canon/` with required frontmatter (`type`, `status`, `title`) and an "Impact of Missing Details" section per artifact.

---

## Cross-references

- Companion guides: `consulting-human-operator-guide.md` (full six-phase method + human-relay detail), `studio-admin-guide.md` (provisioning, gate approval, credential rotation), `customer-admin-guide.md` (what the dealer sees once provisioned).
- Engagement schema: 7 stages + 5 readiness gates as named above (`src/lib/engagement-state.ts`).
- Live surfaces used: `/profiles` (Activate), Chat (consultative agent), `/engagements` + `/engagements/<customer>`.
