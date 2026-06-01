# Archive — 2026-06-01

Files moved here during the Section 0.5 planning-mode checkpoint that precedes the closeout + verification + launch-readiness execution run.

The reason for archival: each of these documents either competed with the new canonical plan at `docs/launch/PLAN.md` or made claims (GO / READY) that the post-audit reality contradicts. They are preserved as historical record but are no longer authoritative.

| File | Reason archived |
|---|---|
| `PLAN_INTEGRATION.md` | Prior plan; superseded by `docs/launch/PLAN.md` which absorbs the full CZ + SRS backlog with task ids, owners, evidence targets, and acceptance criterion bindings. |
| `LAUNCH_READINESS_REPORT.md` | Made the launch claim "READY FOR LAUNCH" while CZ-002 through CZ-009 were folded into Tranche A acceptance but never delivered. Replaced by `docs/launch/LAUNCH_CLOSEOUT_REPORT.md` which will only be marked GO when every Section 9 acceptance criterion in `docs/launch/ACCEPTANCE_CRITERIA.md` is green with evidence. |
| `cedar-ridge-defect-register.md` | V0 / Cedar Ridge fixture validation era. Pre-Phase-C. Known-partial (V7 ceremonial, V8 rigged, governor SOUL mistemplated, simulated-operator approvals). Per D-019 and the C.13 disposition, Cedar Ridge stays as historical reference only; current validation is `docs/launch/HUMAN_TESTING_SCRIPT.md` + `docs/launch/AUTONOMOUS_TESTING_PLAN.md`. |
| `cedar-ridge-readiness-report.md` | Same. Historical record only. |
| `customer-cluster-defect-register.md` | Phase C customer-cluster era. Replaced by the live evidence + defect-tracking inside `docs/launch/EVIDENCE_INDEX.md` and the active backlog in `docs/launch/PLAN.md`. |
| `customer-cluster-readiness-report.md` | Same. Phase C signed off with operator caveats; new closeout cycle re-validates from acceptance criteria. |
| `v0-validation-runbook.md` | V0 era runbook for the Cedar Ridge simulation. Replaced by the new `HUMAN_TESTING_SCRIPT.md` + `AUTONOMOUS_TESTING_PLAN.md` deliverables. |
| `issues.md` (root, archived after PLAN.md absorbs it) | All entries (V-001, CZ-002 through CZ-009, SRS-C1/D2/D3/D4/E/F7/G, OP-001/002/003) are now tracked as task ids in `docs/launch/PLAN.md` with formal evidence bindings. |

Nothing here should be consulted as a source of current state. For current state see `docs/launch/PLAN.md`, `docs/launch/EVIDENCE_INDEX.md`, and `docs/launch/LAUNCH_CLOSEOUT_REPORT.md`.
