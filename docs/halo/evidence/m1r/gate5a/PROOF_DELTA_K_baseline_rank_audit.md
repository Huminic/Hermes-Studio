# PROOF DELTA K — Gate 5A baseline / definition-compatibility / three-dealer peer-rank audit

**Gate:** 5A · **Revision:** K1 · **Accepted week:** 2026-08-24..2026-08-30 (America/New_York)

**Rooftops:** 21043 (Serra Honda of Sylacauga) · 21044 (Serra Nissan of Sylacauga) · 21047 (Tony Serra Ford)

**Boundary:** Sales-only (Service/Parts permanently excluded; missing is unknown, never zero)

> **Scope.** Gate 5A verifies the ALREADY-committed evaluated corpus (17 metrics × 3 rooftops = 51
> cells): baseline verification, definition compatibility, and a direction-aware three-dealer peer
> rank. It **promotes nothing and invents nothing** — every value, baseline, variance, rating, and
> rank is already committed in the spine / comm / content evaluation ledgers; Gate 5A independently
> re-derives variance, rating, and rank (reusing the canonical evaluator helpers) and fails closed on
> any mismatch. No PDFs; no synthesis. Accounting preserved: **17 evaluated / 278 unresolved**
> (51 / 834 / 885 cells). Gate 4H / 4I / 4J artifacts are byte-identical.

---

## 1. Independent verification of the committed corpus

All 51 evaluated cells were re-derived from `value` + committed `baseline`:

- `native_variance = value − threshold` (`signedVariance`), **0 mismatches** vs committed variance.
- `rating` (breach / watch / healthy, watch-band = 10% of threshold), **0 mismatches**.
- direction-aware `rank` among the two peers (`rankByDirection`, rank 1 best, ties share the better
  rank), **0 mismatches** vs committed rank.

The generator fails closed if any cell diverges. Every comparison basis is a Duane-supplied
**operational target** (`OT-…` for spine, `comm-…` / `comm-content-…` for the comm/content families) —
labeled `operational_target`, **never** an industry benchmark.

## 2. Definition compatibility — verified benchmarks, all reference-only

Five industry benchmarks were verified from primary sources (Foureyes Q1-2026 funnel, Foureyes H2-2023
appointment study, Foureyes 2026 benchmarks report, Pied Piper 2026 ILE, NADA Data 2025), each recorded
with URL, publication/observed period, sample, exact definition, verified figures, and
`verified_date = 2026-09-01`. **No benchmark maps as a variance basis** — all three candidate mappings
are **rejected (reference-only)** on proven definition mismatch:

| Metric | Candidate         | Verdict        | Reason                                                                                                                                                                                                                                  |
| ------ | ----------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SW-032 | Foureyes 59% show | reference_only | SW-032 denominator is "total appointment rows", which the committed supporting data proves **includes cancelled (4) and rescheduled (7)** appointments; Foureyes show = shows / appointments **set**. Different denominator population. |
| SW-031 | Foureyes 40% set  | reference_only | SW-031 denominator is **leads**; Foureyes set denominator is opportunities with established **contact**.                                                                                                                                |
| SW-011 | Pied Piper ILE    | reference_only | SW-011 is a **median business-hours** response time; ILE is a 24h-answer response-effectiveness composite (not a median, not business-hours filtered).                                                                                  |

Accepted mappings: **0**. Rejected mappings: **3**.

### Registry update (definition-first, fabrication guard preserved)

`docs/halo/contract/baseline-registry.json` is updated: the five benchmarks are now
`value_status: verified_reference_only` with `verified_date`, machine-readable `verified_metrics`,
`compatibility: reference_only`, and `mapped_to: null`. The **top-level `value` stays `null`** so the
evaluator's resolver can never pull a benchmark number into a variance — no benchmark figure enters an
evaluation. The earlier unverified `IB-FOUREYES-APPTSET-BYTYPE` placeholder is superseded by the
operator-verified `IB-FOUREYES-APPT-H2-2023`. Operational targets are unchanged and never relabeled as
industry benchmarks. The Gate-2 registry focused test is updated to the verified contract (value stays
null; verified benchmarks carry verified_date + verified_metrics + reference-only).

## 3. Three-dealer peer rank

`gate5a-peer-rank-ledger.json` carries a direction-aware peer rank (rank 1 = best) for all 17 metrics
across the three governed rooftops. Ties share the better rank deterministically (e.g. SW-033 / SW-090 /
SW-142 / SW-150 all-zero → all rank 1). Every metric is rankable this period (`not_ranked_reason: null`).
**Peer rank is a comparison across the three rooftops, NOT an industry rank.**

## 4. Customer-safe projection

`gate5a-customer-safe-projection.json` names each metric and the public benchmark **publishers** but
exposes **no** internal file path, internal report title, hold/quarantine control, rep/customer
identity, or raw PII (fail-closed denylist guard). It presents each rooftop's value, peer rank, and
status against an **internal operational target** (explicitly labeled "not an industry benchmark"), and
notes that verified public references were reviewed but are context-only (none used to score).

## 5. Controls

- **Focused tests** (`src/test/gate5a-baseline-rank-audit.test.ts`): 13/13 — 51-cell coverage,
  operational-target basis (never IB-), required comparison fields, independent direction-aware rank
  recompute + rank-1-best, 0 accepted / 3 rejected mappings with proven reasons, 5 verified benchmarks
  reference-only, registry verified-with-null-value guard, operational targets never mislabeled,
  customer projection internal-term/PII guard (planted-term throws), accounting 17/278 = 51/834/885.
- **Registry contract test** (`src/test/evaluator-baseline-registry.test.ts`): updated for the verified
  contract; all evaluator tests green.
- **Hash guard** (`src/test/gate5a-evidence-hashes.test.ts`): recomputes every SHA-256 below.
- Deterministic (byte-identical rerun); Prettier + ESLint clean; changed-file `tsc` adds no new errors.
- No PDFs; no synthesis. Only Gate 5A files (+ the in-scope registry and its focused test) changed.

### Recorded hashes (sha256, first 16 hex)

| File                                                                         | sha256:16          |
| ---------------------------------------------------------------------------- | ------------------ |
| `docs/halo/contract/baseline-registry.json`                                  | `86de75c499465571` |
| `src/server/reports/gate5a/baseline-rank.ts`                                 | `5e2416d5c16298f9` |
| `scripts/m1r-gate5a/build-gate5a-baseline-rank-audit.ts`                     | `f84ab77d2dd2cdb6` |
| `docs/halo/evidence/m1r/gate5a/gate5a-baseline-compatibility-ledger.json`    | `119ca7e2b96af472` |
| `docs/halo/evidence/m1r/gate5a/gate5a-evaluated-cell-comparison-ledger.json` | `313b6c2b60af4ff1` |
| `docs/halo/evidence/m1r/gate5a/gate5a-peer-rank-ledger.json`                 | `f559fbd491acd1b6` |
| `docs/halo/evidence/m1r/gate5a/gate5a-customer-safe-projection.json`         | `f22fc274140cab2f` |
| `src/test/gate5a-baseline-rank-audit.test.ts`                                | `1696cf2b5620987b` |

Each `sha256:16` is recomputed from the current committed bytes by
`src/test/gate5a-evidence-hashes.test.ts`.
