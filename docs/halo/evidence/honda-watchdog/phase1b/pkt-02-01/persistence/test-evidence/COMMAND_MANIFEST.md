# Part-A durable test-evidence — FINALIZED pre-run COMMAND MANIFEST

Frozen BEFORE FOCUSED_RERUN_PRE.json and before any process starts. Once the process
starts, neither this manifest nor PRE may change. Repo
`/home/ubuntu/hs-m1r-isolated-20260830`, branch `codex/halo-295-unshrinkable-inputs`,
HEAD `ecc1f6ec97da9bff66fa03df2f139ddfb1c74ddf` (must stay unchanged; nothing
committed). This packet performs ONE evidence-repair focused rerun and STOPS.

## Superseded baseline (explicit — not reconstructed)
The earlier "focused battery 102/102" claim is **SUPERSEDED and unsupported**: no exact
historical command or file list was ever preserved, and no file combination
reconstructs 102. Per interlock ruling it is NOT reconstructed or inferred. The NEW
fixed 13-file focused baseline below replaces it. Totals are reported honestly against
this baseline with NO comparison to 102 and NO manipulation of test granularity.

## Recovery binding (out-of-allowlist helper deviation)
A prior PRE-build used an out-of-allowlist helper `/tmp/build_pre.cjs`
(sha256 `d8bd401f1aa657481057be88b4051fbb295994bde2dbee93c63af0669db77c68`, 6075 B),
caught by the impartial shadow BEFORE any test ran. Recovery, per shadow ruling:
one seventh evidence file `DEVIATION_DISCLOSURE.md` records it; the helper is removed
and proven absent; PRE is rebuilt with a single in-memory `node -e` (no redirection,
no helper). This manifest and the disclosure are frozen before the rerun. Full detail:
`DEVIATION_DISCLOSURE.md`.

## Seven-path write allowlist (this packet writes NOTHING else)
1. test-evidence/COMMAND_MANIFEST.md            (this file; pre-run)
2. test-evidence/DEVIATION_DISCLOSURE.md        (pre-run; recovery record)
3. test-evidence/FOCUSED_RERUN_PRE.json         (pre-run)
4. test-evidence/focused-rerun/focused.txt      (run output)
5. test-evidence/focused-rerun/focused.sidecar.json  (post-run)
6. test-evidence/focused-rerun/FOCUSED_TOTALS.md     (post-run)
7. test-evidence/FOCUSED_RERUN_POST.json        (written last; self-exempt, hashes the other six)

IMMUTABLE (PRE/POST byte-compared, never written this packet):
`test-evidence/focused/focused.log`, `test-evidence/focused/focused.sidecar.json`,
`test-evidence/focused/FOCUSED_TOTALS.md`, `test-evidence/UNPLANNED_PRECHECK_DISCLOSURE.md`.
No implementation/test/config change; no full suite/validators/receipt regen/other doc
reconciliation/commit/push/PR/deploy/Vin/Gmail/external action.

## Focused baseline — exact ordered 13-file list (interlock-approved)
1 src/test/pkt-02-01-canonical-watchdog-store.test.ts
2 src/test/pkt-02-01-brain-store.test.ts
3 src/test/brain-store.test.ts
4 src/test/pkt-02-01-adversarial.test.ts
5 src/test/pkt-02-01-binding.test.ts
6 src/test/pkt-02-01-engine.test.ts
7 src/test/pkt-02-01-report.test.ts
8 src/test/pkt-02-01-store.test.ts
9 src/test/pkt-02-01-leads-input.test.ts
10 src/test/pkt-02-01-source-inventory.test.ts
11 src/test/brain-record-families.test.ts
12 src/test/watchdog-store.test.ts
13 src/test/watchdog-notifications-store.test.ts

## Fixtures (predicate inputs; byte-verified in PRE)
- XLSX `/tmp/halo-295-leads-20260831/serra-honda-21043_leads_2026-08-24_2026-08-30.xlsx`
  sha256 `39f0577400c912b8e0f0db4a37a35726c1a460c32df88f231aaa39aff9d100ae` size 46940.
- `/tmp/halo-295-leads-20260831/capture-manifest.json`
  sha256 `8ae369850056c13473e211921eba5f85dc61a2fe29f9b2942e0727e33148676c` size 6201.

## Exactly TEN permitted describe.runIf(HAVE) — enumerated, predicates TRUE
First nine predicates = `fs.existsSync(HONDA_XLSX)` (TRUE, fixture present). The tenth
(leads-input) = `existsSync(HONDA_XLSX) && existsSync(capture-manifest.json)` (TRUE,
both present).
1. pkt-02-01-canonical-watchdog-store.test.ts :1141 'PKT-02-01 canonical persistence'
2. pkt-02-01-canonical-watchdog-store.test.ts :1300 'legacy backfill + compatibility reads'
3. pkt-02-01-canonical-watchdog-store.test.ts :1405 'full-graph tamper detection'
4. pkt-02-01-brain-store.test.ts :72 'PKT-02-01 Brain persistence adapter'
5. pkt-02-01-engine.test.ts :21 'PKT-02-01 engine — end-to-end execution'
6. pkt-02-01-report.test.ts :27 'PKT-02-01 customer mini-report'
7. pkt-02-01-report.test.ts :59 'PKT-02-01 SIP semantic patterns (self-check)'
8. pkt-02-01-report.test.ts :79 'PKT-02-01 internal evidence companion'
9. pkt-02-01-store.test.ts :43 'PKT-02-01 dev store'
10. pkt-02-01-leads-input.test.ts :24 'PKT-02-01 Honda-21043 leads input (sha-verified)'
Distribution: canonical 3, brain 1, engine 1, report 3, store 1, leads-input 1 = 10.

## Prohibited-construct scan (all 13 files) — CLEAN
`.skip` / `.skipIf` / `.todo` / `xit(` / `xdescribe(` / `.only`: NONE.
Total `runIf`/`skipIf` occurrences across all 13: 10, ALL `runIf(HAVE)`; no non-HAVE
conditional construct. No other conditional gating beyond the ten enumerated blocks.

## FULL literal approved process command (run EXACTLY once; no placeholders)
```
HALO_LEADS_DIR=/tmp/halo-295-leads-20260831 npx vitest run src/test/pkt-02-01-canonical-watchdog-store.test.ts src/test/pkt-02-01-brain-store.test.ts src/test/brain-store.test.ts src/test/pkt-02-01-adversarial.test.ts src/test/pkt-02-01-binding.test.ts src/test/pkt-02-01-engine.test.ts src/test/pkt-02-01-report.test.ts src/test/pkt-02-01-store.test.ts src/test/pkt-02-01-leads-input.test.ts src/test/pkt-02-01-source-inventory.test.ts src/test/brain-record-families.test.ts src/test/watchdog-store.test.ts src/test/watchdog-notifications-store.test.ts --maxWorkers=2
```
Output captured by ordinary stdout+stderr redirection to `focused-rerun/focused.txt`
(no tee/pipeline/second invocation). Immediate exit preserved in a task-specific shell
variable and recorded in the sidecar.

## Acceptance (this packet)
13/13 files, EXACTLY 162/162 tests, zero failed, zero skipped, zero todo, exit 0.
Any drift / unexpected status path / input change / second invocation / ambiguity /
count mismatch ⇒ STOP and disclose. STOP immediately after POST.
