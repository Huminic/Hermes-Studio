# M2B — Three-Store Report-Card Run

## Goal

Produce, verify, and send to `duanekwells@gmail.com` one polished Halo Data test report card for each governed Serra Sales profile: `serra-honda`, `serra-nissan`, and `tony-serra-ford`. Use the largest defensible Semantic Watchdog subset and make each report a high-value diagnostic: current performance, dealer history, compatible industry context, weaknesses, and ranked improvements. This is a test, not a production/customer launch.

## Governing references

- `docs/halo/HALO_STRATEGY.md`
- `docs/halo/MILESTONES.md`
- `docs/halo/M1_VALIDATION_MATRIX.md`
- `docs/halo/evidence/cockpit-verify/CODEX-COCKPIT-VERIFICATION.md`
- `/home/ubuntu/hs-ingest-dev/docs/watchdog-platform/SCHEMA_CONTRACT.md`
- `src/server/watchdog/metric-catalog.ts`
- `src/server/watchdog/halo-support-manifest.ts`
- `src/server/watchdog/metric-values.ts`
- `src/server/reports/halo-report-card.ts`
- `src/server/reports/halo-three-layer.ts`
- `src/server/reports/halo-ai-narrative.ts`

## Execution plan

1. **Data and coverage.** Read only accepted inputs in `/srv/ingest-dev/analytics`. Enforce tenant isolation and Sales-only. Classify every catalog metric per store as supported, withheld, missing, or unsupported; maximize usable metrics without treating missing as zero. Preserve source, checksum, period, unit, and freshness.
2. **Comparisons.** For each usable metric show current result, dealer baseline when history is sufficient, and only definition-compatible sourced industry context. Label confidence/limitations; never invent benchmarks.
3. **Diagnosis.** Mine governed conversation/activity evidence for systemic weaknesses without exposing customer PII. Explain what happened, why it matters, and its metric/evidence relationship.
4. **Ranked actions.** Rank findings by expected facility impact and confidence. Assign the proper owner—GM, sales manager, or salesperson—and classify each as a coverage gap, notification, automation, coaching/process change, or Huminic opportunity. State trigger, recipient, action, prerequisites, safety limits, and approval needed.
5. **Presentation.** Create three attractive store-specific report cards with executive summary, category scorecards, evidence, ranked opportunities, coverage ledger, concise AI narrative, and machine-readable evidence manifest.
6. **Workspace verification.** Re-test Dashboard, Issues, Notifications, and Halo for all stores. In isolated dev, exercise dashboard/Issues “Create alert” using durable inert test records; verify recipient and threshold/baseline rule with dispatch disabled. Activate no automation and send no dealer notification.
7. **QA and delivery.** Reconcile every number, dealer, period, citation, recommendation, and withheld state. Prove zero Service/Parts and wrong-dealer content. After visual QA, send exactly three test emails—one report per dealer—to `duanekwells@gmail.com` only. Record sender, subject, message ID, timestamp, attachment name/type/size/SHA-256, delivery, and openability.
8. **Durability.** Commit and push implementation/evidence to `feat/watchdog-dashboard`; preserve existing work. Update Halo records only; LifePath retains only its continuity pointer.

## Acceptance

- Three polished, independently verified report cards exist and open correctly.
- Each uses every defensible supported metric and explicitly accounts for the remainder.
- Each contains ranked evidence plus owner-specific coverage, notification, automation, and coaching opportunities.
- The profile workspace screens and inert create-alert workflow pass for all three stores with dispatch disabled.
- Exactly three emails reach `duanekwells@gmail.com` with durable delivery receipts; no customer/dealer recipient is contacted.
- GitHub, Mac, and Claude/Andromeda refs preserve the accepted commit and evidence.
- No production deploy/merge, CRM mutation, autonomous action, live dealer notification, Service/Parts commingling, or advertising-account mutation occurs.
