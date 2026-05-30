# Nexxus → Huminic Customer Cluster — Parity Matrix

**Date:** 2026-05-29
**Phase:** C readiness review (AC.12.3)

For each Nexxus customer-side capability: classified as REPLACED, DEFERRED,
or DROPPED. Rationale included so the operator can review the boundary.

| # | Nexxus capability | Status | Huminic replacement | Rationale |
|---|---|---|---|---|
| 1 | Customer-facing chat with named agents | REPLACED | `/p/$profile/chat` — agent picker + SOUL + chat persona + Hermes round-trip | C.2 |
| 2 | Right-pane Automa assistant | REPLACED | `customer-console.assistant-pane` right-slot renderer | C.1 |
| 3 | Customer wiki edit/browse with KSG | REPLACED | `/p/$profile/knowledge` — tree + Monaco-lite editor + KSG gate + promote | C.3 |
| 4 | Public widget embed (chat) | REPLACED | `/w/$slug` + `/api/public/widget-chat` + customer-console.widget-public | C.4 (chat path from prior phases) |
| 5 | Public widget embed (voice) | DEFERRED | Vapi adapter scaffold (`messaging-adapters.dispatchVapi`); unconfigured until VAPI_API_KEY | C.6 — provider creds gate |
| 6 | Public widget embed (video) | DEFERRED | Tavus adapter scaffold; unconfigured until TAVUS_API_KEY + TAVUS_PERSONA_ID | C.6 — provider creds gate |
| 7 | Public widget embed (form) | REPLACED | `/api/public/widget-form` → messaging-hub thread, channel:form, domain:sales\|service | C.4 |
| 8 | Unified inbox (Sales + Service) | REPLACED | `/p/$profile/comms` — three-column inbox + SSE updates + domain switcher | C.5/C.7 |
| 9 | Multi-channel thread merge per contact | REPLACED | messaging-hub contact dedup by identifier; threads keyed (profile, domain, channel, contact_handle) | C.5 |
| 10 | Lead campaign management | REPLACED | `/p/$profile/campaigns` — Service-only sub-page with templates + audiences + tick | C.8 |
| 11 | Sales campaign sub-page (Nexxus had one) | DROPPED | — | Operator decision 2026-05-29: Service-only. No symmetric Sales-campaigns surface. |
| 12 | Service Recall / Due / Follow-up Lead templates | REPLACED | `src/server/campaign-templates.ts` seeds same three by name | C.8 |
| 13 | Scheduled outbound (cron-style) | REPLACED | `tickCampaigns()` worker + `/api/customer/campaigns/tick` endpoint | C.8 |
| 14 | ADF XML inbound (Serra dealer leads) | REPLACED | `src/server/adf-xml.ts` parser + inbound endpoint auto-tags `email-adf` channel | AC.6.7 |
| 15 | ADF XML outbound (to DMS) | REPLACED | `buildAdfXml()` emitter, round-trip validated | AC.6.8 |
| 16 | Agent-autonomous reply (Nexxus had a manual "agent reply" workflow) | REPLACED & extended | `src/server/agent-autonomous-reply.ts` rules-based dispatcher with per-thread/profile overrides | AC.5.8 |
| 17 | Self-serve dashboards (Nexxus built dashboards) | DEFERRED | data-canvas runway: Metabase React SDK + per-profile DuckDB | C.9/C.10 — operator-owned migration runway |
| 18 | Cross-profile federation queries | DEFERRED | federation-MCP design doc at `docs/federation-mcp-design.md`; skill stub only | C.9 (operator-owned execution) |
| 19 | Stats / metrics dashboard (Nexxus had one) | DROPPED | — | Per operator: replaced by user-buildable dashboards in C.10. The Nexxus fixed-stats screen is not reproduced. |
| 20 | TeamBox unified inbox runtime | DROPPED | — | Per plan reconciliation: not ported. The unified inbox is built fresh on Hermes BasePlatformAdapter (#8 above). |
| 21 | Nexxus profile-switcher | REPLACED | Studio admin keeps the existing profile switcher; customer-admin is scoped per profile via subdirectory URL | C.1 |
| 22 | Customer-admin login | REPLACED | per-profile `auth.yaml` with `is_customer_admin` flag; storefront login at `/p/$profile/$tab` | C.1 |
| 23 | Studio admin (super-user) override of customer surfaces | REPLACED | `is_admin: true` carries access to all `/p/$profile/*` routes | C.1 |
| 24 | Customer-admin password reset (self-serve) | DEFERRED | Resend token wiring exists; UI flow not built | RBAC follow-up |
| 25 | Multi-user per profile | DEFERRED | one user per profile via single auth.yaml today; multi-user via `users:` array is a future schema bump | RBAC follow-up |
| 26 | Per-screen RBAC | DEFERRED | binary is_admin / is_customer_admin today | RBAC follow-up |
| 27 | Customer-admin engagement state (Huminic consultative round-trip) | REPLACED | Tools sub-page Consult on tools_widget.consult=true; `/api/customer/engagement-state` advance + gate approval | C.13 |
| 28 | Vapi voice round-trip evidence | DEFERRED | adapter scaffold present; provider credentials operator-action | AC.6.2 |
| 29 | Tavus video round-trip evidence | DEFERRED | adapter scaffold present; provider credentials operator-action | AC.6.3 |
| 30 | TextMagic SMS round-trip evidence | DEFERRED | adapter scaffold present; provider credentials operator-action | AC.6.1 |
| 31 | Resend email round-trip evidence | DEFERRED | adapter routes via central-mcp resend tool; per-profile tokens operator-action | AC.6.4 |

## Summary

- REPLACED: 18
- DEFERRED (operator-action or runway): 11
- DROPPED (operator decision): 2

All DROPPED rows are deliberate operator decisions, captured in plan
reconciliation block 2026-05-29 (Decisions 4 and 5). All DEFERRED rows have a
clear operator-action gate or a recorded follow-up RBAC plan. No silent
omissions.
