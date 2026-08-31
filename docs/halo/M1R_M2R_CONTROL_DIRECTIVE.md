# M1R/M2R Control Directive

Status: mandatory execution control for the corrective Three-Store Data Readiness and Reader Integration milestone. This directive does not itself authorize execution, production changes, VinSolutions schedule changes, messages, or Service workspace work.

## Roles and delegation

- Codex is the sole outcome controller and reports to Duane.
- Claude Code is a bounded implementation and verification partner.
- No subagents, background workers, or additional delegation without Duane's explicit approval.
- Only one writer may operate in a repository or external object at a time. Stop on a concurrent writer, Git lock, unexpected branch, or unexplained dirty-file change.
- The combined Serra Service workspace and all Service/Parts plumbing are out of scope.

## Bounded work packages

Work may advance only one control gate at a time. Each work package must state its exact objective, allowed repository/branch, allowed files or external objects, expected tests, stop conditions, and rollback before action begins. No opportunistic cleanup, adjacent feature work, production merge/deploy, live alerting, customer/dealer send, CRM mutation, advertising mutation, or M3/M4 work.

## Dual-proof gate

Every gate requires two distinct proof deltas before it can be marked passed:

1. **Scope/state delta:** machine-readable before/after evidence showing exactly what changed and that nothing outside the bounded package changed. Examples: Git refs/status/diff, schedule-definition before/after, file hashes, family-by-store matrix delta, accepted/quarantined ledger delta.
2. **Outcome/validation delta:** independent evidence that the intended result works. Examples: fail-closed validator output plus workbook Filters/row evidence; automated tests plus real-file golden output; report-card metric lineage plus independent reconciliation to source totals.

One proof cannot be reused as both deltas. A structural test, self-report, attempted action, or generated artifact alone is not acceptance. Missing, stale, quarantined, withheld, or readerless data is not a pass.

## Mandatory control gates

0. **Preflight:** establish branches, dirty files, concurrent-writer state, baseline hashes, authority, prohibited actions, and exact work package.
1. **Recovery:** prove the unpushed ingest work is recoverable remotely and prove working files remained unchanged.
2. **Coverage contract:** approve the mandatory six-family-by-three-store matrix, readers, transformations, calculations, cadence, freshness, and browser-only requirements.
3. **Schedule safety:** read-only audit first. Provide exact saved-filter evidence and proposed diffs. No VinSolutions schedule mutation without separate Duane approval. Sales-only/zero-Service-and-Parts is fail-closed.
4. **Delivery readiness:** current controlled files for all required cells must pass dealer, period, provenance, schema, Filters, and row-level validation.
5. **Reader integration:** prove six-family readers and calculations with automated tests and real-file goldens in an isolated dev environment.
6. **Metric reconciliation:** reconcile catalog metrics to source evidence for Honda, Nissan, and Ford; document unavailable metrics honestly.
7. **Report-card acceptance:** regenerate only after Gates 0-6 pass; reconcile source lineage, totals, freshness, and narrative claims independently.

## Checkpoint report

At each gate—or after 45 minutes of work, whichever comes first—Codex reports:

- gate and bounded objective;
- planned versus actual changes;
- Proof Delta A: scope/state evidence;
- Proof Delta B: outcome/validation evidence;
- deviations, surprises, and unresolved risks;
- current branch/dirty/concurrent-writer state;
- Service/Parts safety result;
- next bounded action, owner, and whether Duane approval is required.

No gate may be silently widened, redefined, scope-corrected, or passed with caveats. A failed gate stops downstream work. Duane alone may approve a changed business requirement or an external/production mutation.

## Ongoing approval model (Duane clarification, 2026-08-30)

Explicitly acknowledged governance clarification from Duane on the standing approval model. This section refines *when* Duane approval is required; it does not weaken any safety or external-mutation boundary above.

