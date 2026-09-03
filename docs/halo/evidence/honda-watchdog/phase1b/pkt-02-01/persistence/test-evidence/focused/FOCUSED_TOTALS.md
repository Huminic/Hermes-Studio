# Focused durable run — honest totals (interlock boundary)

- Command: frozen 13-file list (see COMMAND_MANIFEST.md), `--maxWorkers=2`.
- Raw log: `focused.log` (sha256 `c432ee8f31ff4918058edf47ae1cbc7e4652d05250e8168ca2502ccfe6844a73`, 1016 bytes).
- Sidecar: `focused.sidecar.json` (process_exit=0).
- Start/End UTC: 2026-09-03T03:27:46Z / 2026-09-03T03:27:56Z.

## Totals (honest; NO comparison to the superseded 102)
- Test files: **13 passed / 13**
- Tests: **162 passed / 162 collected**
- Skipped: **0**  ·  Failed: **0**  ·  Process exit: **0**

## Per-file breakdown (verbatim from log)
| # | file | tests |
|---|------|-------|
| 1 | pkt-02-01-canonical-watchdog-store.test.ts | 57 |
| 2 | pkt-02-01-brain-store.test.ts | 26 |
| 3 | brain-store.test.ts | 7 |
| 4 | pkt-02-01-adversarial.test.ts | 9 |
| 5 | pkt-02-01-binding.test.ts | 6 |
| 6 | pkt-02-01-engine.test.ts | 9 |
| 7 | pkt-02-01-report.test.ts | 5 |
| 8 | pkt-02-01-store.test.ts | 7 |
| 9 | pkt-02-01-leads-input.test.ts | 4 |
| 10 | pkt-02-01-source-inventory.test.ts | 5 |
| 11 | brain-record-families.test.ts | 11 |
| 12 | watchdog-store.test.ts | 4 |
| 13 | watchdog-notifications-store.test.ts | 12 |
| | **sum** | **162** |

## Attribution of the only edited file in this list
`pkt-02-01-canonical-watchdog-store.test.ts` = **57** now (was **54** before this
packet). Net **+3** from the Defect-A/B test changes, with no granularity manipulation:
- Defect A: removed 1 value-bearing calc-pending persist test; added 2 (a non-null
  calc-pending REJECTION test + a value===null persist test) ⇒ net +1.
- Defect B: added 2 strict-IFF rejection tests (non-GNA non-null ref rejected;
  GNA non-string ref rejected) ⇒ +2.
(The two-artifact test was renamed to non-catalog sentinels and re-shaped to both
observations accepted_measured; it remains a single test — no count change.)

STOP: holding at the interlock boundary. Full regression / validators / eslint / tsc
and the backfill-receipt regeneration are declared but NOT yet run (await release).
