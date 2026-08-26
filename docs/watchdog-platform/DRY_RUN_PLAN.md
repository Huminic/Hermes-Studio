# HUM-VIN-006 Dry-Run — End-to-End Workflow Verification (Codex ⇄ Claude)

**Objective:** Prove the whole connection works on the 3 Serra stores, on dev: Codex seeds
VinSolutions data through Central MCP → it lands + is stored per-store → the customer
dashboard shows it → an alert can be created from a seeded metric.

**Roles.** Codex = data producer + browser validator. Claude = data-contract owner +
consumer/readback + dashboard builder. Operator (Duane) = gates (deploy, real email sends).

**Coordination.** Codex + Claude sync in the `huminic-studio` tmux session on `ubuntu@oracle`.
Codex uses its OWN worktree/clone for any writes — not `/home/ubuntu/hs-ingest-dev`. The
contract is FROZEN at `dev/ingest-endpoint @ 33e136d84` while validated.

---

## Honest prerequisites (the dashboard acceptance depends on these)
- **P-A — the new dashboard is deployed.** Claude's new cockpit (Impact Board, Engagement
  Ladder, Night-Shift & Resurrections, "Create alert" modal, metric alert wizard on the
  Notifications tab) is on the UNDEPLOYED `feat/watchdog-dashboard` branch. `studio.huminic.app`
  currently serves the OLD build. → Claude commits + prepares deploy; **operator deploys (GATED)**.
- **P-B — the ingest store feeds the deployed dashboard (D1, task #182).** The landing +
  promote-to-analytics + vin-metrics path must run on the same deploy so Codex's delivered data
  reaches the dashboard. Until P-B, the VinSolutions-report metrics read "no data" on the dashboard.

Until P-A and P-B are done, Codex validating the web dashboard would test the wrong surface.

---

## Phases

### Phase 0 — Contract confirmation (Codex, now)
1. Read + confirm the committed contract at `/home/ubuntu/hs-ingest-dev` (`dev/ingest-endpoint @ 33e136d84`); run the consumer tests (`npx vitest run`) — expect **1390 pass / 1 skip**.
2. Keep the six native XLSX families **unchanged**; deliver through Central MCP into **isolated dev**.
3. Build **Response Times** per `SCHEMA_CONTRACT_BROWSER_EXTENSION.md` — preserve the raw capture beside a versioned canonical derivative; validate rooftop / America-New_York local period / Sales-only / provenance / checksum / PII-minimization.
4. Keep **User Activity + Deal Performance quarantined** until their date behavior is trustworthy; the **combined Serra Service pipeline stays separate** (out of this Sales contract).

### Phase 1 — Data flow into isolated dev + reconciliation (Codex + Claude, NOW — no deploy needed)
- Codex **delivers daily** (six native families + Response Times) through Central MCP into isolated dev; after each delivery, drops a manifest (or pings Claude).
- Claude runs **readback + reconciliation** per delivery and reports **accepted vs quarantined + exact reasons** back to Codex.
- Claude arms a watcher on the isolated-dev hold directory so each new delivery auto-triggers the readback (the "scheduled basis" verification).
- **Phase-1 checkpoint:** for each of the 3 stores, data **lands** (HOLD_ONLY), **promotes** to the analytical store, and **metrics compute**; Response Times passes all validations. This proves the connection end-to-end into the store — before any deploy.

### Phase 2 — Integrate + deploy (Claude + operator GO)
- Claude commits the `feat/watchdog-dashboard` build; integrates the ingest analytical store so its promoted data feeds the dashboard (**D1 / #182**); prepares the deploy.
- **Operator deploys** the integrated build to the dev studio. **(GATED — your GO.)**
- **Phase-2 checkpoint:** the new dashboard is live on dev with the ingest store wired; the InfoStore/analytical store for each store is populated by Codex's Phase-1 deliveries.

### Phase 3 — Dashboard validation (Codex, AFTER Phase 2)
- Log into `https://studio.huminic.app/stores` (no password for the list) → open the **3 Serra stores** with Codex-supplied per-store credentials.
- **Verify each store's dashboard renders the new sections** and shows that store's **seeded data** (Impact Board / Engagement Ladder / Night-Shift, per-store accent).
- Test **"＋ Create alert"** on the dashboard → the modal opens → create a metric alert.
- On the **Notifications tab**, create a **new alert to `duanewells@icloud.com`** for a **catalog metric Codex is seeding** (e.g. an `appt.*` or `roi.*` slug that now has data), and confirm it persists.
  - Note: creating the alert (stored) is the test. The alert **emailing** `duanewells@icloud.com` also requires the metric to actually trip its rule AND the send-gate enabled for the test (dispatch is dry-run by default). Claude will enable a scoped test send + a tripping value on request.

---

## Acceptance (all true)
1. **Data flows into each of the 3 stores' store** (InfoStore/analytical) — verified by Claude's readback AND visible on the deployed dashboard.
2. **Each of the 3 dashboards renders the new sections** with correct per-store data.
3. **A notification can be created** from the dashboard **modal** AND from the **Notifications tab**, to `duanewells@icloud.com`, for a **seeded catalog metric** — and (on request) actually fires to that address once its rule trips with the send-gate enabled.

## What unblocks the finish (operator)
- **Deploy GO** for the integrated `feat/watchdog-dashboard` build to dev (P-A).
- Confirmation of the **integration approach** for D1/#182 (merge the ingest + dashboard branches into one deploy, or a sequencing you prefer).
