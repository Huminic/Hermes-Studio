# PKT-02-01 — Brain/InfoStore persistence checkpoint

**Scope:** additive, development-only persistence + replay gate for the ALREADY-ACCEPTED
PKT-02-01 execution at `bd5a294c9e1c32c6fa6a3a05fe155b38455aa257`. Not PKT-02-02.
Honda Sales only, dealer `21043`, profile `serra-honda`, period `2026-08-24..2026-08-30`.

**Frozen authorities preserved (unchanged):**
- binding sha256 `1c1c98a2e7b3be8d10eea9495861b7a33e65a00020ab7c9e756da363b69f2082`
- source sha256 `39f0577400c912b8e0f0db4a37a35726c1a460c32df88f231aaa39aff9d100ae`
- run_key `119f77056b73c2c9a2a2a6d9ac9aa91afc63205ec674df9d01effe660e774aa7`
- content_sha256 `ae30c07ab4a6e9ae85461dc183c32b94e1ae50c11c5004ab2b51e4d9b965eba1`

No formula, target, catalog, binding, report-language, or acceptance-scope change was made.

## What is durable vs. what the disposable DB proved

**Durable = only the committed evidence** (this checkpoint, `PKT-02-01_persistence_evidence.json`,
and `CANONICAL_MIGRATION_BACKFILL_RECEIPT.json`). The behavior below was proved against a
**disposable** dev Brain created under a fresh tmp profile root and **deleted at the end of the
run**. **No PKT-02-01 data is installed into any standing dev or production Brain.** The claim is
"the persistence/replay/backfill behavior is proved and reproducible," never "the data now lives
in a Brain."

Reproducing the proof re-creates the disposable `brain.db`, exercises it, and removes it. What
persists across runs is the deterministic content-of-record (`content_sha256`
`ae30c07a…`) and its reconstruction from the persisted rows.

## Canonical §7 architecture (the reusable owner) + legacy backfill

The packet-specific `watchdog_packet_*` adapter (`packet-brain-store.ts`) is preserved unchanged
as the **rollback surface**. The reusable owner is now the versioned, checksummed **canonical
§7 InfoStore** added as **`brain-schema.ts` migration 5** (`watchdog_metric_definition`
[versioned], `watchdog_detection_rule`, `watchdog_source_artifact`, `watchdog_normalized_dataset`,
`watchdog_capability_snapshot`, `watchdog_comparison_reference`, `watchdog_grade_target`,
`watchdog_module_run` [run anchor + graph manifest/sha], `watchdog_metric_observation`,
`watchdog_metric_evaluation`, the reused `watchdog_finding` + `watchdog_finding_metric_link`,
`watchdog_report_run` (+ `_module_link`), and a canonical `watchdog_alert_candidate`). Prior
migration SQL is untouched; `watchdog_finding` is created byte-identically to the existing
`watchdog-store.ts` schema (never a competing finding table).

A packet-agnostic core (`canonical-watchdog-store.ts`) persists a validated envelope; a thin
PKT-02-01 adapter (`pkt-02-01-canonical-adapter.ts`) builds that envelope from the accepted run
(frozen validator + binding authority). The accepted PKT-02-01 proof is preserved and moved into
the canonical graph by an **idempotent, transactional legacy→canonical backfill**; new packets
write canonical only (no indefinite dual-write); compatibility reads prefer the fully-verified
canonical graph and fall back to legacy only when a canonical run is absent.

Legacy tables (additive, dealer/profile-isolated; the shared checksummed `brain-schema.ts`
migration list was untouched by the original PKT-02-01 persistence step):

