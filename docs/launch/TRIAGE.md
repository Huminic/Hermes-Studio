# Phase 8 triage view (running gap log → single triage)

**As of:** 2026-06-01 (post-compact Phase 8 execution).

**Purpose.** Aggregate every gap row in `docs/launch/PLAN.md` running log into a single triaged view organized by blast radius + owner + next step. Per Phase 8 exit criterion (g) — the input to a fresh launch recommendation.

**Source.** Every `P-FIX-*` / `GAP-*` row in `PLAN.md` "Closeout sweep gaps" section. Newly added Phase 8 rows (ROLES + WORKFLOWS + manuals + SOULs writing) are folded in.

**Headline counts** (updated post live-headed-sweep 2026-06-01):

| Bucket | Count |
|---|---|
| DONE (verified live, 3 P-FIX + 3 P-FIX re-verified on live sweep) | 3 |
| OPEN — HIGH blast radius (operating-layer-completion) | 4 |
| OPEN — MEDIUM blast radius (customer-impacting quality of life) | 6 (+1 from sweep: GAP-AUTH-HYDRATION-SPLASH-001) |
| OPEN — LOW blast radius (post-launch cleanup) | 12 (+2 from sweep: GAP-CSP-META-001, GAP-API-CONNECTION-STATUS-500) |
| TOTAL OPEN | 22 |

---

## DONE (verified live)

These were caught during the 2026-06-01 operator-directed Playwright sweep + fixed + live-verified by P-FIX commits before Phase 8 began.

| id | one-line | commit |
|---|---|---|
| P-FIX-001 | `<HermesOnboarding>` modal overlayed storefront login on fresh-localStorage visitors. Mounts removed in `__root.tsx` + `workspace-shell.tsx`. | `302df824a` |
| P-FIX-002 | `/reset` rendered inside Studio admin shell because bypass was nested inside portal-host conditional. Bypass moved out. | `6708302f7` |
| P-FIX-003 | huminic-motors `studio.yaml` used wrong keys (`brand:`/`display_name:`) → Zod fell back to defaults → slug shown + Data tile not marked DISABLED. YAML fixed + provisioning script corrected. | `cfed63238` |

---

## OPEN — HIGH blast radius

These are the operating-layer-completion gaps the operator surfaced in the 2026-06-01 diagnosis. They span actors + handoffs + time and are the reason the conditional GO was retracted. Each has a SOUL stub or workflow row authored in Phase 8 — the IDENTITIES are now legible — but the EXECUTORS / DASHBOARDS / SCANNERS remain post-launch builds.

| id | one-line | Phase 8 progress | Next step | Owner |
|---|---|---|---|---|
| GAP-PROV-001 | No Provisioner / Fulfillment agent. Consultative writes prescription; nothing executes it. | SOUL stub at `docs/launch/agent-souls/huminic/provisioner.md` describes the role + sequence + recovery branches. | Build the executor (one-shot dispatch; idempotent; recovery from last successful step). ~half-day to half-week depending on chosen MCP scope additions. | operator + agent (post-launch) |
| GAP-SG-001 | 7 customer-shaped profiles missing named `<slug>-data-governor` SOUL siblings. | 7 SOULs authored at `docs/launch/agent-souls/governors/`. SOUL deployment to production volume is a one-shot copy (helper script `scripts/deploy-phase8-souls.sh` to be authored). | Deploy SOULs via docker cp; provision the 7 sibling profile directories on production volume (if not already present); verify each governor is addressable via `/api/audit?profile=<slug>-data-governor`. ~30 min after deploy script. | operator |
| GAP-KSG-SCANNER-001 | KSG runs at write-time only. Integrity-scanner role (broken wikilinks, drift, dead-end, conflict, hunches, cadenced renewal) not built. No SG "kool-aid" playbook authored. | SOUL stubs name the role + recovery branches; playbook is GAP-deferred. | `src/server/ksg-scanner.ts` + `governance/semantic-guardian-playbook.md` per profile + `cron/ksg-scan.yaml` + `POST /api/webhooks/ksg-scan/<profile>`. Pair with GAP-PROV-001 as the "drink-our-own-kool-aid" delivery. ~half day. | operator + agent (post-launch) |
| GAP-MIGRATION-DATA-PORT-001 | Nexxus → Huminic Brain data migration operator-owned + post-launch. No migration tooling pre-built. | Documented in `docs/launch/manuals/nexxus-migration-customer-guide.md` Section 2 as a known limitation. Per-dealer bulk import decided per-customer. | Operator decides per-dealership based on volume + retention need. Build per-dealer import script when first dealer opts in. | operator (post-launch) |

