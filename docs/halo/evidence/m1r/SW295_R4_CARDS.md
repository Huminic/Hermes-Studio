# M2R Gate R4 — Polished three-dealer Halo Sales report cards + visual QA (internal evidence)

**Bounded gate:** R4 only — exactly three final customer-facing PDF Sales report cards from the
validated accepted-facts + R3 synthesis, a deterministic HTML renderer + tests, and internal
visual/automated QA. DEV/ISOLATED, Sales-only. One writer, branch `codex/m1r-gate3-schedule-audit`
from `089503327` (R3 backup). **No email/send, deploy, merge, production write, alert/automation
activation, CRM mutation, or Service/Parts data.** Status: submitted-for-review, NOT self-certified.

## Deliverables
- `src/server/reports/halo-card-render.ts` (NEW) — `buildHaloCardModel(bundle)` +
  `renderHaloCardHtml(model)` (executive design) + `assertCustomerSafe(html)` fail-closed guard.
- `src/test/halo-card-render.test.ts` (NEW, 11 tests) — exact counts/values, customer-safety,
  no-benchmark, honest Watchdog (no false 295-execution), Ford count-safe, Not-Active labels,
  required headings, determinism, forged-bundle rejection, /srv read-only equality.
- `scripts/m2r-r4/generate-cards.ts` (NEW) — deterministic generator: HTML -> PDF via the in-repo
  Playwright/Chromium `page.pdf` path, per-page PNG via `pdftoppm`, automated QA via
  `pdfinfo`/`pdftotext`, and the QA manifest.
- `output/pdf/halo/halo-<profile>-2026-08-24_2026-08-30.{html,pdf}` — the three final PDFs +
  retained print-ready HTML source.
- `docs/halo/evidence/m1r/r4/qa-manifest.json` + `docs/halo/evidence/m1r/r4/qa/*.png` — internal
  QA manifest + per-page PNG contact set (14 pages). Not customer-facing.

## The three PDFs (QA manifest, all_pass = true)
| Store | Dealer | Pages | Page size | Measures | Actions | HTML sha256 (deterministic) | PDF bytes |
|---|---|---|---|---|---|---|---|
| Serra Honda | 21043 | 4 | 595.92 x 842.88 pts (A4) | 19 | 4 | `48186f3525135fa7…` | 122,963 |
| Serra Nissan | 21044 | 5 | 595.92 x 842.88 pts (A4) | 19 | 7 | `3fa60e4f57626afe…` | 135,022 |
| Tony Serra Ford | 21047 | 5 | 595.92 x 842.88 pts (A4) | 17 | 7 | `ef0e51af26dedd7a…` | 134,866 |

(These are the CURRENT post-correction artifacts, reconciled exactly to `r4/qa-manifest.json`. The
HTML sha changed from the initial R4 generation because the correction below moves the action copy
to the non-causal "In context:" framing, which is part of the rendered HTML. PDF sha256 is recorded
per store in the manifest but is not asserted stable: Chromium embeds a creation timestamp in PDF
metadata. The HTML source is byte-deterministic and is the stable hash.)

## Planned-vs-actual (customer experience)
- **Executive design:** cover/hero with store identity + freshness badge, KPI cards, funnel bar
  chart, appointment counts/rates, response, gross, ranked action plan, alerts/automations table,
  metric appendix, Semantic Watchdog panel, footnotes. ASCII hyphens only; consistent header/footer
  with `Page N of M`; A4 grid; generous whitespace.
- **Headings (exact):** Executive Snapshot; Momentum and Opportunity; Sales Funnel; Appointment
  Execution; Response and Follow-up; Gross Performance; Priority Action Plan; Recommended Alerts and
  Automations; Metric Appendix; Semantic Watchdog. No engineering headings.
- **Period + freshness:** "Aug 24, 2026 - Aug 30, 2026" and badge "Data current through Aug 30,
  2026; generated Aug 31, 2026; one day old." No trend/causal language.
- **Every honest current measure:** Honda 19, Nissan 19, Ford 17. Corrected visit-to-sale **15.4% /
  23.5% / 21.4%** (governed `visitsSold` numerator); lead-to-sale yield **5.8% / 10.5% / 16.2%**;
  full appointment counts/rates; response 210 / 238 / 317 min; gross totals **$14,185.20 /
  $13,224.00 / $1,600.99** with front/back mix.
- **Ford count-safe:** the two count-dependent per-unit composites (average gross per sale, gross
  per delivered unit) are NOT shown for Ford (17 measures, verified); shown for Honda/Nissan where
  the sold count agrees. Ford's front-gross-below-zero is presented honestly with a front-end desking
  action.
- **Findings (4/7/7):** ranked constructive opportunities using the R3 external copy, each with a
  manager/persona owner, follow-up metric, Recommended Alert, and Recommended Automation, all labeled
  **Not Active - Review Before Activation**. Nothing is created or enabled.
- **Semantic Watchdog panel (honest):** "295-condition Semantic Watchdog framework; directly
  evaluates the two ratified appointment rules (show rate, no-show rate); draws on N derived
  measures." No implication of 295 firings; no internal SW ids in customer copy. The full 885-row
  ledger stays in internal R1 evidence.
- **No benchmark:** no definition-compatible benchmark exists for the current accepted appointment
  measures, so no benchmark/industry comparison/score/standard is shown; dealer-relative + funnel
  logic only.

## Visual QA (initial pass — SUPERSEDED by the shadow-correction re-inspection below)
- Per-page PNGs (110 dpi) for all 14 pages via `pdftoppm` under `r4/qa/`.
- This initial pass inspected only a subset of pages and stated "no clipping" too broadly. The
  shadow later found an intermittent header/footer left-clip on Serra Nissan p4. That statement is
  RETRACTED; see "R4 shadow correction" below, where the template was made structurally clip-proof
  and **all 14 pages were re-rendered and inspected individually** with full headers/footers.
