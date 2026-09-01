# Gate 4C2 — Proof Delta C (Enhanced Sales Communication Log weekly: real-data metric evaluation)

**Branch:** `codex/halo-295-unshrinkable-inputs`. One writer. **Status:** submitted for review,
NOT self-certified. **Bounded gate:** a semantic-definition + real-data evaluation pass over the
exact 12 pending IDs (SW-019/022/026/076/084/086/132/133/134/137/138/288). It promotes **only**
the semantically-exact, order-invariant metrics; every other pending ID stays EXPLICIT
unresolved. No NLP/content, no PDF/customer-final, no production, no browser/Gmail/schedule
mutation. Raw PII/message content stays only in restricted `/tmp` and is NEVER committed.

## 1. Result — 2 metrics promoted, portfolio 30 → 36

**Promoted (all-three-rooftops-or-no-metric):** `SW-022`, `SW-133` — **6 new evaluated cells**
(2 IDs × 3 rooftops). Portfolio reconciles to **36 evaluated / 849 unresolved**; the core
4-family spine (**30**, `spine-summary.json`) is untouched and byte-semantically preserved.

| metric | Honda 21043 | Nissan 21044 | Ford 21047 | baseline / rank |
| ------ | ----------- | ------------ | ---------- | --------------- |
| SW-022 outbound text:call >5:1 (share of eligible reps) | 1/10 (rank 1) | 3/9 (rank 3) | 2/7 (rank 2) | operational target 0; lower_is_better |
| SW-133 customer-chasing threads (share of ≥2-msg threads) | 10/280 (rank 3) | 3/130 (rank 2) | 2/118 (rank 1) | operational target 0; lower_is_better |

Each promoted cell carries: current value + numerator/denominator, operational-target baseline
(NOT an industry benchmark), signed variance, cross-rooftop rank, evidence lineage (capture id +
raw/manifest SHA + transform version/hash + source/report URL), reporting period + captured_at,
`formula_version = comm-metric-v1`, and a footnote (low-sample where observed events < 5).

## 2. Overlay architecture — the 30 are preserved, PII never enters the spine

The comm metrics are computed by a SEPARATE `comm-metrics.ts` evaluator over the reader's
NON-PII derived rows and written to a SEPARATE overlay ledger. Comm-derived data never enters
`buildSpine`, so the prior 30 cells are unchanged. `comm-portfolio-reconciliation.json` is the
atomic union (spine 30 + comm 6 = 36/849, per-dealer 13/282); it asserts no comm ID collides
with a spine-evaluated ID. Emitted evidence is aggregate-only — integer numerator/denominator +
derived rate — never a name, customer, rep/thread/person token, or message content.

## 3. Order-invariance (the shadow-required fix)

Activity timestamps are MINUTE-resolution with one fixed offset, so same-minute events cannot be
sub-ordered from the data. An arbitrary tie-break was shown to swing SW-133 materially (Honda
13/12/13, Nissan 6/4/3, Ford 3/2/2 under three different tie-breaks on the SAME bytes). Both
thread metrics are therefore defined over timestamp VALUES, not array position:

- **SW-133** — for each outbound reply at minute `o`, count inbound at a minute strictly in
  (rep’s previous outbound minute, `o`); ≥2 flags the thread. The result is a function of the
  (direction, minute) multiset only → invariant to any same-minute permutation. An inbound
  sharing the reply minute is conservatively excluded and DISCLOSED
  (`ambiguous_excluded_endpoints`).
- **SW-137 → HELD.** Adjacency is defined over DISTINCT minute buckets: a SINGLETON inbound-Text
  bucket immediately followed by a SINGLETON outbound-Email bucket. Under this conservative rule
  EVERY observed candidate has a non-singleton (ambiguous) endpoint (Honda 1, Nissan 1, Ford 0
  candidate events, all ambiguous). The earlier 1/1/0 depended on unknowable within-minute order;
  reporting 0 would fabricate "missing" as zero. Under all-three-or-no-metric, SW-137 is **held
  across all three** with per-rooftop `candidate_guard_evidence` and an explicit next action
  (acquire seconds-resolution timestamps or an unambiguous message-sequence source). Its logic is
  retained as a non-promoting candidate guard.

## 4. The ten held IDs (explicit unresolved, exact missing item)

`SW-019` rep roster/absence not provable without an accepted roster (CAGE quarantined; `Users` is
candidate-unproved) — survivorship. `SW-026` "never" needs multi-week; one week only shows "no
video this week". `SW-076` business-hours-adjusted latency + "grows" + censoring. `SW-084` native
CAGE quarantined; user_group is BDC/Internet combined; `interaction_result` ~61% blank &
channel-mixed → connect/attempt not derivable. `SW-086` Answering Machine = reached voicemail, not
proof a message was left. `SW-132` external Sales-hours calendar captured (serra280.com /
tonyserraford.com: Mon–Sat 9:00–19:00, Sun closed, America/New_York) but "active thread" +
right-censoring + as-of reference unratified. `SW-134` needs ≥3 rep-response cycles/thread in one
week + wall-clock-vs-business-hours basis. `SW-137` (see §3). `SW-138` "multiple"/"rapid-fire"
(K,T) proxy unratified — swings ~3× (≥3-in-60min flags ~33% of threads). `SW-288` composite over
unresolved components. None relies on message meaning. Missing is never zero.

## 5. Controls

Adversarial tests (`src/test/comm-metrics.test.ts`): exact SW-022/133/137 semantics; **same-minute
permutation invariance** (reorder same-minute events → identical eligibility/count); censoring
(inbound run with no reply is not flagged); SW-133 reply-minute inbound conservatively excluded;
SW-137 singleton-vs-ambiguous endpoint; zero-denominator throws (missing is not zero); rank across
the three rooftops; SW-137 held with guard evidence; **PII value non-persistence** (sentinel
token/name values never appear); deterministic rerun; committed-evidence reconciliation
(36/849, spine 30 preserved, no ID collision). Full suite green; TypeScript at the known baseline
(no new errors in changed files); prettier + eslint clean; deterministic byte-identical rerun of
the generator; no raw CSV/JPEG/PII/secret committed; scope limited to comm files.

## Committed artifacts (SHA-256 first 16)

| File | sha256:16 |
| ---- | --------- |
| `src/server/reports/comms/comm-metrics.ts` | `9a8377f66109e69a` |
| `scripts/m1r-comms/build-comm-evaluation.ts` | `c17cee86d5cf9709` |
| `docs/halo/contract/sw295-comm-metric-specs.json` | `56128aa2b3633d63` |
| `docs/halo/evidence/m1r/comms/comm-evaluation-ledger.json` | `4b4ce0875a9373de` |
| `docs/halo/evidence/m1r/comms/comm-portfolio-reconciliation.json` | `0d9be741db35c2c9` |

Every `sha256:16` above is recomputed from the current committed bytes by
`src/test/comm-evidence-hashes.test.ts`, so a later formatting cycle that desyncs this proof
fails the suite instead of shipping a stale hash.
