# Part A — canonical repair acceptance bundle (finite, frozen in Git)

Corrective hardening on top of committed `ecc1f6ec9`, now **frozen in Git** by the containing
commit `feat(halo): freeze accepted PKT-02-01 Part A persistence`, which freezes the
already-accepted PKT-02-01 Part-A implementation and its complete evidence chain. This is a
freeze of accepted work, not a new product decision, and claims **no full-goal completion**
(PKT-02-02 and later modules are not started). No merge / deploy / production / CRM /
Service-Parts / Part B action is performed.
Migration 5 stays byte-immutable; migration 6 is additive.

## Aggregate gates (evidence)
- **tsc:** captured full output + exit (no masking pipe). Repo-wide 498 pre-existing errors
  on unrelated tracked files; **0 errors in the 7 new/changed files** (`TSC_EXIT=2`; the
  498 are the documented pre-existing separation).
- **eslint:** 0 errors on all changed/new files. **NUL:** 0 (item 10, grep-verified).
- **Migration:** `MIGRATIONS.length=6`; v5 checksum `9c9c4ce890dea7e1` == committed
  (byte-immutable, `git diff` shows 0 deletions to `brain-schema.ts`); v6 present/additive.
- **Focused battery:** canonical + adversarial + readback + legacy + Brain suites — **102/102**.
- **Full regression (final accepted authority — Packet H / run6):** the unchanged frozen
  258-file suite, run over immutable read-only Sales-Brain snapshots, → **258 files, 2337
  passed, 7 authorized skips, 0 failed, rc=0** (run6 `FULL_REGRESSION_POST.json`
  `29d028a2…`, `accepted=true`, zero rejection reasons). Packet H is the final full-regression
  authority for this exact implementation tree. Sealed earlier in-tree runs F (run4) and G
  (run5) are preserved unchanged as rejected history (F: live `brain.db-shm` mtime touch;
  G: chart-warning token-vs-event miscount) — neither is accepted. An earlier local
  `vitest run --maxWorkers=2` measured 2334 passed on a prior tree snapshot; the authoritative
  total is Packet H's 2337. The two contended files (`evaluator-spine`, `evaluator-closure`)
  pass in isolation (23/23).
- **Validators:** Phase 0 `overall_pass=true`; Phase 1 956/61/2118; Phase 1B 25/25;
  PKT-02-01 42/42.
- **PKT-02-01 pinned/parity:** reconstructed content hash ==
  `ae30c07ab4a6e9ae85461dc183c32b94e1ae50c11c5004ab2b51e4d9b965eba1`; backfill row parity
  true; replay no-op (`CANONICAL_MIGRATION_BACKFILL_RECEIPT.json`).
- **Exact counts:** first-write inserted `rows` == replay `verified` counts, incl. capability
  + the four v6 link families; grade-target/reference counted by exact id+version.
- **~/.hermes inventory:** global test setup redirects HOME to a fresh /tmp per file
  (`setup-brain-tmp.ts`) — does NOT set BRAIN_PROFILES_ROOT, so `vi.spyOn(os,'homedir')`
  tests keep isolation. Pre/post (`HERMES_TESTDB_INVENTORY_{PRE,POST}.json`): **all 15
  brains byte/mtime/sha IDENTICAL, zero new/changed/deleted**. No fixture deleted.

## Ten consolidated controls → evidence
1. **Lifecycle/disposition semantics.** Exact-key `disposition_by_metric` +
   `evaluation_state_by_metric` (keys==expected). Frozen 8 dispositions + 5 evaluation
   states + `disposition_evaluation_consistency`. Bucket is AUTHORITATIVE (binding
   `lifecycle_bucket`); `(disposition, evaluation_state)` validated against
   `BUCKET_ALLOWED_DISPOSITIONS`/`BUCKET_ALLOWED_EVAL_STATES` (Amendment 002), not a
   one-to-one map. All five bucket keys required. `measured_validated`+`measured_graded`
   from the binding. Provisional `measured_unscored` value allowed in calculation_pending
   (unpromoted/ungraded, outside accepted_measured). Disposition-only requires a
   terminal/external disposition; SIP never disposition-only; `crm_available_acquisition_
   pending` NOT absorbed into SIP; rejected retains measured_validated/
   data_acquired_calculation_pending + measurement_rejected. Validated exactly against the
   real PKT-01 binding rows. Tests: lifecycle/vocab/semantics + `measured_unscored`.
