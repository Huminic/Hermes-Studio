# Gate 4E — Proof Delta E2 (deterministic content-metric evaluation + portfolio)

**Branch:** `codex/halo-295-unshrinkable-inputs`. One writer. **Status:** submitted for review,
NOT self-certified. Evaluates the **5** definition-exact deterministic content conditions from
Proof Delta E1 across the three governed rooftops over the accepted week 2026-08-24..30, emits
aggregate-only evidence, and reconciles the portfolio atomically from the prior 36/849 state.
Aggregate integers only; no message body, name, phone, email, or per-row token is committed.

## 1. Result — portfolio 36 → 51 evaluated / 834 unresolved (17/278 per rooftop)

**15** new evaluated cells (5 IDs × 3 rooftops, all-three-rooftops-or-no-metric). Derived from the
committed Gate 4C2 reconciliation (spine 30 + comm overlay 6 = 36), fail-closed:

- core 4-family spine: **30** (unchanged)
- Gate 4C2 comm overlay: **6** (SW-022, SW-133; unchanged)
- Gate 4E deterministic content overlay: **15** (SW-021, SW-142, SW-145, SW-149, SW-150)
- **51 evaluated / 834 unresolved**; per rooftop **10 spine + 2 comm + 5 content = 17 / 278**

Candidate partition (frozen shadow standard): **75 candidates + 12 prior-evaluated + 208 residual =
295**; after promotion **17 evaluated + 70 held-of-75 + 208 residual = 295**. Every count is DERIVED
and asserted (dealer sets, `required_cells = 295 × 3 = 885`, aggregate ↔ per-rooftop, all-three
distribution); no `51`/`834`/`17`/`278` literal lives in the generator logic.

## 2. Per-rooftop values (aggregate-only)

Baseline for every metric is an **internal operational target (red-flag rate ideal = 0)** — NOT an
industry benchmark. The DETECTION threshold inside each numerator (`< 15` words, `> 5` customers,
`> 70%` of leads, merge-tag present, link-only) is LITERAL from the SW condition. Denominators are
the LITERAL eligible population with **no invented minimum-sample floor**; small samples are
disclosed as confidence, never excluded.

| ID | condition | Honda 21043 | Nissan 21044 | Ford 21047 |
| -- | --------- | ----------- | ------------ | ---------- |
| SW-142 | unfilled merge tags / eligible written msgs | 0/800 | 0/386 | 0/250 |
| SW-149 | reps mean `<15` words / reps with ≥1 written | 2/11 | 1/9 | 0/8 |
| SW-150 | reps only-links / reps with ≥1 written | 0/11 | 0/9 | 0/8 |
| SW-145 | (body,day) groups `>5` customers / distinct groups | 3/731 | 1/360 | 1/232 |
| SW-021 | reps identical `>70%` of leads / reps with ≥1 lead | 2/11 | 2/9 | 1/8 |

Zero results (SW-142 all three; SW-150 all three; SW-149 Ford) are reported **only** because
eligibility is proved (non-zero denominators) and detection is exact (deterministic). SW-021 flags
include low-lead reps: a rep with 1–2 distinct leads trivially reaches `>70%`; these are disclosed as
low/degenerate confidence, NEVER excluded (excluding them would be an invented floor). SW-145's
literal form also counts a short generic acknowledgement or automated identical body reaching `>5`
customers — disclosed as a false-positive control, not silently filtered.

## 3. Controls

- **Adversarial synthetic tests** (`src/test/comm-content-features.test.ts`, 15): word count
  (empty/punctuation/multilingual/emoji/URL), merge-tag detection (each enumerated syntax + filled
  templates + JSON/`$5`/emails as non-tags), link-only (bare/multi-URL/with-text/empty), trim-only
  identity (case + internal-whitespace sensitivity, blank ⇒ empty identity, 16-hex one-way).
- **Evaluator + disposition tests** (`src/test/comm-content-audit.test.ts`, 15): the five
  evaluators (Logged-Call/Inbound exclusion, no-floor denominators, degenerate single-lead SW-021,
  two-day SW-145 split), all-three 15 cells + 70 held, **fail-closed** (empty population ⇒
  `CommContentMetricError`, unresolved not zero), **dealer isolation**, 75-candidate integrity, and
  the committed matrix/reconciliation (51/834, 17/278, 75/12/208=295). One test is **byte-backed**:
  SW-142/SW-149 recomputed from the real Honda capture match the committed ledger cells.
- **Hash guard**: `src/test/comm-evidence-hashes.test.ts` recomputes every artifact hash recorded
  in Proof Deltas E1 + E2.
- Deterministic byte-identical regeneration of all three artifacts; frozen Gate 4C1 reader/contract
  and Gate 4C2 overlay bytes unchanged; TypeScript at the known baseline (no new errors in changed
  files); prettier + eslint clean; no raw CSV/PII/secret committed; scope limited to the Gate 4E
  files.

## Committed artifacts (SHA-256 first 16)

| File | sha256:16 |
| ---- | --------- |
| `scripts/m1r-comms/build-comm-content-evaluation.ts` | `724d76500577b788` |
| `docs/halo/evidence/m1r/comms/comm-content-evaluation-ledger.json` | `0ef15eda1ed9bdaa` |
| `docs/halo/evidence/m1r/comms/comm-content-portfolio-reconciliation.json` | `4abda40c0a1f5153` |
| `src/test/comm-content-features.test.ts` | `d6dae653c325396f` |
| `src/test/comm-content-audit.test.ts` | `518bb0fdba5ffff3` |

Each `sha256:16` is recomputed from the current committed bytes by
`src/test/comm-evidence-hashes.test.ts`.