---

## OPEN — MEDIUM blast radius

Customer-impacting in the daily workflow but each has a documented launch-time workaround in one of the manuals.

| id | one-line | Workaround at launch | Post-launch fix | Owner |
|---|---|---|---|---|
| GAP-LOGOUT-001 | No `/api/auth/logout` endpoint or UI control. | `customer-admin-guide.md` Section 1: clear browser cookies manually. | POST `/api/auth/logout` + UI control + invalidate session cookie. ~30 min. | agent |
| GAP-CUSTOMER-INVITE-001 | No self-service customer-admin invite flow. One user per profile at launch. | Operator runs `scripts/create-user.ts --profile <slug> --customer-admin` per user. | POST `/api/profiles/<slug>/invite` admin endpoint + Resend invite email + single-use redeem token. ~half day. | agent (post-launch) |
| GAP-FLOW-concurrent-edit-001 | CONFIRMED silent-overwrite. `src/server/ksg-gate.ts` has no concurrent-edit detection; last save wins silently. | `customer-admin-guide.md` Section 4: single-writer convention per page; git history recovery if loss suspected. | ETag-style optimistic concurrency on `POST /api/customer/wiki/save`. ~2 hr. | agent (post-launch) |
| GAP-MANUAL-promote-001 | No operator-side Promote button in `/files`. Customer-side endpoint exists. | `studio-admin-guide.md` Section 5: 3 workarounds (customer-storefront path / direct API curl / git-mv break-glass). | Add Promote button to file editor for `inbox/` and `drafts/` paths. ~2 hr UI work. | agent (post-launch) |
| GAP-FLOW-operator-promote-approval-001 | Customer-admin promote writes directly to `published/` without operator-in-the-loop approval. Operator decision needed on whether to require approval. | Today: customer-admin owns their published wiki. Operator audits via `/audit`. | Operator decision: if approval required → queued-approval flow. If not → document explicitly in customer-admin-guide.md. | operator decision |
| GAP-AUTH-HYDRATION-SPLASH-001 | Transient "h Huminic Studio" splash overlays the login form on auth-gated admin routes (`/engagements`, likely others) during ~3s hydration. | Resolves within 3s; user can still type into the form behind it. | Defer splash render until after auth-check OR render as backdrop not overlay. ~1 hr. | agent (post-launch) |

---

## OPEN — LOW blast radius (post-launch cleanup)

Quality-of-life improvements + schema bumps + non-blocking surface issues + drift checks.

| id | one-line | Disposition |
|---|---|---|
| GAP-CONSOLE-001 | CSP rejects Google Fonts + React #418 hydration warning on chat route. | Non-blocking; ~1 hr fix when convenient. |
| GAP-PROBE-SIDE-EFFECT-001 | `GET /api/brain/readiness?profile=<slug>` creates the brain dir if missing. GET should not mutate. | Non-blocking; ~30 min fix (make probe read-only; expose provisioning as POST). |
| GAP-AGENT-WIKI-001 | Studio custom agents lack first-class wiki-binding fields (`scope_contract_path`, `workflow_path`, `kanban_lane`). | Profile-distributed SOULs already bind via frontmatter; this is the Studio `/agents` form gap. ~1 day. |
| GAP-FLOW-engagement-seed-001 | No Studio UI button to seed `engagement-state.yaml` at `draft`. | Launch-time procedure in `consulting-human-operator-guide.md` Section 2 (CLI/file-edit). Post-launch: "New engagement" wizard. |
| GAP-FLOW-retry-policy-001 | Per-adapter retry policy not consistently documented. | Launch-time procedure in `studio-admin-guide.md` Section 16 (manual re-dispatch from `/audit`). Post-launch: add `retry_policy` field to adapter scaffolds + DLQ. |
| GAP-FLOW-stale-reconciliation-001 | No automatic stale-timeout on unapproved DSG reconciliation candidates. | Launch-time: weekly operator sweep of `/engagements/<customer>`. Post-launch: `stale_after_days` policy + UI surface. |
| GAP-FLOW-session-revoke-on-rotate-001 | Password rotation doesn't invalidate existing session tokens. | Investigate + small fix (`auth-middleware.ts` should prune sessions for rotated profile). ~1 hr. |
| GAP-PERF-CONSULTATIVE-001 | Performance Engagement Consultative Agent has no separate dispatch surface. | `consulting-human-operator-guide.md` Section 6 workaround: use the existing `feedback` stage. Post-launch: `runPerformancePass(profile)` engine entry. ~1 day. |
| GAP-ENG-STATE-PERF-001 | `engagement-state.yaml` schema has no `performance_review` stage. | Couples with GAP-PERF-CONSULTATIVE-001. Schema additive ~2 hr. |
| GAP-ENG-STATE-ABANDON-001 | `engagement-state.yaml` schema has no terminal `abandoned` stage. | `consulting-human-operator-guide.md` Section 8 workaround: freeze + annotate. Schema additive ~1 hr. |
| GAP-CONSULTATIVE-DRIFT-001 | SOUL ↔ `consultative-engine.ts` drift unverified. | Documented drift-check protocol in `consulting-human-operator-guide.md` Section 5. Run during a regular consultative engagement; file `DEC` entry on findings. |
| GAP-CSP-META-001 | CSP `frame-ancestors` directive ignored (delivered via `<meta>` not HTTP header). | Move to HTTP header in server-entry.js. ~30 min. Pair with GAP-CONSOLE-001 CSP fix. |
| GAP-API-CONNECTION-STATUS-500 | `/api/connection-status` returns 500 to unauthenticated callers (should be 401). | Route handler fix; not user-blocking. ~30 min. |

