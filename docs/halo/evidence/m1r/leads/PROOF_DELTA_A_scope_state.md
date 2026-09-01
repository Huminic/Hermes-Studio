# M1R Leads source gate — Proof Delta A (scope / state)

**Branch:** `codex/halo-295-unshrinkable-inputs` from clean base
`28dd17f857ba64faeec2fbe45ad1a8ca68c37993`. One writer; base worktree clean before edits.
**Status:** source-gate only — submitted for review, NOT self-certified. The overall 885-cell
goal is NOT complete.

## What this gate adds (bounded)
A fail-closed VinSolutions Custom Reporting **Leads** browser-export family (contract, classifier,
reader, metric primitives, real-file golden), plus a durable **Gmail-scheduler** provenance
contract + non-PII evidence for the 18 native scheduled deliveries, plus an **active-acceptance
regression guard**. No promotion, no `/srv`, no Brain, no deploy, no Gmail/VinSolutions mutation.

## Changed / new files (SHA-256 first 16)
| Kind | File | sha256:16 |
|---|---|---|
| src (modified) | `src/server/reports/provisional/xlsx-reader.ts` | `a3e16458205cf0b3` |
| src (new) | `src/server/reports/leads/leads-family-contract.ts` | `58a95f241437232f` |
| src (new) | `src/server/reports/leads/leads-classifier.ts` | `9647728febeeab9b` |
| src (new) | `src/server/reports/leads/leads-reader.ts` | `5f21d13aff2935be` |
| contract (new) | `docs/halo/contract/vinsolutions-custom-reporting-leads-contract.json` | `7d446696d9be66b9` |
| contract (new) | `docs/halo/contract/gmail-scheduler-provenance-contract.json` | `865122d5a7ee27bc` |
| contract (new) | `docs/halo/contract/active-295-acceptance.json` | `761ec11233f75fb5` |
| evidence (new) | `docs/halo/evidence/m1r/leads/leads-real-golden.json` | `68f845a528623c37` |
| evidence (new) | `docs/halo/evidence/m1r/leads/leads-hold-proof.json` | `7e92cd85d1e808ce` |
| evidence (new) | `docs/halo/evidence/m1r/scheduled/native-scheduled-evidence.json` | `13c0fca11241c560` |
| tests (new) | `src/test/leads-family-contract.test.ts`, `leads-classifier.test.ts`, `leads-reader.test.ts`, `leads-real-golden.test.ts`, `native-scheduled-provenance.test.ts`, `active-acceptance-guard.test.ts` | — |
| test helpers (new) | `src/test/helpers/make-xlsx.ts`, `src/test/helpers/leads-fixture.ts` | — |
| scripts (new) | `scripts/m1r-leads/build-leads-golden.ts`, `scripts/m1r-scheduled/build-scheduled-evidence.ts` | — |
| governing (modified) | `docs/halo/evidence/m1r/SW295_R5_VERIFICATION.md` (supersession banner) | — |

## Three canonical Leads exports (manifest sha `8ae369850056c134…`)
| Profile | dealer_id | rows | raw sha256:16 | classifier |
|---|---|---|---|---|
| serra-honda | 21043 | 119 | `39f0577400c912b8` | **held**, 0 gaps |
| serra-nissan | 21044 | 68 | `6df075f91fd85cce` | **held**, 0 gaps |
| tony-serra-ford | 21047 | 43 | `549a6efecc574868` | **held**, 0 gaps |

Consumed by the exact manifest allowlist (filename+sha+bytes); never globbed. 4/4 capture-evidence
JPEGs (filter + 3 per-store tables) verified by existence+SHA only — **never committed** (PII).

## Boundaries honored
No raw XLSX/JPEG committed; no row-level PII/VINs/customer names in any committed artifact; no signed
download URLs; no `/srv` write; no Brain write; no promotion; no deploy/send/CRM/Gmail/VinSolutions
mutation. `xlsx-reader.ts` change is additive (`rawDates` option + optional `formulaCount`);
provisional-adapter + report-ingest suites unaffected.