- **Independent check is neutral, not an approval proxy.** Shadow (the independent neutral control check) verifies that work is on track and free of drift. Shadow does not grant approval and cannot substitute for a Duane decision where one is required.
- **In-scope work may proceed on controller plus independent check.** Routine technical choices and in-scope corrections that *restore the ratified outcome* may proceed when the controller and the independent check both show the work is on track — no separate Duane approval needed for these.
- **Duane approval is required** only when a choice does any of the following:
  - changes the intended outcome or functionality;
  - expands scope or authority;
  - accepts missing, unreadable, skipped, stale, or quarantined data;
  - weakens acceptance criteria;
  - creates customer, legal, financial, production, or external commitments;
  - makes another consequential deviation.
- **Boundaries unchanged.** All existing safety and external-mutation boundaries in this directive remain in force. External/production mutation (including any VinSolutions schedule/filter change) still requires explicit Duane approval regardless of the above.

## Immediate stop conditions

Stop and report before continuing if any of the following occurs: production target detected; Service/Parts selected or present; wrong dealer; stale/ambiguous period; unknown provenance; schema drift; unexpected dirty-file delta; concurrent writer; failing/regressed test; credential request; external send; schedule change lacking approval; proposed merge/deploy; or more than one gate being worked at once.

## Semantic Watchdog goal extension (Duane, 2026-08-31; additive)

Duane expanded the active M1R/M2R goal to the **complete authoritative Semantic Watchdog catalog**:
`docs/halo/contract/semantic-watchdog-feasibility-matrix-295.json` — **295 unique conditions SW-001..SW-295**
(the earlier "246" was shorthand, not a narrowing; the catalog SHA-256 is `29c7ac06…`). This extension is
**additive** and does not weaken any safety/external-mutation boundary above.

- **Full 295 accounting.** Every one of the 295 conditions is accounted **per dealer** (Serra Honda, Serra
  Nissan, Tony Serra Ford = 885 rows). **All 885** preserve the **verbatim** catalog source prose (condition,
  rule, source fields, source, cadence, grain, acquisition_class), a disposition, and a **primary
  (first-match) blocker** with a reason. **Exact structured** threshold, unit, period, freshness, and
  numerator/denominator operands exist **ONLY for the six runnable rows** (SW-032/SW-041 × 3 dealers); the
  other **879 rows are intentionally `null`** on those structured fields (not proved). Nothing is silently
  dropped; **missing is never zero**.
- **Two depths.** "**Mile-wide, inch-deep**": all 295 accounted at shallow depth (state + reason) so coverage
  is complete. "**Mile-deep, inch-wide**": the few accepted-runnable conditions are computed to full
  lineage/numerator/denominator depth.
- **Cross-metric automotive-consulting synthesis.** Metrics are grouped into consultant **clusters** with
  **cross-cluster diagnostic rules** gated by compatibility controls (same dealer, accepted source,
  compatible population/period/grain/unit/denominator; insufficient history blocks trends; unstable comm
  IDs block ordered/causal claims; source disagreement blocks composites). The AI behaves like an elite
  automotive **Sales consultant**, not a dashboard narrator.
- **Priority lenses.** Findings prioritize **expense reduction, sales/gross lift, training, handoff/process,
  and prospect/customer friction**.
- **Real data only for dealer evidence.** Dealer evidence uses the exact 18 real workbooks + governed Huminic
  data; synthetic is allowed ONLY for negative/control tests, never as dealer evidence.
- **Two artifacts.** A **customer-facing sales document** (no provenance/lanes/checksums/internal language)
  and a **separate internal evidence** artifact.
- **Governance.** Sales-only and dev/isolated only; **ROI/CAGE/Sales-Communication remain quarantined /
  provisional and can NEVER power an accepted Sales alert, score, or customer narrative**; Service-domain
  (18 IDs) and unresolved (SW-082/SW-218) stay out of Sales. Each phase (R1 inventory → R2 resolvers →
  R3 clusters → R4 cards → R5 verify) is a bounded control gate with dual proof deltas and **shadow
  acceptance**; no production/outbound/autonomous/ad-mutation/Message-Content-read without separate Duane
  authorization. As of R1 the only accepted-runnable conditions from current data are **SW-032 and SW-041**
  (Appointments strict) — every other condition is explicitly withheld/blocked/provisional with a reason.
