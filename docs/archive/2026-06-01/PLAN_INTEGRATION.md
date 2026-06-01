# Plan Integration — Next Phase SRS folded into active plan

**Created:** 2026-05-31
**Status:** ACTIVE
**Supersedes:** 2026-05-30-portal-auth-cutover-plan.md (CZ work folds into this as Tranche A.1 sub-deliverables)

This document is the integration of the Next Phase SRS into the active implementation plan. The acceptance criteria from SRS Part 8 are the launch gate. The tranches A–G are the work breakdown.

## How the existing CZ work maps in

| CZ step | New home | Status |
|---|---|---|
| CZ.1 Portal hostname + generic login | Tranche A foundation (storefront access surface) | PR #37 open, will merge before Tranche A begins |
| CZ.2 6 dealer store auth.yaml provisioning | Folded into Tranche A.5 (metadata substrate provisioning per profile) | Pending |
| CZ.3 Huminic Motors test store | Folded into Tranche A.1 + A.5 (canary fixture for Brain + DSG) | Pending |
| CZ.4 Password reset request endpoint | Folded into Tranche F.1 (auth surface verification) | Pending |
| CZ.5 Password reset confirm endpoint + page | Same as CZ.4 | Pending |
| CZ.6 Portal domain + Coolify env | Folded into Tranche A.3 (env work) | Pending |
| CZ.7 Password reset canary test | Folded into Tranche G Story 1 evidence | Pending |
| CZ.8 Elliott → Huminic Motors → ADF | Folded into Tranche G Story 8 evidence | Pending |
| CZ.9 Cutover ritual doc update | Folded into final report appendix | Pending |
| CZ.10 Final summary | Replaced by Tranche G launch readiness report | Pending |

## Tranche order (locked per SRS 8.2)

A → B → C → D → E → F → G

Within each tranche, sub-items proceed in the order specified in `decisions.log` D-010.

## Tranche-by-tranche acceptance checklist (from SRS 8.1)

### Tranche A — Foundation
- [ ] Brain exists per profile at `~/.hermes/profiles/<profile>/brain/`
- [ ] DSG enforces all Brain writes and cross-profile reads
- [ ] KSG and DSG share one policy engine + one audit log
- [ ] Single MCP connection per profile carries `wiki_*`, `brain_*`, `federation_*`, `comms_*`, admin tools
- [ ] No fourth cross-profile access surface introduced
- [ ] Configuration over code preserved
- [ ] Always-on metadata substrate present on every profile
- [ ] Brain backup/restore round-trips per profile with no leak
- [ ] Schema migrations reproducible across customers
- [ ] Chat/back-end memorialization works across Studio, MCP, messaging-hub
- [ ] `recordLookupMiss` + assumption surfacing wires to Studio
- [ ] Hermes self-improvement files under Cron + KSG/DSG review

### Tranche B — K↔B contract
- [ ] All record families from B.1 present and populated for fixture
- [ ] Hunches lifecycle works
- [ ] Reconciliation items created on contradictions, resolvable through governed path
- [ ] Adjacent neighbors recorded + classified for fixture
- [ ] Memory layer reconstructs decision context for arbitrary past actions
- [ ] Embeddings pipeline functional with at least one supported model
- [ ] Schema migrations enforced + reversible

### Tranche C — Consultative Agent
- [ ] End-to-end engagement against Cedar Ridge fixture produces complete prescription package
- [ ] Wiki authoring + Brain seeding succeed under KSG/DSG enforcement
- [ ] Assumption surfacing exercised ≥3 times during simulation
- [ ] Capability gap proposals emitted when relevant
- [ ] Starter content loaded + verified at engagement init

### Tranche D — Plugin / skills / federation / comms
- [ ] Plugin installs cleanly on fresh Hermes + Huminic Studio host (smoke test recorded)
- [ ] Required skills present and loadable on test profile
- [ ] Dashboard renderer choice documented and embedded per profile
- [ ] Federation read scopes enforced; unauthorized scopes denied
- [ ] Comms tools route through MCP with allowlists and rate caps
- [ ] Upload surface operational with DSG-governed classification

### Tranche E — Rollup
- [ ] Huminic-the-company rollup works through authorized children with full audit
- [ ] Children without granted scope are denied

### Tranche F — Security
- [ ] F.1 through F.8 pass with evidence (each item check-in to engagement log)
- [ ] F.9 pen-test sweep shows zero open holes OR each finding documented w/ accepted-risk disposition

### Tranche G — User stories + evals
- [ ] All 10 user stories execute with evidence
- [ ] All headless evals pass
- [ ] All headed evals pass
- [ ] Evidence pack published in engagement log
- [ ] Decisions.log captures every non-trivial choice

### Launch gate (final report)
- [ ] Executive summary
- [ ] Tranche-by-tranche status
- [ ] Acceptance-criteria checklist with evidence references
- [ ] decisions.log summary
- [ ] Security review summary
- [ ] Launch readiness recommendation

## Out of scope (locked)
- Nexxus cutover (separate)
- New customer feature work not in acceptance criteria
- Replacing Hermes-native primitives

## Status snapshot at start
- Branch: `cz1-portal-hostname-switch` (CZ.1 work, PR #37 open)
- Production: studio.huminic.app live at post-CY.15 build; portal.huminic.app domain not yet added
- Tests: 384 passing across 41 files
- Brain: does NOT exist on any profile yet
- DSG: does NOT exist
- Metadata substrate: does NOT exist (KSG-only audit today)
- Memorialization: partial (KSG audit + MCP audit log; no chat memorialization yet)
- Lookup miss / assumption surfacing: NOT implemented
- Hermes self-improvement integration: NOT integrated
