# PROOF DELTA M - Gate 6 customer-facing Halo Sales Performance Report Card PDFs

**Gate:** 6 - final customer PDFs · **Accepted week:** 2026-08-24 through 2026-08-30 (America/New_York)

**Rooftops:** 21043 Serra Honda of Sylacauga · 21044 Serra Nissan of Sylacauga · 21047 Tony Serra Ford

> **Scope.** Gate 6 renders three polished, customer-facing Sales Performance Report Card PDFs from the
> accepted Gate 5B one-file models. Each PDF is built from EXACTLY ONE data JSON
> (`docs/halo/evidence/m1r/gate5b/gate5b-report-model-<dealer>.json`) and reads no other JSON (no Gate
> 5B bundles/appendix/ledgers, no Gate 5A, no internal audit, no raw evidence). The PDF layer invents
> no value, baseline, rank, dollar, causal claim, or unavailable metric - it renders only what the
> accepted model already contains. Coverage preserved: 17 evaluated + 278 not-measured = 295 metrics
> per dealer, exact SW-001..SW-295. No PDFs were emailed; nothing was activated.

## 1. Generator and determinism

- `scripts/halo-report-card/build_report_cards.py` - deterministic, parameterized ReportLab generator
  (`--model X --out Y` for any accepted model with the same schema; no args builds all three). Run in an
  isolated `/tmp/halo-pdf-venv` (reportlab + pypdf + pillow only); application dependencies unchanged.
- Determinism: ReportLab invariant mode fixes producer/date/document-id; a rerun is **byte-identical**
  (verified: identical SHA-256 across two runs).
- Fail-closed: the generator aborts (exit 2) if the model is missing, is not exactly 17/278/295 with the
  SW-001..SW-295 set, has the wrong accepted week, or contains any forbidden customer language.

## 2. Documents (one per dealer)

Each PDF is a 34-page consulting document: navy / teal / restrained gold palette, ASCII hyphens only,
stable page header/footer/page numbers. Sections in order: cover (store, week, practical promise);
executive summary with the model's typed narrative and a plain-language claim-layer legend
(direct result / consultant interpretation / testable possibility / recommended action); at-a-glance
scorecard of all 17 evaluated metrics (value, operational target, standing, three-store peer rank,
confidence, source and data age, with the note that operational targets drive the scorecard and
external studies are reference-only where definitions differ); the four required sections (Response
consistency; Conversation effectiveness; Appointment conversion; Showroom execution and ownership) each
with its measured metrics table, evidence-led narrative, implication, testable hypotheses, and
prioritized action (owner / cadence / success measure / effort / impact); cross-metric synthesis (each
inference/hypothesis cites >= 2 metric IDs); impact roadmap; a bounded vehicle opportunity scenario
(appointment gap -> additional shows -> low 20% / base 30% / high 41% range, no dollar figure because
the model carries dollars=null); notification and automation opportunities shown as "Available - not
activated"; a visibility expansion plan grouping all 278 not-measured metrics into themes with a next
visibility unlock; the complete SW-001..SW-295 appendix (one row each); a references/method note with
clickable public sources and where definitions differ; and a final 30-day management cadence.

## 3. QA results (fail-closed; see gate6-pdf-manifest.json)

| Dealer                          | Pages | Bytes  | SHA-256 (16)       | SW ids  | Store/period | Forbidden | PII |
| ------------------------------- | ----- | ------ | ------------------ | ------- | ------------ | --------- | --- |
| 21043 Serra Honda of Sylacauga  | 34    | 100277 | `5e5af1e159a6a99b` | 295/295 | present      | 0         | 0   |
| 21044 Serra Nissan of Sylacauga | 34    | 100190 | `cc94e382d23590de` | 295/295 | present      | 0         | 0   |
| 21047 Tony Serra Ford           | 34    | 99839  | `420d8f3438ec6822` | 295/295 | present      | 0         | 0   |

- **Reopen:** each PDF reopened with pypdf (valid, readable) and inspected with pdfinfo (letter, 34 pp).
- **Text checks (pdftotext):** store name + `#id` + human period present; every SW-001..SW-295 appears
  at least once; the 17 / 278 / 295 totals present; **zero** whole-word Service/Parts; zero internal
  terms (Gate 5A / internal audit / raw evidence / quarantine / withheld / blocked / filenames / paths);
  **zero** PII/contact data (public reference domains excluded).
- **Visual QA:** every page of all three PDFs rendered to PNG (pdftoppm) and reviewed via Pillow contact
  sheets plus full-resolution inspection of the cover, executive summary, scorecard, all four sections,
  cross-metric synthesis, impact roadmap, vehicle scenario, notification opportunities, visibility plan,
  appendix (start/mid/end), references, and final cadence. Disposition: **PASS** - no clipping,
  overflow, overlap, unreadable type, broken links/glyphs, black boxes, awkward breaks, orphaned
  headings, or sparse/unfinished pages. An automated ink-fraction scan confirms no near-blank page.

## 4. Local visual-QA correction (applied before commit)

An independent local inspection found two fragment-only near-blank pages in an earlier 37-page render (a
Recommended-action table and the tail of a notification table each stranded on an otherwise blank page,
caused by a forced page break after content that had already overflowed). Fixed by removing the
inter-section forced page breaks (continuous flow) and binding each heading + its table and each action /
notification block with `KeepTogether`, so no heading orphans and no table fragment is stranded. Re-render:
**34 pages** per dealer, zero sparse pages, sections intact. No content, value, or wording changed.

## 5. Controls

- Focused test (`src/test/gate6-pdf-manifest.test.ts`): the manifest records 3 dealers, 34 pages each,
  295/17/278 coverage, zero forbidden terms, zero PII; each committed PDF exists and its recomputed
  SHA-256 equals the manifest (byte-stable, deterministic).
- Full suite, `tsc` baseline, Prettier/ESLint, and the prior Gate 4H/4I/4J/5A/5B hash guards all green;
  no Gate 5A/5B or earlier artifact changed. Only Gate 6 files (generator, QA, PDFs, manifest, proof,
  focused test) were added.

### Recorded source hashes (sha256, first 16 hex)

| File                                                   | sha256:16          |
| ------------------------------------------------------ | ------------------ |
| `scripts/halo-report-card/build_report_cards.py`       | `3a4b692ed63550f7` |
| `scripts/halo-report-card/qa_report_cards.py`          | `38266ebf7c789789` |
| `docs/halo/evidence/m1r/gate6/gate6-pdf-manifest.json` | `5c1e373a00e4087a` |

## 6. Residual risk

- The generator runs under an isolated `/tmp` venv (ReportLab 4.4.3 with a Python-3.8 md5 shim); the
  committed PDFs are the authoritative deterministic artifacts and are hash-guarded by the focused test.
- PDFs are committed binaries; a future ReportLab/Python change could alter bytes, which the focused
  SHA-256 test would catch immediately.
