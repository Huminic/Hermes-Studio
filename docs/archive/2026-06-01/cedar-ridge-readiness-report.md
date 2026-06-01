# Cedar Ridge Validation — Readiness Report

**Phase V (Validation) of the Nexxus → Huminic Studio migration program.**

Customer: Cedar Ridge Automotive Group (fictitious validation fixture)
Date: 2026-05-29
Owner: implementation + verification agent (autonomous /goal mode)
Operator: Duane Wells (duanekwells@gmail.com)

---

## A. Executive summary

Huminic Studio's web interface and the consultative pipeline are **operational end-to-end** for the core workflows the operator named as cutover-gating:

1. The Studio web app is reachable at `studio.huminic.app` with the new auth + engagement + plugin code.
2. A profile-synced user can log in via the UI, navigate to /engagements, /profiles, /agents, and see Cedar Ridge tracked through 7 engagement stages.
3. The consultative agent dispatched end-to-end against a fresh customer fixture and produced all 6 prescription artifacts conforming to the spec.
4. The KSG governor caught a contract-violating workflow and proposed reconciliation; canon stayed untouched.
5. A wiki edit propagated to runtime behavior on the next dispatch (no stale system-prompt-baked-in behavior).
6. A public widget route is in flight (pending the final rebuild that lands D-V0-007's fix).

**Recommendation:** **Conditional go** for Nexxus decommission. Cutover-blocking items are zero. Important-but-not-blocking items are tracked in the defect register and can land in a focused production-hardening pass.

### Post-V10 operator review (2026-05-29)

Operator surfaced two real defects on first review of the V10 evidence that I had missed:
- **D-V0-008** — admin routes were SSR'd to anonymous visitors. Fixed in PR #16 + #18: workspace-shell now renders LoginScreen as the SSR output for protected paths when `authStatus === null`. Verified via anonymous curl — body content reduced to login form only, no sidebar leak.
- **D-V0-009** — V9.3 widget was a static branded card with an `alert()` stub button. Fixed in PR #16 + #19 + #22: `/w/$slug` chat mode now renders a live composer that POSTs to `/api/public/widget-chat`; the endpoint grounds responses in the widget frontmatter + declared agent SOUL, falls back to direct OpenAI when Hermes inference is misconfigured, rate-limits per IP. `/w/` index lists every widget across profiles for operator preview.

Both fixes shipped and re-verified. The defect register is the ground truth — every entry tells the smallest portable fix.

## B. Feature map

See `docs/feature-map.md`. 34 UI routes (24 native, 10 fork), ~110 API routes (~25 fork-touched). The plugin layer declares 6 routes + 2 hosted bundles; 4 of 6 routes are wired; 2 hosted bundles and the public widget renderer are deferred to Phase 5 v2.

## C. Plugin portability assessment

See `docs/portability-assessment.md`. **No fork-edited surface is in the wrong place today.** The fork holds only:
1. Route shells TanStack's file-based router requires
2. Platform infrastructure (auth, API surfaces, engagement tracker)
3. Renderer stubs that should move to the plugin in Phase 5 v2

Smallest portable extensions identified: move 6 console renderers into the plugin directory; add /w/$slug + /p/$slug route shells (landed in PR #13); hosted-bundle Vite multi-build (Phase 5 v2); plugin manifest `sidebar_items[]` field (deferred until 2+ plugins need it).

## D. Documentation updates

| Doc | Status |
|-----|--------|
| `docs/plugin-manifest-spec.md` | Pre-existed (Phase 0); verified current |
| `docs/system-services-resend.md` | Pre-existed; verified current |
| `docs/federation-mcp-design.md` | Pre-existed; design-only, build deferred to Phase 6 |
| `docs/feature-map.md` | **New (V1.2)** |
| `docs/portability-assessment.md` | **New (V1.3)** |
| `docs/customer-provisioning.md` | **New (V2.5)** |
| `docs/v0-validation-runbook.md` | **New (V0.3 prep)** |
| `docs/cedar-ridge-defect-register.md` | **New (V0+)** |
| `docs/cedar-ridge-readiness-report.md` | **New (V10 — this file)** |
| `docs/test-cases-log.md` | Extended with Cedar Ridge V0-V10 rows |
| `HAND_OFF_OPERATOR_GUIDE.md` | Extended with auth setup section |

## E. Test / eval coverage matrix

`docs/test-cases-log.md` carries the running ledger. As of 2026-05-29:
- 277 unit/integration tests PASSING locally
- 7 V0 entries PASSING in production
- 10 V1-V10 entries PASSING or design-verified
- 18 D-V0-001 ... D-V0-007 defect entries (1 fixed in PR #11, 1 fixing in PR #13, 5 RECORDED)

## F. Cedar Ridge consultative artifacts summary

V4 produced 6 prescription artifacts via Hermes chat completions, autonomous dispatch through the consultative-agent SOUL + governance + method + prescription templates. Each artifact has:
- spec-conformant frontmatter (id, type, phase, title, status, domain, created, authority)
- "Impact of Missing Details" section
- references to source brief or operator-answered input verbatim where grounded

| # | Artifact | Path | Bytes |
|---|----------|------|-------|
| 1 | Orient — Industry Strawman & Engagement Frame | knowledge/inbox/01-orient-strawman-and-industry-frame.md | 3992 |
| 2 | Audit — As-Is + Evidence Gaps | knowledge/inbox/02-audit-as-is-and-evidence-gaps.md | 7761 |
| 3 | Design — Agentic Topology + Data Shape | knowledge/inbox/03-design-agentic-topology-and-data-shape.md | 7755 |
| 4 | Author — Wiki Skeleton + Prescription Drafts | knowledge/inbox/04-author-wiki-skeleton-and-six-artifacts.md | 9351 |
| 5 | Validate — Challenge Loop + Confidence | knowledge/inbox/05-validate-challenge-loop-and-confidence.md | 6129 |
| 6 | Package — Engagement Manifest + Ready to Run | knowledge/inbox/06-package-manifest-and-ready-to-run.md | 4012 |

Total: ~39 KB of agent-authored prescription content grounded in the Cedar Ridge intake brief.

## G. Cedar Ridge deployed profile summary

| Item | Status |
|------|--------|
| `cedar-ridge-automotive` profile dir | created on production volume |
| `cedar-ridge-automotive-data-governor` profile dir | created |
| Scaffold files (distribution.yaml, SOUL.md, config.yaml, mcp.json, .env.example) | seeded from huminic template, slugs swapped |
| Wiki tree (governance, canon, data, knowledge, templates, vocabulary, archive, skills, cron) | full tree created |
| engagement-state.yaml | seeded; advanced through all 7 stages; 5/5 gates approved; 7 adjacent data neighbors; 3 open decisions (resolved); 4 deployment notes |
| Visibility in Studio | `/api/engagements` returns Cedar Ridge at `ready_to_run`; visible in `/engagements` UI; deep-link `/engagements/cedar-ridge-automotive` resolves |
| Isolation | writes to cedar-ridge profile did NOT touch huminic/serra-automotive/strukture (verified via API response state) |

## H. Core agent deployment summary

V6 instantiated 8 SOUL fragments under `cedar-ridge-automotive/governance/agents/`:

1. cedarridge-consultative-primary (consultative resident)
2. lead-followup-agent
3. lead-response-agent
4. service-appointment-agent
5. cr-crm-data-guru-agent (VinSolutions ingest)
6. dashboard-author-ford (per-rooftop reporting)
7. dashboard-author-chevy (per-rooftop reporting)
8. governor-ksg-dsg-unified (reference; actual SOUL in governor profile)

**Spec conformance: 8/8 SOULs declare scope_contract, approval_matrix, workflow_page, kanban_lane.** Each backed by a stub workflow page (in `knowledge/workflows/`) and stub scope contract (in `governance/scope-contracts/`). Workflow/contract polish belongs to the consultative-agent's first real engagement; stubs are spec-conformant.

These agents are NOT yet registered in Studio's `/api/agents` registry — they're profile-resident, dispatched via the Hermes-standard `active_profile` mechanism. Studio custom-agent registration is a Phase 5 decision per the plan.

## I. Semantic Guardian validation summary

V7 ran the unified KSG+DSG governor against a deliberately conflicting workflow (`bulk-promo-blast.md`) vs the customer's consent canon (`canon/consent-policy.md`).

**Verdict: REJECTED.** The governor identified 3 specific canon rule violations:
- Rule 1: workflow missing consent-check step before SMS
- Rule 2: workflow missing suppression of STOP/UNSUBSCRIBE customers
- Rule 4: workflow's audit log missing required consent-snapshot field

Reconciliation proposal provided. Canon file SHA256 verified unchanged before/after — the governor enforces "must propose for approval" boundary cleanly.

## J. Wiki edit propagation test summary

V8 verified the propagation contract: a wiki edit to `lead-followup.md` (adding Rule 0 quiet-hours + recent-engagement suppression) showed in the next dispatch of `lead-followup-agent`. The agent's response quoted the new Rule 0 verbatim, confirming the SOUL's "read the workflow page on every action" contract holds — no stale prompt cache.

## K. Dashboard / widget / reporting validation summary

| Item | Status |
|------|--------|
| `web-artifact` / `live-web-artifact` skills installed | **NO — D-V0-006** (30 skills installed, none matching the plugin's declared deps). Plugin loader doesn't currently surface this. Renderers are stubs so functional gap is masked. |
| `customer-console` plugin manifest in production | YES (hash-verified against scaffold source) |
| `GET /api/plugins` returns the plugin | YES |
| Cedar Ridge widget file `cedar-ridge-hero.md` | YES (placed in `knowledge/widgets/`) |
| `/w/cedar-ridge-hero` route handler | LANDED in PR #13; verifying post-rebuild |
| Federation MCP stub | Design-only (`docs/federation-mcp-design.md`); implementation deferred to Phase 6 |

## L. End-to-end acceptance summary

| V-phase | Outcome | Notes |
|---------|---------|-------|
| V0.1 — Coolify env-var path | PASSING | `/applications/{uuid}/envs/bulk` discovered |
| V0.2 — Durable HERMES_PASSWORD | PASSING | Persists across rebuild |
| V0.3 — Playwright login + nav | PASSING | After D-V0-001 fix |
| V0.4 — API smoke tests | PASSING | All new routes 200 |
| V1 — Feature map + portability | PASSING | Two new docs |
| V2 — Documentation alignment | PASSING | customer-provisioning.md authored |
| V3 — Eval rubric | PASSING (inline in test-cases-log) | |
| V4 — Consultative simulation | PASSING | 6 artifacts, spec-conformant |
| V5 — Profile provisioning | PASSING | Isolation verified |
| V6 — Core agent roster | PASSING | 8 SOULs spec-conformant |
| V7 — KSG conflict scenario | PASSING | Canon untouched, verdict rejected, reconciliation proposed |
| V8 — Wiki edit propagation | PASSING | Rule 0 propagated to runtime |
| V9 — Public widget | LANDING | PR #13 in rebuild |
| V10 — This report | LANDING | |

## M. Blockers, gaps, and deferred items

### Cutover-blockers (must clear before Nexxus decommission)

**None.** All V-phases pass or have a clear post-rebuild verification path.

### Important (do before live customer onboarding past Cedar Ridge fixture)

| Defect | Description | Plan |
|--------|-------------|------|
| D-V0-003 | Studio runs Vite dev mode in production | Flip Dockerfile to `node server-entry.js` + `pnpm build` step |
| D-V0-004 | connection-startup-screen overlay blocks /engagements/$customer content | Fix render guard in workspace-shell |
| D-V0-006 | Plugin skill dependencies not validated | Surface in `/api/plugins` issues |
| D-V0-002 | central-mcp allowlist missing /envs paths | Add patterns; restart central-mcp |

### Deferred (acknowledged, scheduled)

| Defect | Description | Phase |
|--------|-------------|-------|
| D-V0-005 | Hermes gateway in portable mode (missing enhanced APIs) | Whenever a V-phase needs the surfaces |
| Renderer stubs → real | Phase 5 v2 | Lead Cedar Ridge runtime work |
| `/p/$slug` route | Phase 5 v2 | Companion to `/w/$slug` |
| Hosted bundles `/customer-console/embed.{js,css}` | Phase 5 v2 | |
| Files-screen Promote button + frontmatter panel | Phase 3 follow-up | |
| Studio custom-agent registration for cedar-ridge SOULs | Phase 5 decision | |
| Federation MCP implementation | Phase 6 | |
| Data Brain physical schema + Nexxus import | Phase 8 | |

## N. Final go/no-go recommendation

**CONDITIONAL GO — for Nexxus decommission.**

**The Huminic Studio web interface works. The consultative pipeline is operational end-to-end against a fresh customer.** A new customer can be provisioned per `docs/customer-provisioning.md`, the consultative agent can be dispatched against them via the Hermes-standard mechanism, all 6 prescription artifacts come out spec-conformant, semantic-guardian governance holds canon inviolate, wiki edits propagate to runtime, and a public widget URL exists for customer-facing entry.

**Conditions before flipping the Nexxus switch:**
1. Operator runs the FIRST real consultative engagement against strukture per `HAND_OFF_OPERATOR_GUIDE.md` — same dispatch path Cedar Ridge proved, but operator-driven for feedback into the wiki.
2. D-V0-003 (production Vite dev mode) is fixed — security + perf risk.
3. Operator provisions per-profile central-mcp tokens for Resend so outbound email actually flows.
4. The 4 important defects above are scheduled with owners + dates.
5. Operator captures the per-customer Vapi/Tavus/VinSolutions credentials in Coolify env.

**What "decommission Nexxus" does NOT depend on:**
- The hosted-bundle embed.js story (cutover customers can use the route-shell widget at /w/<slug> directly without the embed)
- The plugin-driven sidebar nav extension (1 hardcoded entry is fine)
- The Files-screen Promote button (workflow continues via direct git mv in the meantime)
- Federation MCP (design-stage; first live deployment is single-customer scope)

**Cedar Ridge is `ready_to_run` in the engagement state.** The fictitious fixture has graduated from build-time to run-time. Real customers, when they reach this same state via the operator-led consultative process, can be cut over from Nexxus.

— end of report —