| Table | Rows / run | Content |
|---|---|---|
| `watchdog_packet_run` | 1 | identity, dealer/profile, period, binding/source/content shas, engine, lifecycle partition, reconciliation, report lineage (two-delta), `as_of` provenance |
| `watchdog_packet_observation` | 5 | per-metric value/unit/numerator/denominator/**missing (NULL, never 0)**, formula, source fields, source lineage, confidence, gradable, detail, source-investigation inventory |
| `watchdog_packet_evaluation` | 5 | grade-target linkage, threshold id/comparator/threshold, reference id, detection rule/fired, rating, gradable state, reason |
| `watchdog_packet_finding` | 5 | per-metric severity/headline/detail |
| `watchdog_packet_alert_candidate` | 3 | UNSENT alert simulations (measured metrics only): `delivered=0`, `unsent=1`, `channel=simulated_none` |

Persisted dispositions (read back exactly, each metric exactly once):

- `SW-011` measured/graded — 6 min, healthy, 27/76, missing 49; `GT-OT-SW-011`.
- `SW-012` measured/graded — 0.19736842105263158, breach, 15/76; `GT-OT-SW-012`.
- `SW-015` measured/graded — 0.5, breach, 2/4; `GT-OT-SW-015`.
- `SW-013` source_investigation_pending — value NULL; missing `authoritative_opening_schedule`, `first_human_response_timestamp`. Internal-only.
- `SW-014` source_investigation_pending — value NULL; missing `first_response_actor_classification`, `human_touch_event_timestamps`. Internal-only.

## Proven properties

- **Read-back fidelity:** all five ids present exactly once; values/dispositions/hashes/dealer/period equal the freshly-executed run.
- **Deterministic reconstruction:** rebuilding the content-of-record from persisted rows re-hashes to the pinned `content_sha256` (`reconstructed_equals_pinned=true`).
- **Idempotence / replay:** a second identical persist changes nothing (`replay_changed=false`), one run, no duplicate observations/evaluations/findings/alerts. A run_key collision carrying different content is refused (never overwritten).
- **Missing is not zero:** SW-013/014 persist NULL value/numerator/denominator; a pending metric carrying a fabricated 0 is rejected.
- **Atomic writes:** the parent run row and all child rows commit in a single transaction; a mid-write failure rolls back completely, so a later replay is never a false no-op over a partial write.
- **Delivery-flag integrity:** read-back reconstructs the ACTUAL stored `delivered`/`unsent` flags (not hardcoded literals), so tampering either flag in the Brain diverges the reconstructed content hash.
- **Exact record families:** observations, evaluations, and findings must each carry exactly the five declared ids; alert candidates exactly the three measured ids; every per-record period must equal the run period — not observations alone.
- **Fail-closed:** binding-sha drift, wrong packet, wrong profile (one-tenant), wrong dealer (one-rooftop), content-hash tamper, a Sales-only proof not affirming zero Service/Parts, any unknown metric id, an incomplete/oversized record family, and a per-record period mismatch are all rejected.
- **Zero Service/Parts (anchored):** the Sales-only proof must AFFIRMATIVELY match the accepted, order-bound grammar `^<N> rows: one rooftop Dealer ID=21043; zero Service/Parts tokens in categorical columns;` — a contradictory phrase that merely contains the substring "zero Service/Parts", or names the wrong rooftop, is rejected.
- **Evidence-delta lineage:** `evidence_delta.period` must equal the run period and `evidence_delta.source_sha256` must equal the run source sha; a mismatch of either is rejected.
- **No delivery side effect:** the operational `notification` (alert-delivery) table is never created by this adapter; alert candidates are inert (`delivered=false`, `unsent=true`).
- **Real substrate:** persisted to an on-disk `brain.db` (not the in-memory shim).

## Still packet-local (unchanged, not weakened)

The immutable packet evidence remains the source of record and is not replaced:
`docs/halo/evidence/honda-watchdog/phase1b/pkt-02-01/{PKT-02-01_run_manifest.json,
PKT-02-01_customer_mini_report.md, PKT-02-01_internal_companion.md, store/**}`. The Brain
persistence is additive on top of it.

## Canonical-graph proven properties (migration 5 + backfill)

- **Reconstructed content hash == pinned:** the canonical graph reconstructs `content_sha256`
  `ae30c07a…` exactly (`CANONICAL_MIGRATION_BACKFILL_RECEIPT.json`).
- **Graph manifest / graph_sha256:** the run anchor stores an immutable manifest + sha covering
  metadata the PacketRun content hash does NOT (exact definition versions, detection-rule/target
  approval states, admission receipts, versions, finding links, report linkage). Tampering any of
  these diverges `graph_sha256`, caught on every read/replay. **Boundary (independent review):** the
  authoritative packet-finding content lives in the manifest-covered `watchdog_finding_metric_link`;
  the reused operational `watchdog_finding` row's user-mutable columns (`status`/`priority`/`issue`/
  `details`/`evidence`) are intentionally OUTSIDE integrity coverage (read checks only key existence),
  because that table is the operational lifecycle store — its mutation changes no reconstructed
  canonical output.
- **Row parity:** legacy 1/5/5/5/3 backfills to canonical `module_run 1 / definitions 5 /
  detection_rules 3 / source_artifact 1 / normalized_dataset 1 / grade_targets 5 /
  comparison_references 3 / observations 5 / evaluations 5 / finding links 5 / report_run 1 /
  alerts 3`, with `row_parity=true`.
- **Target authority preserved (fail-closed):** SW-011/012/015 targets are approved/active;
  SW-013/014 (`GT-013`/`GT-014`) stay `unresolved`/`draft`/`value_or_range=pending`, observations
  `gradable=false`/value NULL, evaluations withheld. No unapproved target is written active; a
  non-null target with no supplied binding authority is rejected.
- **Immutable shared parents:** definitions/rules/targets/references/artifacts/datasets are
  insert-or-verify-identical; a same-key different-value collision fails; the receipt distinguishes
  inserted from already-verified rows.
- **DB CHECK on alert flags:** `delivered=0` and `unsent=1` are DB CHECK-enforced — a delivery flag
  can never be flipped, even by raw SQL.
- **Idempotent transactional backfill:** re-backfill fully verifies the graph then changes nothing.
- **Read paths:** compatibility read prefers the verified canonical graph and falls back to legacy
  only when canonical is absent; the legacy `watchdog_packet_*` rollback surface stays directly
  readable.
- **Multi-packet / multi-period / versioned:** the same tables/API accept a genuinely different
  packet (disjoint metric set + packet_id) and repeated periods with no overwrite and no new
  tables; multiple findings per metric/run are supported.

## Disposability / rollback

The dev `brain.db` is created under a fresh tmp profile root and removed at the end of the
proof run — nothing is written to `~/.hermes` or any production database. **Only the committed
JSON/markdown evidence is durable; no data is installed into a standing dev or production Brain.**
Rollback = disable the canonical pipeline version and read legacy (both preserved), or revert this
commit; source history is never deleted.

## What remains (not in this gate — do not start)

- **Second-period / trend proof:** this gate persists/replays a single accepted period. A genuine
  trend query across ≥2 REAL Honda periods (the schema supports it; a second real period has not
  been acquired) is Phase 10 / a later packet.
- **PKT-02-02** and any additional modules/metrics (the canonical tables now accept them).
- **Capability-snapshot population:** the table exists (revisioned) but PKT-02-01 emits no snapshot
  row; populating it is later work.

## Verification battery (canonical hardening — this update)

- **Canonical battery:** `src/test/pkt-02-01-canonical-watchdog-store.test.ts` — 35/35 pass
  (empty-DB migration, coexistence with the operational finding store, a genuinely different second
  packet, multiple findings per metric + content-order-independent reconstruction, fail-closed
  target authority + graded-vs-unapproved,
  Sales-only admission, admission-receipt required, lifecycle exclusivity/union, dataset↔source
  relationship, immutable-parent collision, inserted-vs-verified receipt, exact facts/hashes,
  no-unapproved-target-graded, idempotent replay, run_key collision, forced rollback, backfill row
  parity, canonical-preferred/legacy-fallback reads, new-packets-canonical-only, multi-period
  coexistence, notification-untouched, and full-graph tamper: missing/extra/altered rows, grade
  approval metadata via graph_sha, report module_run_ids↔link-set, versioned-parent tamper, DB
  CHECK on delivery flags, forensic raw read).
- **Legacy proof preserved:** `src/test/pkt-02-01-brain-store.test.ts` — 26/26 pass (the
  `watchdog_packet_*` rollback surface + its APIs are untouched).
- **Migration/backfill receipt:** `CANONICAL_MIGRATION_BACKFILL_RECEIPT.json` — legacy 1/5/5/5/3,
  canonical counts, `row_parity=true`, reconstructed==pinned, `graph_sha256`, idempotent
  re-backfill no-op.
- **Validators:** Phase 0 catalog `overall_pass=true`; Phase 1 contracts PASS (956/956, 61/61,
  2118/2118); Phase 1B PASS (errors 0, probes 25/25); PKT-02-01 execution PASS (42/42).
- **Full regression:** `vitest run` — 258 files, 2315 passed, 7 skipped, 0 failed. (Migration 5 is
  additive: `git diff` shows 0 deletions to `brain-schema.ts`; migrations 1-4 byte-identical.)
- **Lint/type separation:** the 6 new/changed files are eslint-clean and produce zero `tsc` errors;
  pre-existing repo `tsc` errors on unrelated tracked files are separate from this work.

## Verification battery (original gate)

- **Focused adapter tests:** `src/test/pkt-02-01-brain-store.test.ts` — 26/26 pass (read-back, missing-as-null, reconstruction, idempotence/replay, atomic-rollback, delivery-flag tamper ×2, exact-family + period fail-closed, wrong-dealer/profile, anchored Sales-only grammar incl. contradictory-substring + wrong-rooftop, evidence-delta period/source-sha lineage, unknown-metric, no-delivery, period history).
- **Relevant DB/schema + packet suite:** brain-store, brain-record-families, watchdog-store, watchdog-notifications-store, and all `pkt-02-01-*` — 101/101 pass.
- **Validators:** Phase 0 catalog PASS; Phase 1 contracts PASS (956 self-tests, 61 probes, 2118 fuzz); Phase 1B PASS (25 probes); PKT-02-01 execution validator PASS (42/42).
- **Full regression (final hardened tree):** `vitest run` — 257 files, 2280 passed, 7 skipped, 0 failed.
- **Lint:** the three new files are eslint-clean.
- **Typecheck:** the new files (`packet-brain-store.ts`, the test, the runner) produce **zero** `tsc` errors. The repository has 498 pre-existing `tsc` errors on tracked files this change does not touch (widgets/routes/messaging/unrelated tests); git status shows only the four new untracked files and no modified tracked file, so those errors are pre-existing and separated from this work.

## Reproduce

```
# original legacy proof (rollback surface, unchanged)
HALO_LEADS_DIR=/tmp/halo-295-leads-20260831 npx tsx scripts/halo-phase1b/persist_pkt_02_01_brain.ts
HALO_LEADS_DIR=/tmp/halo-295-leads-20260831 npx vitest run src/test/pkt-02-01-brain-store.test.ts

# canonical §7 migration + backfill receipt + battery
HALO_LEADS_DIR=/tmp/halo-295-leads-20260831 npx tsx scripts/halo-phase1b/canonical_backfill_receipt.ts
HALO_LEADS_DIR=/tmp/halo-295-leads-20260831 npx vitest run src/test/pkt-02-01-canonical-watchdog-store.test.ts
```