- Automated per-page checks (every page, all three): opens (`pdfinfo`); page count; **no blank page**
  (per-page `pdftotext` non-empty); A4 dimensions; expected store/dealer/period/heading/Not-Active
  text present; **no banned term** (limitation/issue/quarantine/withheld/missing/blocked/unsupported/
  discrepancy/failure), **no Service/Parts**, no SW id, no slug code, no hash/path, no non-finite, no
  glyph-replacement. `all_pass = true`.

## Boundaries / footnotes
Zero Service/Parts/PII/raw filenames/hashes/DB paths/internal ids (except dealer number)/stale-source
discussion in the customer PDFs (verified on extracted text). Footnotes state only: one-week snapshot;
rates use the displayed numerator/denominator; recommendations are steps to review next period; Sales
data only.

## Proof Delta A (scope/state)
New files: `halo-card-render.ts`, `halo-card-render.test.ts`, `scripts/m2r-r4/generate-cards.ts`, the
three `output/pdf/halo/*.{html,pdf}`, `r4/qa-manifest.json`, `r4/qa/*.png`, this doc. Changed-scope
truth: the accepted-facts layer and the report layer are unchanged; the R3 synthesis file
`consultant-synthesis.ts` IS modified in the shadow correction below — solely to export and extend
the shared `PROHIBITED_CLAIM` customer-claim scanner for centralized guarding — with its behavior and
tests unchanged (R3 `consultant-synthesis` suite stays 20/20; every added token verified absent from
all R3 text). No runtime metric-resolver change; no `/srv` write; no raw XLSX/PII in source. (This
supersedes the initial R4 report's "purely additive" framing, which held only before the correction.)

## Proof Delta B (outcome/validation)
- `halo-card-render` **11/11**; QA manifest `all_pass = true` (14/14 pages).
- Full suite / R1/R2/R3/R4 controls / touched-file typecheck / diff / PII / durable `/srv`
  before-after hashes: see the R4 checkpoint report and the shadow-correction report below.

---

# R4 shadow correction — non-causal language + clip-proof running header/footer

Two bounded defects from shadow review; both corrected; all three cards regenerated and all 14
pages re-inspected individually. Status: submitted-for-review, NOT self-certified.

## Correction A — remove causal/outcome claims that bypassed the R3 scanner
`halo-card-render.ts` `whyFor()` had been outside the R3 prohibited-claim scanner and reintroduced
causal/outcome language. Fixed:
- Every `whyFor()` sentence rewritten to an evidence-bounded, non-causal restatement of what the
  measure shows plus a next-period comparison (no deliveries/productivity/buyer-readiness/traffic/
  engagement/ROI/magnitude). The card label changed from "Why it matters:" to "In context:".
- The R3 `PROHIBITED_CLAIM` scanner is now **centralized and exported** from
  `consultant-synthesis.ts` and **reused** by the R4 `assertCustomerSafe` guard, so any
  customer-facing field fails closed on a causal/outcome claim. The scanner was extended with the
  shadow-flagged phrases and equivalents (most direct path; additional/into/more deliveries;
  productive; ready buyers; protects; prospects engaged; toward a visit; frees/freeing; showroom
  time; attention will pay; pay(s) off; more resilient / resilient). Every added token was verified
  ABSENT from all R3 finding/narrative text, so R3 behavior is unchanged (R3 suite stays 20/20).
- Tests: `assertCustomerSafe` now fails closed on all seven shadow-flagged phrases plus equivalents
  ("this will increase sales", "drives more deliveries"); the three cards contain none of them and
  use the "In context:" framing.

## Correction B — running header/footer clipping (Nissan p4)
The prior evidence doc's blanket "no clipping" statement was **wrong**: Chromium's
`displayHeaderFooter` intermittently left-clipped a flex `space-between` line (Nissan p4 showed only
trailing "...a Nissan" / "...ra Nissan"). Fixed structurally in `scripts/m2r-r4/generate-cards.ts`:
the running header/footer now use `box-sizing:border-box`, a shrinkable left span
(`flex:1 1 auto; min-width:0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis`) and a
fixed right span (`flex:0 0 auto`). Any overflow now truncates on the RIGHT of the left span and can
never clip the left edge; the period / page numbers are always fully shown.

## Re-inspection (all 14 pages individually, post-fix)
Every page of all three PDFs was rendered to PNG (`pdftoppm`) and inspected:
- Serra Honda p1-p4, Serra Nissan p1-p5, Tony Serra Ford p1-p5.
- Running header ("Halo Sales Performance - <dealer>" / period) and footer ("Confidential -
  prepared for <dealer>" / "Page N of M") render FULLY on every page, including the previously
  clipped Nissan p4. No clipping/overlap/black boxes/blank pages/tiny text/orphan headings; page
  numbers consistent; charts/tables legible; Ford count-safe (no per-unit composites); honest
  Watchdog 295 / 2 / 19|17; freshness badge and exact values correct.
- Note: automated `pdftotext` confirms the header/footer strings are present in the text layer on
  every page (a visual clip does not remove text-layer content), so header/footer completeness is
  established by the structural template fix + the individual visual inspection above.

## Verification (correction)
- `halo-card-render` **11/11**, `consultant-synthesis` **20/20** (shared scanner extension does not
  change R3 behavior). QA manifest regenerated: `all_pass = true` (14/14 pages).
- Cards regenerated deterministically (HTML sha stable); `/srv` durable brain.db byte-identical
  before/after regeneration. Full suite / R1-R4 controls / typecheck / diff / PII: see the R4
  correction checkpoint report.
