# M2B — Audit, Freshness/Quarantine Gap, and Smallest Honest Plan

**Owner:** Studio (isolated/dev implementation). **Independent reconciliation/visual‑QA/emails:** Codex.
**Branch:** `feat/watchdog-dashboard` @ ff to `3f45b0d…` (all pre‑existing dirty/untracked preserved).
**Scope guards:** Sales‑only; tenant isolation; missing‑is‑not‑zero; no deploy/merge/PROD/CRM/automation/
dealer notification/email; no Service/Parts. I do not send email (Codex owns the three allowlisted sends).

## 1. Data reality (source of truth = `/srv/ingest-dev/analytics`, i.e. what the report reads)

Accepted + promoted (non‑superseded) deliveries actually in the analytics store today:

| store            | promoted families (period)                                   | notes |
|------------------|--------------------------------------------------------------|-------|
| serra-honda      | `dealership_performance` (08‑17…08‑23), `appointments` (08‑17…08‑23) | 40 / 18 rows |
| serra-nissan     | `dealership_performance` (08‑17…08‑23)                       | 40 rows |
| tony-serra-ford  | **none**                                                     | fully withheld/no‑current |

Only **one** weekly period exists (2026‑08‑17…08‑23) ⇒ **dealer baselines are `insufficient_history` for
every metric** (need ≥3 governed periods). No `lead_source_roi`, `cage_kpi`, `sales_comm_log`, or
`crm_sales_gross` is promoted for any store.

## 2. Held-but-not-promoted (validated, in `/srv/ingest-dev/hold/<profile>/held`)

| store            | held families (period) — NOT yet in analytics |
|------------------|-----------------------------------------------|
| serra-honda      | `lead_source_roi` (wk), `appointments` (wk), `dealership_performance` (wk), `sales_comm_log` (daily 08‑22/23/24) |
| serra-nissan     | `lead_source_roi` (wk), `cage_kpi` (wk), `dealership_performance` (wk), `sales_comm_log` (daily 08‑23/24) |
| tony-serra-ford  | `lead_source_roi` (wk), `cage_kpi` (wk), `sales_comm_log` (daily 08‑23/24) |

The consumer `promoteHeldToAnalytics` (hs‑ingest‑dev) is **dev‑only, read‑only on hold, writes the isolated
`DEV_ANALYTICS_ROOT`, no listener/route/scheduler/notification action**, and is **fail‑closed**: it re‑hashes
the original bytes and **re‑runs `evaluateDelivery`**, aborting before any write unless the delivery
independently re‑passes as `accepted` (Sales‑only). ⇒ Promotion is contract‑permitted in isolated dev, and
any held delivery carrying the Lead‑Intent Service/Parts contamination (below) would **self‑reject**.

## 3. FRESHNESS / QUARANTINE GAP (Codex independent validation, 2026‑08‑29)

- The **fresh daily Sales Communication workbooks** for all three stores, **2026‑08‑25…08‑28** (staged at
  `/tmp/halo-m2b-fresh`), pass 15‑column schema / dealer / single‑date / Sales‑row / wrong‑dealer /
  wrong‑period / service‑row / excluded‑service‑source checks, **BUT every Filters tab positively selects
  Lead Intents "Acquisition, Parts, Sales, Service, Unknown."** Under `SCHEMA_CONTRACT.md` §0 a **positive
  Service/Parts Lead‑Intent selection quarantines the entire delivery; clean rows do not cure it.**
- **Decision (recorded):** DO NOT ingest/promote/use `/tmp/halo-m2b-fresh`. **All `comm.*` metrics remain
  WITHHELD.** The newest weekly accepted source is **2026‑08‑17…08‑23**. Any VinSolutions schedule
  correction (removing Service/Parts from the Lead‑Intent selection) **awaits separate explicit Duane
  approval**; it is out of scope here.
- Consequence for the report: **conversation‑evidence diagnosis (execution‑plan step 3) is limited** — the
  freshest comm source is quarantined and no comm family is promoted, so systemic‑weakness mining from comm
  logs is withheld and surfaced as an explicit coverage gap, not fabricated.

## 4. Code reality (what exists vs what M2B needs)

Exists and Codex‑accepted (M2/M2 corrective): `metric-catalog`, `halo-support-manifest` (v1.1.0, 19 slugs),
`metric-values` (native → catalog), `halo-three-layer` (current/industry‑non‑scoring/baseline),
`halo-report-card` (JSON assembler, Sales‑gate, window rules), `halo-ai-narrative` (evidence‑constrained,
per‑claim grounded, unit/sign‑bound), the `/api/customer/halo-report` route, and the cockpit Halo panel.

M2B **adds** (new, owned): a **polished standalone report‑card artifact** per store (executive summary,
category scorecards, evidence, ranked opportunities, **coverage ledger with source period + age/freshness**,
concise AI narrative, **machine‑readable evidence manifest**), plus **ranked owner‑specific actions**
(coverage gap / notification / automation / coaching / Huminic opportunity) derived only from governed,
present metrics — never from withheld/quarantined data.

## 5. Smallest honest plan

1. **Data prep (fail‑closed promotion).** Promote the **clean held WEEKLY families** (roi, cage, appointments,
   dealership_performance @ 08‑17…08‑23) via `promoteHeldToAnalytics`. The consumer re‑validates; contaminated
   deliveries self‑reject and stay withheld. **Do NOT promote `sales_comm_log`** (comm.* withheld per §3).
   Record, per family/store, promoted‑vs‑self‑rejected as evidence. *(Mutates the shared isolated analytics
   store — surfaced for operator/Codex acknowledgment before running.)*
2. **Report generator.** Build a store report‑card generator over the accepted analytics data: three‑layer per
   supported metric, coverage ledger (supported / withheld / missing / unsupported + source period + **age**),
   freshness banner, evidence manifest (source, checksum, period, unit, row counts). Withhold everything not
   present; never zero‑fill.
3. **Diagnosis + ranked actions.** From present governed metrics only, derive ranked, owner‑tagged
   opportunities with trigger/recipient/action/prereqs/safety/approval. Comm‑based weakness mining = explicit
   coverage gap (quarantined source).
4. **Presentation.** Emit three polished artifacts + evidence manifests; deterministic, then optional
   evidence‑constrained AI narrative (fails closed to deterministic).
5. **Workspace verification.** Re‑test Dashboard/Issues/Notifications/Halo for all three; inert "Create alert"
   with dispatch disabled; zero Service/Parts and wrong‑dealer proof.
6. **Handoff.** Commit/push owned M2B files + evidence; hand to Codex for reconciliation, visual QA, inert UI
   acceptance, and the three allowlisted emails. **I send no email.**

## 6. Real gaps / decisions

- **G1 (data volume).** Even after promoting clean weekly held families, **Ford** may remain thin and **all
  baselines stay `insufficient_history`** (one period). Honest, explicit — not a defect.
- **G2 (comm/diagnosis).** Freshest comm source quarantined (§3) ⇒ comm.* + conversation‑evidence diagnosis
  withheld; schedule fix awaits Duane.
- **D1 (promotion of shared store).** Recommend running the fail‑closed weekly promotion (step 5.1). It mutates
  `/srv/ingest-dev/analytics`, which Codex reconciles against — **surfaced for acknowledgment before I run it.**
