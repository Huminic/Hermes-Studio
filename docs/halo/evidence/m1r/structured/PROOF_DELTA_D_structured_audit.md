# Gate 4D — Proof Delta D (structured-source expansion audit)

**Branch:** `codex/halo-295-unshrinkable-inputs`. One writer. **Status:** submitted for review,
NOT self-certified. **Bounded gate:** a re-audit of every currently-unresolved SW condition on a
native/structured VinSolutions cadence, to decide whether any additional definition-exact metric
can be promoted across all three governed rooftops from the ALREADY-ACCEPTED Sales-only
structured families (`appointments`, `crm_sales_gross`, `dealership_performance`,
`vinsolutions_custom_reporting_leads`) over the accepted week 2026-08-24..30. No NLP/content, no
75-ID NLP gate, no PDF/customer-final, no production, no browser/Gmail/schedule/CRM/external
mutation. Quarantined ROI/CAGE/Communication Log remain zero accepted metrics.

## 1. Result — 0 additional promotable IDs; portfolio UNCHANGED at 36 / 849

Every one of the **19** unresolved IDs on a native/structured cadence is **HOLD**. No evaluator,
spine cell, comm cell, or baseline changed. The portfolio is exactly the Gate 4C2 state:

- core 4-family spine: **30** evaluated (byte-semantically preserved, `spine-summary.json`)
- separate privacy-minimized comm overlay: **6** (SW-022, SW-133)
- **36 evaluated / 849 unresolved**; per rooftop **10 spine + 2 comm = 12 / 283**

ID accounting over the full catalog: **295 = 12 evaluated + 19 structured candidates + 264
residual non-structured**. Every comm/portfolio count in the reconciliation is **derived** from the
committed Gate 4C2 `comm-portfolio-reconciliation.json` (spine + comm overlay) composed with the
IDs promoted this gate (0), reconciled **fail-closed** on the governed dealer sets, `required_cells`,
and all aggregate/per-rooftop arithmetic — no `2`/`6`/`36`/`849` literal lives in the generator or
`portfolio.ts` logic. The composition stays correct if a prior gate ever adds or holds metrics.

## 2. Method — every verdict is byte-backed by the REAL spine, not hand-authored

`scripts/m1r-structured/build-structured-candidate-audit.ts` builds the Gate 2 spine from the
SHA-allowlisted accepted bytes (the exact `assembleGate2Inputs` path the evaluator tests use),
then for each candidate carries the spine's own `unresolved_reason` verbatim as
`spine_unresolved_reason` (cross-checked per rooftop by the test). Where the spine reason
addresses the catalog's ORIGINAL mapped source rather than the attempted accepted family, an
explicit `audit_note` records the accepted-family-specific reason (SW-013/014/016/017 leads-route;
SW-050 all-three rule; SW-084/109 dashboard check; SW-113/114 threshold). Data-dependent blockers
are recorded as privacy-safe integer counts only (no names, no rows, no PII).

## 3. The 19 structured candidates — all HOLD

**Appointments family.** `SW-008` no lead-source attribution in Appointments → per-source
lead-to-appointment ratio not computable. `SW-042` `Is Confirmed` is a static flag lacking the
"reconfirmed within 24h" timing basis → definition mismatch (a plain confirmed/total rate would be
a different metric; not substituted). `SW-043` "declining 3 weeks in a row" → trend, single held
week insufficient. `SW-113` "high set rate + low show rate" → no ratified numeric threshold for
high/low (inventing one fabricates a benchmark). `SW-114` "high show rate + low close rate" →
close-rate denominator is the Dashboard write-up TOTAL = 0, plus undefined threshold.

**CRM Sales Gross family.** `SW-034` write-to-close: no write-up count in CRM; Dashboard write-up
TOTAL = 0 → denominator 0 (missing is not zero). `SW-049` "gross/unit >15% below trailing 30-day"
→ trend. `SW-050` (see §4). `SW-111` "rising leads + falling close rate" → trend composite.

**Accepted Leads capture route (SW-011/012/015 family).** `SW-013` after-hours "no response by
opening +15 min" — the accepted Leads aggregate exposes only dealer-week medians/counts, not
per-row after-hours→next-opening timing or a business/holiday calendar. `SW-014` "auto-reply only"
— no auto-reply-vs-human classification (that is message content, the quarantined Communication
Log). `SW-016` weekend/holiday SLA breach — no weekend/holiday partition; holiday calendar is an
external source. `SW-017` phone lead "no outbound call within 5 min" — no per-channel lead type or
outbound-call-attempt timing (quarantined Communication Log).

