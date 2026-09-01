# M1R Leads source gate — Proof Delta B (outcome / validation)

Independent recomputation + validation of the Leads source gate. Source-gate only; the overall
885-cell goal is NOT complete.

## Tests (focused)
- `leads-family-contract` **9/9** — 57-header schema; JSON↔code single-source-of-truth for
  `required_provenance_fields` + `classifier_checks`; host admission (both official hosts; subdomain/
  suffix/port/dashboard-host-for-leads all rejected); provenance completeness (full → 0 gaps; naive tz
  → gap); allowlist by filename+sha+bytes.
- `leads-classifier` **25/25** — 1 positive hold (0 gaps) + 24 fail-closed negatives: bad magic, bad
  hash, bad/subdomain host, wrong dealer id/name, multi-rooftop, out-of-period, dup/blank Lead ID,
  disallowed lead type, Service source (rejected-Honda analog), hidden Service/Parts token in a
  non-source column, schema drift, 56-col, extra column, extra row, 2nd sheet, wrong sheet, formula,
  wrong report kind, naive captured_at, bad capture id, filename-period mismatch.
- `leads-reader` **7/7** — missing≠zero (blank→null, real 0 counted as 0); business-date has no UTC
  shift (late-evening serial keeps its calendar date); blank/zero breakdowns; all-blank → null stats.
- `leads-real-golden` **5/5** — committed golden is non-PII; each real file is allowlisted, holds with
  0 gaps, and recomputes to the golden incl blank/zero breakdown; 4/4 capture-evidence JPEGs
  exist+hash-match (no missing-file claim); hold-proof records all evidence present+matched.
- `native-scheduled-provenance` **4/4** — 9 held / 9 quarantined with expected families; sender proven
  per delivery from the SHA-verified ledger (`7820cfa7…`), attachment id unavailable; no URLs; contract
  requires sender.
- `active-acceptance-guard` **4/4** — 885 = 295×3; R5 is **6** evaluated dealer-cells (not "2 of 885");
  completion unshrinkable (withheld/cataloged/accounted do NOT count); input family necessary-not-sufficient.
- Consumer regression: `provisional-adapter` 22/22, `provisional-prototype-card` 6/6,
  `report-ingest-classify` 8/8 — the additive `xlsx-reader` change breaks nothing.

## Real-file golden (recomputed; reconciles to manifest sha `8ae369850056c134…`)
| Profile | rows | uniq LeadID | svc/parts | actualResp blanks/zeros | adjResp blanks/zeros | firstCustContact blanks | verdict |
|---|---|---|---|---|---|---|---|
| serra-honda | 119 | 119 | 0 | 65 / 1 | 65 / 11 | 63 | held, 0 gaps |
| serra-nissan | 68 | 68 | 0 | 46 / 1 | 46 / 1 | 23 | held, 0 gaps |
| tony-serra-ford | 43 | 43 | 0 | 24 / 0 | 24 / 3 | 16 | held, 0 gaps |

Missing≠zero proven: response-time blanks are excluded from sums (null), genuine numeric zeros counted
separately.

## Typecheck / lint / determinism
- **Typecheck (base vs branch): 498 == 498 errors; zero new; none in any file this branch touched.**
  (All 498 are pre-existing repo errors in unrelated files.)
- **Lint: clean** on every new/changed file.
- **Determinism:** second golden + hold-proof + scheduled-evidence builds are **byte-identical** to
  the first (no timestamps/randomness).

## Shadow corrections reconciled
1. Capture-evidence: all 4 JPEGs present + hash-matched; verified existence+SHA only, never committed;
   no missing-file claim.
2. One canonical provenance definition: contract JSON `required_provenance_fields` + `classifier_checks`
   now equal the code single-source-of-truth (incl `captured_at`, `declared_report_kind`,
   `filter_evidence`); asserted by test.
3. Scheduled sender bound per-delivery from the SHA-verified read-only Gmail metadata ledger (proven
   `from=reportscheduler@motosnap.com`); attachment id recorded **unavailable**, not invented.
4. Active-acceptance count corrected to **6 evaluated dealer-cells** (2×3), not "2 of 885".
5. Completion predicate is unshrinkable: "explicitly withheld" removed; withheld/cataloged/accounted
   do NOT count; uncalculable/unbaselineable remains unresolved unless Duane changes scope.
6. Negative/assertion tests added for all five defects; focused tests + goldens + lint + base-vs-branch
   typecheck all green; raw PII kept out of Git/evidence.
