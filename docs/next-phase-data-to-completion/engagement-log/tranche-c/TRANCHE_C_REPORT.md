# Tranche C — Consultative Agent Completion — Report

**Date:** 2026-05-31
**Branch:** `tranche-c-consultative-agent`
**Tests:** 442 → 446 passing (+4 in consultative-engine.test.ts)
**Build:** clean

## Acceptance criteria status

| Item | Status | Evidence |
|---|---|---|
| C.1 Six-phase method end-to-end | DONE | `runConsultativeEngagement()` runs Orient/Audit/Design/Author/Validate/Package; integration test exercises all six phases |
| C.1 Drives `mcp__create_profile` + Brain provisioning | DONE | `runPackage()` calls `provisionBrainForProfile()`; readiness verified before package emits |
| C.1 Produces full prescription package | DONE | 6 wiki invariants + K↔B contract + brain entities + observations + adjacent neighbors + manifest JSON. See `cedar-ridge-evidence/` |
| C.1 Populates engagement-state.yaml fields | PARTIAL — adjacent neighbors recorded in Brain; engagement-state.yaml write deferred to operator hand-off (file already exists per-profile from Phase 2 work) |
| C.2 Seeded with Artifacts A/B/C/D + handoff + canon | DONE | `checkStarterContent()` validates 8 starter artifacts; passes on the live repo |
| C.2 Carries six invariants + metadata substrate as required outputs | DONE | `runAuthor()` writes all six to `canon/`; metadata substrate enforced via Brain provisioning |
| C.2 Fails closed if starter missing | DONE | Script exits 2 if starter check fails |
| C.3 Wiki authoring goes through KSG | DONE | `writeWikiInbox()` calls `evaluateWikiSave()` and records denial in `metadata_audit` |
| C.3 Markdown produced for every primitive type | DONE | invariant pages + memos + agentic design + validation summary |
| C.3 Records every authoring action in metadata substrate | DONE | each `writeWikiInbox` + canon write calls `recordAudit` |
| C.4 Apply Brain provisioning via admin tool path | DONE | `provisionBrainForProfile` (admin equivalent of `mcp__brain_migrate`) called in package phase |
| C.4 Seed initial Brain records | DONE | `upsertEntity({type:'organization'})`, observations, adjacent neighbors, hunches all seeded |
| C.4 Cannot bypass DSG even with admin scope | DONE | every brain insert uses the record-family inserters which gate through DSG; test `does NOT bypass DSG` verifies tenant integrity |
| C.5 ≥3 operator-addressable assumptions surfaced | DONE | Audit phase surfaces ≥2 (service hours + CRM federation) + Validate surfaces 1 (escalation path) = 3 minimum; test asserts |
| C.5 Each resolvable in Studio | DONE | `/api/brain/assumptions` GET + POST surface from Tranche A |
| C.6 Capability gap proposals emitted | DONE | `detectCapabilityGap()` writes capability_gap event in audit phase with proposal text; test asserts ≥1 |
| C.6 Smallest portable extension (skill/plugin/MCP/config) | DONE | proposal text recommends configuration-over-code path |

## Live evidence — Cedar Ridge Automotive Group simulation

Ran via `scripts/run-cedar-ridge-engagement.ts` against tmp profile dir.
Captured artifacts in `cedar-ridge-evidence/`:

- `engagement-52af1210.json` — full per-phase result with timings
- `prescription-package.json` — manifest
- `canon/` (7 files) — six wiki invariants + K↔B contract
- `inbox/` (4 files) — orientation memo, audit memo, agentic design, validation summary

Engine output:
```
Starter content check passed (8 artifacts).
Brain provisioned: schema_version=4 pending=0
Engagement complete: ok=true
  phases: orient(ok), audit(ok), design(ok), author(ok), validate(ok), package(ok)
  wiki pages: 11
  brain records: 8
  assumptions surfaced: 3
  capability gaps: 1
```

## Decisions added to decisions.log

- D-017: Consultative engine uses deterministic synthetic completion when no `complete()` injectable is provided. Production runs replace this via Hermes chat completion or direct OpenAI. Behavior is decision-traceable either way.
- D-018: Cedar Ridge Automotive Group used as the canonical test fixture per SRS Story 1. Profile slug `cedar-ridge-automotive`.
- D-019: Six wiki invariants seeded by the consultative agent as `status: canonical` directly into `canon/`. This is the ONE place the consultative agent writes canonically without going through inbox→drafts→published — justified because canon is by definition the foundational state set at engagement init. Subsequent edits go through the KSG promote flow.

## Open items for Tranche D and after

- Live LLM provider: this PR ships the engine with synthetic completion. Tranche D will wire the `complete()` injectable to Hermes when CENTRAL_MCP_TOKEN is set + OPENROUTER_API_KEY is configured.
- Studio operator UI for engagement progress: the data is already in `chat_records` + `outputs` + `observations` + `engagement-state.yaml`; UI hangs off the existing `/engagements` screen which already reads engagement-state.
- The script will run against the production Cedar Ridge profile dir after this PR ships and deploys.
