# Customer Cluster — Defect Register

**Date opened:** 2026-05-29
**Phase scope:** C.0 – C.13 + C.11 + C.12

Severity classes:
- **B** = Blocker (must fix before Phase C is considered complete)
- **I** = Important (must fix before Nexxus decommission)
- **D** = Deferred (carried as a follow-up; non-blocking)

Each row records the smallest portable fix.

| ID | Severity | Phase | Description | Smallest portable fix | Status |
|---|---|---|---|---|---|
| D-C-001 | I | C.6 | TextMagic / Vapi / Tavus / Resend providers are not credentialed in production; adapters return `unconfigured`. | Operator provisions per-profile tokens in `~/.hermes/profiles/<p>/.env` and central-mcp `local.yaml`. Adapter code is unchanged. | Open — operator action |
| D-C-002 | I | (cross-phase) | Coolify `hermes-studio` container is the pre-Phase-C build. Routes `/p/$profile/{tools,comms,campaigns,knowledge,chat}` 404 on production. | Trigger Coolify redeploy. | Open — operator action |
| D-C-003 | D | C.5 | messaging-hub backend code lives in `src/server/messaging-*` rather than under `~/.hermes/studio-plugins/messaging-hub/server/`. Plugin manifest scaffold exists but is content-only. | Lift `messaging-hub-store`, `messaging-hub-bus`, `messaging-adapters`, `agent-autonomous-reply`, and related routes into the plugin directory. Touchpoint: plugin-loader to resolve `<plugin>/server/index.ts` entrypoints. | Open — portability follow-up |
| D-C-004 | D | C.9 / C.10 | Data page is a stub. No Metabase service provisioned; no per-profile DuckDB writer cron. | Operator-owned migration runway. Federation-MCP design at `docs/federation-mcp-design.md`. | Deferred per locked /goal scope |
| D-C-005 | D | C.1 | Storefront tab-route auth gate is client-side only. Studio-side mutation APIs have their own session check, but a future renderer that posts to a new write endpoint must also re-check `is_customer_admin && session.profile === profile`. | Add a helper hook `useCustomerSession(profile)` that wraps the API + redirects on 403 so each renderer can lean on it consistently. | Deferred — RBAC follow-up |
| D-C-006 | D | C.5 | Process-local SSE bus (`messaging-hub-bus.ts`) — does not survive multi-replica Coolify deployments. | Coolify deploys hermes-studio as a single replica today, so this is currently fine. If we scale: replace with Redis pub/sub (Studio already has Redis client in `auth-middleware`). | Deferred |
| D-C-007 | D | C.7 | Comms keyboard-nav (j/k/r) doesn't yet handle macOS Cmd-shortcut conflicts in some keyboards. | Add modifier-key check and skip when meta/ctrl held. | Deferred — cosmetic |
| D-C-008 | D | C.8 | Audience `tags` filter is a no-op (no tagging table exists). Field is accepted for forwards-compat. | Add a `contact_tags` table + tagging API in a follow-up. | Deferred — forward compatibility shim |
| D-C-009 | D | C.5 | `messaging-hub-store.ts` resolveProfileForThread loops through all open DBs. O(n) over profiles; fine at small n but could become a hot path. | Memoize thread_id → profile in an in-memory map on append, or add a global threads index DB. | Deferred — premature optimization |
| D-C-010 | D | C.4 | tools-widget renderer "live preview" iframe points at production `studio.huminic.app` even in local dev. | Add a `?dev=1` URL param that overrides the iframe origin to `localhost:5176`. | Deferred — dev quality of life |
| D-C-011 | D | C.13 | Engagement-state advance allows skipping stages; the schema permits this (`skipped: false` is per-entry, not enforced). Customer-admin could leap from `draft` to `ready_to_run` and the API would write it. | Add an explicit ordering check in the advance handler, or rely on the data-governor agent to flag out-of-order advances. | Deferred — governance-rule check |
| D-C-012 | D | C.11 | C.11 validation harness is build-time (vitest integration), not browser Playwright. | Coolify-redeploy required before Playwright e2e against studio.huminic.app is meaningful. After redeploy, add `e2e/customer-cluster.spec.ts` walking the six pages. | Deferred — environment-gated |

## Notes

No B-severity defects open at the time of this readiness gate.

Cedar Ridge V4–V8 known issues (governor SOUL mistemplated, V7 ceremonial,
V8 rigged, simulated-operator approvals) are NOT entered here because per the
2026-05-29 operator decision Cedar Ridge is historical record and the AC.11 +
AC.13.4 cleansed validations supersede it. They remain documented in
`docs/cedar-ridge-readiness-report.md`.
