# Phase 0 — architecture / ownership / no-touch map

**Captured at (UTC):** 2026-09-02 (read-only). MAIN HEAD `9ac76c58b`; INGEST HEAD `4c41df11d`.

## 1. Two implementations and what each owns

| Repo | Path | Owns | Role (SPEC §10) |
|---|---|---|---|
| MAIN | `/home/ubuntu/hs-m1r-isolated-20260830` | Halo report prototype, native readers (Appointments/Dashboard/Gross/Response-Times readback), metric-values, evaluator, gate5b customer-report, PDF builder, per-profile Brain store, **and** the live Studio comms/messaging/webhook stack | **Claude/Studio — dev implementation owner** |
| INGEST | `/home/ubuntu/hs-ingest-dev` | Ingest edge: six-family classifier (`vin-contracts.ts`), hold/landing (`hold-store.ts`), delivery persistence (`ingest-delivery-store.ts`), promotion (`analytics/promote-held-to-analytics.ts`), wider six-family readers (`watchdog/vin-metrics.ts`) | **Codex-governed acquisition consumer** |

Shared/dual-presence modules (both repos, same or related blobs): `brain-schema.ts`
(blob `f31b28fd…` identical in both), `brain-store.ts`, report/metric helpers. Consolidating one
canonical reader/landing/promotion path is **Phase 3 work**, not Phase 0.

## 2. Chosen clean canonical dev integration branch

- **`codex/halo-295-unshrinkable-inputs` on MAIN @ `9ac76c58b`** — clean tree, upstream in sync,
  Honda planning authorities pinned at HEAD. All Phase 0 writes go here.
- INGEST `dev/ingest-endpoint` is a **read-only reference** in Phase 0 (and carries one quarantined
  dirty file — see `04_repo_state_and_rollback.md` §3).

## 3. Roles (SPEC §10)

| Role | Party | Boundary |
|---|---|---|
| Dev implementation owner | **Claude/Studio** | Owns dev code/schema/readers/metrics/reports/tests on the clean branch. Must NOT browse Vin/Gmail, alter saved schedules, manufacture data, change the Sales boundary, deploy, or send customer output. |
| Acquisition & acceptance controller | **Codex** | Read-only Vin acquisition, immutable evidence, admission, reconciliation, acceptance, PDF QA. Must not weaken validators or infer missing data. |
| Business/consequential authority | **Duane** | Ratifies manual potential, staffing/thresholds, material schedule changes, new external/compliance/PII/cross-rooftop/Service sources, production activation, customer delivery. |
| Impartial shadow | **non-author/deployer reviewer** | Reviews pinned evidence read-only, recomputes high-impact claims, issues PASS/HOLD. No authorship/deploy/delivery interest. |

## 4. Production / live surfaces — EXPLICIT NO-TOUCH (inventory, not change)

Phase 0 (and Honda Watchdog dev) may integrate the Honda dev path but **must not** refactor,
reschedule, re-point, or activate any of these established circuits:

| Surface | File(s) | Cadence/trigger | Class |
|---|---|---|---|
| Comms scheduler cron | `scripts/comms-cron.ts`, `cron-comms-holds.sh` | ~1 min | PRODUCTION_NOTOUCH |
| Comms holds / Semantic Guardian release | `scripts/comms-holds-cron.ts`, `src/server/semantic-guardian.ts` | ~1 min | PRODUCTION_NOTOUCH |
| Immediate / follow-up SMS catch-up | `scripts/cron-catchup-immediate.sh`, `cron-catchup-followup.sh` | windowed 30 min / hourly | PRODUCTION_NOTOUCH |
| Sentinel health monitor | `scripts/sentinel-cron.ts`, `sentinel-daemon.ts`, `src/server/sentinel*.ts` | ~2–5 min (email-only alerts) | PRODUCTION_NOTOUCH |
| Integrity scanner cron | `scripts/integrity-cron.ts` | hourly | PRODUCTION_NOTOUCH |
| Watchdog cron (findings only) | `scripts/watchdog-cron.ts` | hourly | PRODUCTION_NOTOUCH (does NOT dispatch alerts) |
| Vapi / Tavus / TextMagic webhooks | `src/routes/api/webhooks/{vapi,tavus,textmagic}.$profile.ts` | inbound events | PRODUCTION_NOTOUCH |
| Vapi webhook registration (cutover) | `scripts/register-vapi-webhooks.ts` | `--execute` = live cutover | PRODUCTION_NOTOUCH (dry-run only) |
| Messaging hub + adapters + gate | `src/server/{messaging-hub-store,messaging-adapters,comms-scheduler,comms-gate,campaign-worker,automations,lead-flow,vin-watcher,lead-notifications,agent-autonomous-reply}.ts` | tick/event-driven | PRODUCTION_NOTOUCH |
| Central MCP provider gateway | `src/server/central-mcp.ts` | per-call (TextMagic/Vapi/Tavus/Resend/VinSolutions creds) | PRODUCTION_NOTOUCH |
| systemd service | `scripts/hermes-studio.service`, `install-systemd.sh` | container lifecycle (port 3002, NODE_ENV=production) | PRODUCTION_NOTOUCH |
| In-process background ticks | `src/server/background-ticks.ts` | env-gated OFF by default (`COMMS_TICK_ENABLED`, `SENTINEL_TICK_ENABLED`) | PRODUCTION_NOTOUCH when enabled |

**Constraint restated:** do not modify comms cadence, webhook routes/auth, cron intervals,
credential pathways, or messaging-hub schema. Scheduler ticks may be treated as **observable
events**, never as integration points, in Phase 0.

## 5. Prohibited-access confirmation

Inventory built from static file/`grep`/header inspection only. Nothing was run, registered,
scheduled, or activated. No Vin/Gmail/network access.