**Quarantined native sources (checked, still zero).** `SW-001/004/005/006` native source is Lead
Source ROI (quarantined; hidden Parts/Service Lead Intents) + trend/attribution/cost. `SW-084`
BDC connect rate — native CAGE quarantined; the accepted Dashboard TOTALs do not expose BDC
connect/attempt. `SW-109` top-rep 5-day activity drop — CAGE quarantined; no accepted family
exposes per-rep daily activity; also a trend.

## 4. Material finding — SW-050 fires at Ford but cannot promote portfolio-wide

Front-gross-negative rate on new-car deals (threshold >20%), observed counts (privacy-safe):

| rooftop | new-car deals | negative front | blank front | evaluable? |
| ------- | ------------- | -------------- | ----------- | ---------- |
| Honda 21043 | 0 | 0 | 0 | no — denominator 0 (missing is not zero) |
| Nissan 21044 | 0 | 0 | 0 | no — denominator 0 (missing is not zero) |
| Ford 21047 | 4 | 1 | 2 | fires — ≥1/4 = 25% > 20%, robust to the 2 blank-front deals |

Ford's signal is real and would fire (the lower bound on the negative rate, 25%, already exceeds
the 20% threshold regardless of the two blank-front-gross deals). But Honda and Nissan each sold
**zero new cars** in the accepted week, so their denominator is 0 — missing is not zero. Under
all-three-rooftops-or-no-metric, SW-050 is **HELD across all three**. Next action: a week with
new-car sales at all three rooftops (and non-blank Front Gross) or a ratified single-rooftop
firing policy.

## 5. Residual 264 — categorically non-structured (accounted, not candidates)

158 Scheduled-source + downstream NLP/join (Enhanced Communication Log NLP and joins that touch a
quarantined family — includes the deferred 75-ID NLP gate); 56 Separate external source; 35
Outside governed boundary; 8 Unavailable/retention-limited; 7 Manual CRM inspection. None is
evaluable from the accepted structured families. **No accepted-family cross-join is
definition-exact:** the held readers emit privacy-minimized dealer-week aggregates with no shared
row-level key (no Lead ID / Sale ID / Appointment ID exposed across families), so every join
candidate fails on key/population/semantic alignment. The unused appointment fields
`completed`/`cancelled` have no matching SW condition in the catalog; none is manufactured.

## 6. Controls

`src/test/structured-candidate-audit.test.ts` (15 tests): the accepted-structured evaluator set is
EXACTLY the prior 10 (no silent expansion); the audit promotes 0 and every candidate is HOLD; the
ID accounting sums to 295; the reconciliation reaffirms 36/849 and equals the committed Gate 4C2
comm portfolio; the real spine evaluates exactly the 10 (30 cells); no candidate is evaluated in
the spine; every candidate hold reason matches the real spine `unresolved_reason` per rooftop;
SW-050 is blocked by 0 new-car deals at Honda/Nissan; the reconciliation's comm/portfolio counts
are DERIVED from the committed comm overlay (aggregate + per-rooftop), and `derivePortfolio`
(`scripts/m1r-structured/portfolio.ts`) FAILS CLOSED on dealer-set / required-cells / spine-baseline
/ internal-arithmetic divergence. Deterministic byte-identical regeneration of both artifacts. Full
suite green; TypeScript at the known baseline (no new errors in changed files); prettier + eslint
clean; no raw XLSX/PII/secret committed; scope limited to the Gate 4D files.

## Committed artifacts (SHA-256 first 16)

| File | sha256:16 |
| ---- | --------- |
| `scripts/m1r-structured/build-structured-candidate-audit.ts` | `aaf26ac9143d9222` |
| `scripts/m1r-structured/portfolio.ts` | `e0ebe787afa89bb4` |
| `docs/halo/contract/sw295-structured-candidate-matrix.json` | `44de524f40204024` |
| `docs/halo/evidence/m1r/structured/structured-portfolio-reconciliation.json` | `1eb44712353d0886` |
| `src/test/structured-candidate-audit.test.ts` | `db86c9710f790db4` |

Every `sha256:16` above is recomputed from the current committed bytes by
`src/test/comm-evidence-hashes.test.ts` (extended to parse this proof), so a later formatting
cycle that desyncs this proof fails the suite instead of shipping a stale hash.
