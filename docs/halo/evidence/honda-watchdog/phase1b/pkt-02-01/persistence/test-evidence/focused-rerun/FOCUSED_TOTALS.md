# Focused RERUN — honest totals

Single approved rerun of the interlock-approved 13-file baseline. The prior "102/102"
is explicitly SUPERSEDED (not reconstructed); no comparison to 102.

- Command: frozen 13-file list, `--maxWorkers=2` (see COMMAND_MANIFEST.md / sidecar).
- Output: `focused-rerun/focused.txt` (sha256 `1ef08afc059f…`, 1261 bytes).
- Sidecar: `focused-rerun/focused.sidecar.json` (process_exit=0).
- Start/End UTC: 2026-09-03T03:44:48Z / 2026-09-03T03:44:58Z.

## Totals
- Test files: **13 passed / 13**
- Tests: **162 passed / 162**
- Skipped: **0**  ·  Todo: **0**  ·  Failed: **0**  ·  Process exit: **0**

## Per-file (verbatim from focused.txt)
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

Consistency: identical file set, count (162), and pass/skip/fail profile as the
original `focused/` run (which reported 13 files / 162 tests). All ten
`describe.runIf(HAVE)` blocks executed (fixture present ⇒ zero skips).