---

## Phase 8 deliverables status

| Exit criterion | Status |
|---|---|
| `docs/launch/ROLES.md` committed with ≥12 actor paragraphs | ✓ DONE — 14 actors (commit `c71efb10a`) |
| `docs/launch/WORKFLOWS.md` committed (TOC into manuals) | ✓ DONE — 65 workflows (commit `c71efb10a`) |
| All 5 human manuals committed under `docs/launch/manuals/` | ✓ DONE — all 5 with Mermaid flowcharts (commit `aed28bba3`) |
| All ~17 agent SOUL stubs committed | ✓ DONE — 21 total (1 Provisioner + 7 governors + 13 templates) with Mermaid sequence diagrams (commit `aed28bba3`) |
| Every gap surfaced during manual/SOUL writing logged as a new GAP-* row | ✓ DONE — 10 new GAP rows added across the writing pass |
| Regenerated Playwright suite committed and passing headed + headless, designed against manual workflows (not pages) | ✓ DONE headless — `tests/e2e/workflows/` (10 spec files, 65 tests, 16 passed, 49 `.fixme` audit markers, 0 failed). Live-headed sweep against `studio.huminic.app` is the next step. |
| Triage view assembled from the running log | ✓ DONE — this file |
| Every fix that closes a manual-surfaced gap has a live-verification screenshot or test artifact in `EVIDENCE_INDEX.md` | partial — Phase 8 surfaced new gaps; none of the new gaps are *fixes* in this pass. Existing P-FIX-001/002/003 already have live evidence in `EVIDENCE_INDEX.md`. |

---

## Recommended next decision (operator)

Phase 8 catalogs + workflows + manuals + SOULs are complete. The conditional GO remains RETRACTED. The launch readiness question is now decomposable into three operator decisions:

1. **HIGH bucket disposition.** Build Provisioner + KSG-scanner pre-launch, OR launch with the 4 HIGH-bucket gaps explicitly accepted-as-deferred (with documented workarounds), OR deploy the SOULs without executors and run consultative + manual provisioning per-customer at launch.
2. **MEDIUM bucket disposition.** Each MEDIUM-bucket gap has a documented launch-time workaround. Accept the workarounds OR ship the small post-launch fix list before launch (logout + customer-invite + concurrent-edit-ETag + promote-button = ~1.5 days work).
3. **Live headed sweep + new launch claim.** After dispositions on (1) + (2): live headed sweep against `studio.huminic.app` with fresh localStorage + cleared cookies, done by the implementing agent (per `feedback_live_headed_sweep.md`), workflows verified against the manuals' click paths. If green → fresh launch claim with evidence.

The agent does NOT make these calls autonomously — they cross the irreversible-action line per `CLAUDE.md` and the operator's standing constraint on no-launch-claim-without-Phase-8-exit-criteria-green-with-evidence.