2. **Exact membership.** One metric definition per expected id (no extra/missing/dup;
   module-consistent). Supplied detection rules == linked rule ids; supplied grade targets
   == used; supplied references == used (unused/ambiguous rejected). Tests: extra/missing/
   dup def; unused rule/target; ambiguous dup.
3. **Manifest symmetry.** Manifest includes run `as_of`, immutable `watchdog_finding`
   parent columns for linked findings, explicit eval→rule links, and full report metadata
   (cutoff/freshness/lineage/pdf+internal hashes/qa). Missing linked parent FAILS (`req`,
   no `filter(Boolean)`). Tests: finding-parent tamper; run-link deletion; replay-as_of.
4. **Per-artifact Sales-only + multi-artifact.** Structured admission receipt bound to
   sha/schema/bytes/rows/profile/dealer/period + non-empty `sales_only_proof`, validated
   per artifact independently. Every mapped observation's `source_lineage` requires
   non-null source/schema/receipt sha, each == its bound artifact AND its receipt. A
   value-bearing measured_unscored needs non-null dataset lineage. Tests: empty proof;
   null identity; lineage mismatch; two-artifact/two-hash with contamination isolated to
   artifact 2.
5. **Authority identity.** grade-target/reference selected by exact id+version (unique id
   → one version; ambiguous rejected); eval→rule matches threshold_id/comparator/threshold/
   condition + approved+active; per-metric/version. `genuinely_not_available` requires the
   EXACT named non-empty `affirmative_investigation_evidence_ref` (generic prose does NOT
   satisfy) — new envelope field + persisted column + manifest + direct validation. Tests:
   threshold/comparator/approval mismatch; cross-metric; GNA blank/null-ref (with prose).
6. **Capabilities.** Capability inserted BEFORE targets/references (FK order); target/
   reference `capability_snapshot_id` resolves to a supplied run-linked snapshot with
   compatible dealer/period; manifest covers ONLY run-linked capability rows (via
   `watchdog_run_capability_snapshot`), never a profile/dealer/period sweep. Test: unsupplied
   capability id rejected.
7. **Report inertness.** Pre-persist: `report_lineage == env.two_delta`,
   `delivery_state=undelivered`, `activation_state=inactive`; full metadata preserved.
   Tests: lineage!=two_delta; delivered; activated.
8. **Truthful counts.** `RowCounts` tallies capability + all four v6 link families; counts
   the EXACT linked graph (rules via eval→rule link, sources/datasets/capability via run
   links, not observation-only). First-write `rows` == replay `verified` (asserted in the
   PKT-01 test).
9. **Adapter/facade + generic read.** Adapter reads disposition/evaluation_state/detection-
   rule identity from the binding (not measured-set inference); pinned content hash
   preserved. Generic packet-agnostic public entry re-exported. `readCanonicalRun`/`loadRaw`
   now expose the three governed fields via a **v2 additive** read shape
   (`read_shape_version=2`, `disposition_by_metric`, `evaluation_state_by_metric`,
   `affirmative_investigation_evidence_ref_by_metric`) — backward compatible with the v1
   engine record arrays. Compatibility read throws on canonical tamper (never legacy
   fallback). Tests: persistence→readback exact values (normal states + GNA ref).
10. **Gate + v6 + adversarial + inventory.** v6 additive tables (run→source/dataset/
    capability links, eval→detection_rule link bound to the EVALUATION parent, +
    evaluation_state + affirmative_investigation_evidence_ref columns); v5 byte-unchanged.
    Adversarial tests for every item (same-content changed as_of/receipt/disposition/report/
    capability/rule; finding-parent/link tamper; exact-map missing/extra; provisional
    measured_unscored; terminal GNA evidence; two-artifact contamination). Full regression
    disposable /tmp HOME, true exit 0, 15 ~/.hermes brains byte-identical pre/post.

## Files (frozen in this commit)
- `src/server/brain-schema.ts` (migration 6 additive; v5 immutable)
- `src/server/watchdog/canonical-watchdog-store.ts`
- `src/server/watchdog/pkt-02-01-canonical-adapter.ts`
- `src/server/watchdog/watchdog-run-store.ts`
- `src/test/pkt-02-01-canonical-watchdog-store.test.ts`
- `vitest.config.ts`  ·  `src/test/setup-brain-tmp.ts`
- `.../pkt-02-01/persistence/CANONICAL_MIGRATION_BACKFILL_RECEIPT.json`
- `.../pkt-02-01/persistence/hermes-testdb-inventory/` (HERMES_TESTDB_INVENTORY_{,PRE,POST}.json)
