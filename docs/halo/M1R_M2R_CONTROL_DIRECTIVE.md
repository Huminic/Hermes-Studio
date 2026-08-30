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

## Immediate stop conditions

Stop and report before continuing if any of the following occurs: production target detected; Service/Parts selected or present; wrong dealer; stale/ambiguous period; unknown provenance; schema drift; unexpected dirty-file delta; concurrent writer; failing/regressed test; credential request; external send; schedule change lacking approval; proposed merge/deploy; or more than one gate being worked at once.
