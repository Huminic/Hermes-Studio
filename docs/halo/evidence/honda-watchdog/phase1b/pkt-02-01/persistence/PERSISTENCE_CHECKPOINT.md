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

## What is now durable (in the Brain)

The five accepted PKT-02-01 dispositions and their full record set are persisted into the
repo's real per-profile Brain (`better-sqlite3`, `~/.hermes/profiles/<profile>/brain/brain.db`)
via a feature-owned watchdog persistence adapter that follows the established
`watchdog-store.ts` / `notifications-store.ts` convention (`ensure()` +
`CREATE TABLE IF NOT EXISTS`, profile-scoped, idempotent by a stable key).

New tables (additive, dealer/profile-isolated; the shared checksummed `brain-schema.ts`
migration list is untouched):

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

## Disposability / rollback

The dev `brain.db` is created under a fresh tmp profile root and removed at the end of the
proof run — nothing is written to `~/.hermes` or any production database. Only this JSON/markdown
evidence is durable. Rollback = deleting the dev profile directory (or reverting this commit).

## What remains (not in this gate — do not start)

- **Second-period / trend proof:** this gate persists and replays a single accepted period.
  A genuine trend query across ≥2 periods (period history is supported by run_key/period, but
  a second real Honda period has not been acquired) is Phase 10 / a later packet.
- **PKT-02-02** and any additional modules/metrics.
- **Baseline/capability-snapshot, comparison-reference, grade-target, module-run, report-run**
  first-class records from spec §7 beyond what PKT-02-01 emits — additive future work; not
  invented here to avoid a parallel product architecture.

## Verification battery (this gate)

- **Focused adapter tests:** `src/test/pkt-02-01-brain-store.test.ts` — 26/26 pass (read-back, missing-as-null, reconstruction, idempotence/replay, atomic-rollback, delivery-flag tamper ×2, exact-family + period fail-closed, wrong-dealer/profile, anchored Sales-only grammar incl. contradictory-substring + wrong-rooftop, evidence-delta period/source-sha lineage, unknown-metric, no-delivery, period history).
- **Relevant DB/schema + packet suite:** brain-store, brain-record-families, watchdog-store, watchdog-notifications-store, and all `pkt-02-01-*` — 101/101 pass.
- **Validators:** Phase 0 catalog PASS; Phase 1 contracts PASS (956 self-tests, 61 probes, 2118 fuzz); Phase 1B PASS (25 probes); PKT-02-01 execution validator PASS (42/42).
- **Full regression (final hardened tree):** `vitest run` — 257 files, 2280 passed, 7 skipped, 0 failed.
- **Lint:** the three new files are eslint-clean.
- **Typecheck:** the new files (`packet-brain-store.ts`, the test, the runner) produce **zero** `tsc` errors. The repository has 498 pre-existing `tsc` errors on tracked files this change does not touch (widgets/routes/messaging/unrelated tests); git status shows only the four new untracked files and no modified tracked file, so those errors are pre-existing and separated from this work.

## Reproduce

```
HALO_LEADS_DIR=/tmp/halo-295-leads-20260831 npx tsx scripts/halo-phase1b/persist_pkt_02_01_brain.ts
HALO_LEADS_DIR=/tmp/halo-295-leads-20260831 npx vitest run src/test/pkt-02-01-brain-store.test.ts
```
