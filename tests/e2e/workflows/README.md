# Phase 8 workflow-surface Playwright eval suite

**Purpose.** Replace the prior page-based smoke suite (`tests/e2e/smoke.spec.ts`, `tests/e2e/artifacts-widget.spec.ts`) with a workflow-surface suite designed against `docs/launch/WORKFLOWS.md` rather than against pages/routes/single-actor renderers. Per the operator diagnosis recorded in `docs/launch/PLAN.md` Phase 8: the prior eval tested *button-existence*, this suite tests *work-completion-across-actors-and-time*.

**Coverage by actor:**

| File | Workflow ids | Status |
|---|---|---|
| `01-operator.spec.ts` | WF-OP-001 .. WF-OP-007 | mixed — some end-to-end, some `.fixme` |
| `02-consulting-human.spec.ts` | WF-CHO-001 .. WF-CHO-005 | mostly `.fixme` (engagement seed UI gap + Provisioner not built) |
| `03-customer-admin.spec.ts` | WF-CA-001 .. WF-CA-008 | mostly end-to-end |
| `04-consultative-agent.spec.ts` | WF-CON-001 .. WF-CON-005 | mostly `.fixme` (requires live LLM + curated fixtures) |
| `05-runtime-agents.spec.ts` | WF-RT-001 .. WF-RT-005 | mostly `.fixme` (OP-002 credentials + per-dealer enablement) |
| `06-comms.spec.ts` | WF-CMS-001 .. WF-CMS-006 | mixed — inbound parse end-to-end, outbound dispatch `.fixme` (OP-002) |
| `07-federation-rollup.spec.ts` | WF-FED-001 .. WF-FED-003, WF-RLP-001 .. WF-RLP-003 | mostly end-to-end (deny path), real-data path `.fixme` |
| `08-ksg-dsg.spec.ts` | WF-KSG-001 .. WF-KSG-005, WF-DSG-001 .. WF-DSG-005 | mostly end-to-end (write-time gates), scanner `.fixme` (`GAP-KSG-SCANNER-001`) |
| `09-cross-actor.spec.ts` | WF-XAC-001 .. WF-XAC-006 | mostly `.fixme` (XAC-001 needs Provisioner + GAP-CUSTOMER-INVITE-001) |
| `10-failure-recovery.spec.ts` | WF-F&R-001 .. WF-F&R-007 | mixed — KSG block recovery end-to-end, adapter-failure `.fixme` |

**Convention.**

Each test starts with a `// WF-<id>` comment on its first line. Tests blocked by infrastructure use `test.fixme(...)` with a `// GAP-<id>` comment naming the row in `docs/launch/PLAN.md` running log. No silent skips — every blocked test is auditable.

**Headed + headless.**

Headless via `pnpm exec playwright test`. Headed via `pnpm exec playwright test --headed --workers=1` against a local dev server. Live-deployed headed pass uses Playwright MCP (`mcp__plugin_playwright_playwright__*`) per `feedback_live_headed_sweep.md` — done by the implementing agent against `https://studio.huminic.app` with fresh localStorage + cleared cookies. Live headed pass results live in `docs/launch/evidence/phase8-headed-sweep/`.

**Failure mode for the run.**

The `.fixme` markers do not block the suite from passing. They serve as *audit markers*: each `.fixme` is a workflow that the prior conditional GO claimed worked but actually depends on infra that doesn't exist yet. The triage view at `docs/launch/TRIAGE.md` (Phase 8 step g) aggregates the count.

**Cross-references.**

- `docs/launch/WORKFLOWS.md` — workflow rows + actor mapping.
- `docs/launch/PLAN.md` running log — GAP-* rows.
- `docs/launch/manuals/` — workflow prose with button-where-it-doesn't-exist documented.
- `docs/launch/evidence/EVIDENCE_INDEX.md` — live evidence captures.
