# Controller deviation disclosure — two unauthorized incidents (honest recovery)

Packet: SW-CONTROLLER-RECOVERY-20260903-A. A controller/transport failure caused two
unauthorized events AFTER the accepted focused recovery. All prior full-regression
authorization is withdrawn and consumed. This recovery packet ran NO tests. HEAD
remained `ecc1f6ec97da9bff66fa03df2f139ddfb1c74ddf`; branch
`codex/halo-295-unshrinkable-inputs`. Facts attributed to the controller / independent
observation are labeled as such; this agent did not personally initiate incident 1.

Environmental Core Values honored: #1 truth-over-compliance, #4 no-fake-chronology,
#10 explicit-over-implicit, #11 honest-recovery, #12 no-passing-the-system.

---

## Incident 1 — wrong-root partial Vitest (controller-reported / independently observed)
A Vitest run was launched from the WRONG working directory. This agent did not author
it; it is disclosed here for completeness and because its non-filesystem effects cannot
be fully reconstructed.

- Exact command: `HALO_LEADS_DIR=/tmp/halo-295-leads-20260831 npx vitest run --maxWorkers=2`
- Wrong cwd: `/home/ubuntu` (NOT the repo root).
- Approximate start: npm log timestamp `2026-09-03T03:53:14.827Z`.
- PID chain: `1400451 / 1400467 / 1400500 / 1400501`. The controller killed the exact
  chain; a later process search found none of them running.
- Temp artifact `/tmp/Dlc1GXz9V0hNmrGQ1rE5x` created
  `2026-09-03T03:53:27.528188923Z`; its `ssr/` subtree final mtime
  `2026-09-03T03:53:45.672212090Z`. Inventory — FOUR distinct quantities kept separate
  (regular-file bytes are NOT the `du` apparent size):
  - `regular_file_count = 177` (all under `.../ssr`; zero root-level regular files;
    no other file types);
  - `regular_file_bytes = 15273875`
    (`find "$SSR" -type f -printf '%s\n' | awk '{s+=$1} END{print s}'`);
  - `ssr_du_apparent_bytes = 15294355` (`du -sb "$SSR"` = regular-file bytes + the
    20480-byte `ssr` directory entry);
  - `root_du_apparent_bytes = 15298451` (`du -sb /tmp/Dlc1GXz9V0hNmrGQ1rE5x` =
    ssr_du_apparent_bytes 15294355 + the 4096-byte root directory entry).
  Content+absolute-path manifest
  `SSR=/tmp/Dlc1GXz9V0hNmrGQ1rE5x/ssr; find "$SSR" -type f -print0 | LC_ALL=C sort -z | xargs -0 sha256sum | sha256sum`
  = `01234eeedb604002d78db19c707a8d6e72f9e902907759ce86624c49b2367b11`.
- The transformed source maps identify EXACTLY 17 target + unrelated/live-named test
  sources. The full inventory is now recorded DURABLY in **Appendix A** (full 40-char
  cache ids, source basenames, original-source SHA256, original-source byte counts) —
  no longer merely "preserved". One row (`3fa9379a…`,
  `pkt-02-01-canonical-watchdog-store.test.ts`, `2aee17ae…`, 55026) matches THIS
  repo's restored test file exactly and was independently cross-checked.
- An empty tree `/home/ubuntu/evidence/comprehensive-testing/phase-6/{logs,screenshots}`
  was created at `2026-09-03T03:53:45.300211617Z`.
- npm metadata/cache was touched and a registry GET occurred (npm log start
  `2026-09-03T03:53:14.827Z`); the 975-byte npm debug log was ROTATED by ongoing npm
  activity BEFORE it could be hashed. Two concrete npm cache artifacts survived and are
  recorded in **Appendix A** (content-v2 blob + index-v5 entry, with SHA256, byte size,
  nanosecond mtimes, and the `make-fetch-happen` registry key).
- No new `_npx` files and no `hermes-test-home-*` directories were found.
- **Unresolved:** collection / partial execution and any NON-filesystem external
  effects (registry traffic, cache mutation, rotated logs) CANNOT be fully
  reconstructed. No test result is inferred or claimed from this run. Equally, it is
  NOT claimed that "nothing ran" or "nothing was touched" — things were touched; the
  full extent is not fully knowable.
- Per packet: NONE of these accidental artifacts (`/tmp/Dlc1GXz9V0hNmrGQ1rE5x`, npm
  cache/logs, the `/home/ubuntu/evidence` tree) are deleted or cleaned in this pass.

---

## Incident 2 — stale tmux-buffer paste (this agent, read-only + additive, no test)
A failed multiline `set-buffer` was followed by an already-sequenced UNNAMED paste +
Enter, which submitted STALE prior 12-item infrastructure instructions into this pane.
Acting on those stale instructions, this agent performed:
- read-only inspection; an Explore subagent (read-only audit of items 2–7,10);
- a `sqlite3 "file:<db>?mode=ro"` inventory of all 15 Brain DBs;
- wrote a fixture-DB reconciliation doc;
- appended a multi-module report block to the canonical store;
- added facade exports; and added one test import.
The controller then interrupted with Ctrl-C BEFORE any test-body work. **No test was
launched by this agent in incident 2.**

### Exact accepted → stale deltas (all now RESTORED by this packet)
| file | accepted (sha/size) | stale (sha/size) | when | delta |
|---|---|---|---|---|
| src/server/watchdog/canonical-watchdog-store.ts | 8209ee7c…/103871 | 239fa66d…/110086 | 04:01:55Z | +171 lines / +6215 B append |
| src/server/watchdog/watchdog-run-store.ts | 90e0adb4…/4862 | d23d1c1b…/5172 | 04:02:04Z | +310 B export addition |
| src/test/pkt-02-01-canonical-watchdog-store.test.ts | 2aee17ae…/55026 | d9816bb9…/55055 | 04:02:19Z | +29 B import line |
| (new) FIXTURE_DB_RECONCILIATION.md | — | 56552746…/3922 | 03:57:10Z | new doc (now quarantined) |

Restoration (this packet): the three source/test files are edited back to their exact
accepted SHA/size; the reconciliation doc is moved (recoverable `mv`, byte-preserving)
to `test-evidence/controller-deviation/quarantine/FIXTURE_DB_RECONCILIATION.stale-prompt.md`
(sha `5655274632c36561…`, 3922 B). No content of the quarantined doc was altered.

### Side effect of the read-only sqlite inventory
The `mode=ro` sqlite access changed the mtimes of all 15 `brain.db-shm` files. All 15
MAIN `brain.db` files remained byte-identical (hash + size) AND mtime-identical. The
`-shm` mtime change is an unavoidable SQLite shared-memory side effect of opening a WAL
database even read-only; no main DB content changed.

---

## Clean / protected state (verified)
- Target branch and HEAD remained exact (`ecc1f6ec9…`).
- Before the stale-buffer edits, target git status and the accepted focused artifacts
  were unchanged.
- Honda XLSX SHA `39f0577400c912b8e0f0db4a37a35726c1a460c32df88f231aaa39aff9d100ae`,
  size 46940.
- capture-manifest SHA `8ae369850056c13473e211921eba5f85dc61a2fe29f9b2942e0727e33148676c`,
  size 6201.
- Complete protected `~/.hermes` inventory: 428/428 files content-identical by hash and
  size; all 15 main `brain.db` files additionally mtime-identical.
- The original accepted focused evidence (`test-evidence/focused/*`,
  `UNPLANNED_PRECHECK_DISCLOSURE.md`, and the accepted focused-rerun set) remains
  IMMUTABLE and unchanged.

## Bounded recovery — seven authorized mutations only
A) restore canonical-watchdog-store.ts; B) restore watchdog-run-store.ts;
C) restore the test import; D) remove reconciliation source via recoverable mv;
E) byte-preserving quarantine destination; F) this disclosure; G) RECOVERY_POST.json.
No test / validator / format / lint / tsc / build / retry / helper; no commit / push /
PR / deploy; no cleanup of the incident-1 accidental artifacts. STOP after
RECOVERY_POST.json for independent shadow review.

---

## Appendix A — durable wrong-root transformed-cache inventory (packet B)

Amended by `SW-CONTROLLER-RECOVERY-EVIDENCE-20260903-B` (documentation-only). This
appendix makes the incident-1 transformed-cache inventory durable rather than merely
"preserved". All values are read-only observations bound to the retained accidental
cache at `/tmp/Dlc1GXz9V0hNmrGQ1rE5x/ssr`. No test result is inferred; the cache is
NOT cleaned. The rotated 975-byte npm debug log could not be hashed (rotated by
ongoing npm activity before capture).

### A.1 — 17 transformed-cache records (full 40-char ids; not abbreviated)
| # | cache id (`.../ssr/<id>`) | source basename | original-source SHA256 | src bytes |
|---|---|---|---|---|
| 1 | `15caf4570d24ff20b52a58b1fa948f8f95a30b1f` | `mcp-message-boundary.vtest.test.ts` | `4d4b2c74d330cfd15167178210029a784907c142d2beb5c17e846f5338970489` | 51275 |
| 2 | `1625ef44f26353837e4d501df889decf2cf173cd` | `accounting.test.ts` | `e20ac3a7730cec52766e933e037eb28371b04f5babdc0a1f6ec6175521e18248` | 59501 |
| 3 | `1b000c475cfc25690bf6689627842dd861a0649c` | `gateway-models.profiles.live.test.ts` | `7abaaf66a80ba9371dc8b8b485a6f8f2cee7f00cc9132d4858d2861a0f8b089a` | 44101 |
| 4 | `368aa4a99eba32238f5140ee8d8752f6a052fa91` | `invoice-related-scope.vtest.test.ts` | `bd5b27492fc8fce075d93a2e5c4e35e3fe3e124f8a10607121c99ef510c4ab4c` | 79217 |
| 5 | `3fa9379aa609a42ffae3a9280077cbf7c605ef4b` | `pkt-02-01-canonical-watchdog-store.test.ts` | `2aee17aedf24650bdc10989dd80a2ca82cecaff6da791314ef60ce0e3af903a8` | 55026 |
| 6 | `4b57036d275ea9c69d838b4066167480308341e6` | `income-child-parent-guard-b2.test.ts` | `a11889685a57755acf06487609245565015f0407e7264a07ead6cffaad291c1d` | 62295 |
| 7 | `540108e5fd23a29a8faa9da0cdd4ac6de3dd5d78` | `weeklyReport.validator.test.ts` | `ff0a6b137ce9a12afc9c9007fd287c10d105fb6fcbc2297b38c61a2a1220ea14` | 45060 |
| 8 | `5addb24538df5e8a32037855ad768367485501d7` | `weeklyReport.content.test.ts` | `5e0f1174a9ffaaab495b0f6ae3b3764ec04f33625b32b04ea29bf9d53d2f17d7` | 54125 |
| 9 | `6fb697218234ab8de55c06ec4658b0a88de1c8d8` | `stripe-webhook.vtest.test.ts` | `1a79050d1f8ccdd9cb526f7e0203c87ce21b65ee1876838e7ed6374ec7fa3e6a` | 52594 |
| 10 | `b31b2fc2a79ee6e5a8e99b1f639584119fd2de03` | `bot.test.ts` | `2cd8eed39f4b6c2952084305e84bd0a06f22bb69d2a5112c2b7f9d76a87c6754` | 89099 |
| 11 | `c6f2844462db0b225d57bc4c54287e5074580a86` | `to-json-schema.test.ts` | `f5c70e5db4f70be9b2fb7a24f54a329b20123fa61d54cdf120e1dc8d0d7af879` | 68174 |
| 12 | `de556c3cc69510e84c3d239feb6894dd717bffe7` | `contact-deal-reliability.vtest.test.ts` | `21258ab6d2074d23eaab2c7b46835b7c021d2340731bc22d2695f75cc1ff5abe` | 141186 |
| 13 | `de7dd77437f4b95a1e82b520a4822251af0d159e` | `accounting.test.ts` | `e20ac3a7730cec52766e933e037eb28371b04f5babdc0a1f6ec6175521e18248` | 59501 |
| 14 | `e5ca864b1147fb85723620c6bbd2ed392c46b2e8` | `string.test.ts` | `19ac9a6b0a7c610038d93dd9f97d453ad3a54bd5e1b1dab99e25d544872d93cd` | 65633 |
| 15 | `f30e0022940eaac7be97bd6d5f2e6b1979e91657` | `monitor.test.ts` | `50713bde647257ffce1d30785b4b6df9707eb6ba700c0b6fe7471649e76b9bab` | 70565 |
| 16 | `f561d671e72983b2e4445da8e168c6879a4414b4` | `invoice-approval-http.vtest.test.ts` | `5b7d6206b321d55882876a844aaa2214c394411714677ad7c37f1c1157b8bded` | 48917 |
| 17 | `fc8dbd0380e0e7ce614e2ae571893a844a945d8b` | `string.test.ts` | `bf41f94cf272b01900fd4cc0086aa6bc276c181ab430c45010c74ce0a7c665e8` | 73515 |

Notes: rows 2 and 13 map to the same source basename `accounting.test.ts` with identical
source SHA256 (`e20ac3a7…`); rows 14 and 17 are both `string.test.ts` but DIFFERENT
source SHA256 (`19ac9a6b…` vs `bf41f94c…`) — distinct files sharing a basename. Row 5 is
this repo's own restored test file (`2aee17ae…`, 55026), independently cross-checked.
All 17 cache ids were confirmed present under `.../ssr` (17/17).

### A.2 — surviving npm cache artifacts (registry GET for `vitest`)
- content-v2 blob:
  `/home/ubuntu/.npm/_cacache/content-v2/sha512/f0/75/f7779300e2c18f63beac18261f65d92bbbfef3a4879dcc92786894f6352c10456636b06a6713be7854c7ae049bf9014c57024f5ababb3fc94cc8fc23d737`
  — SHA256 `906b821012fd54f64db0fc899a00549d531862328787d5c4f40439739a5bb224`;
  1,278,388 bytes; observed mtime `2026-09-03T03:53:15.288173206Z` (verified this pass).
- index-v5 entry:
  `/home/ubuntu/.npm/_cacache/index-v5/2c/63/82205759d5f095b57bf9a97361174cf0b8ef29d9e7c0de9e77ae04cbd1b6`
  — observed SHA256 `8e77601bda2e8cfbbbb61500833dbdadfcdad2855b86fd09a29f5799d7b9794e`;
  2,219 bytes; observed mtime `2026-09-03T03:53:15.292173211Z` (verified this pass);
  final `make-fetch-happen` key `https://registry.npmjs.org/vitest`, time
  `1788407595295`, size `1278388`.
- The 975-byte npm debug log (start `2026-09-03T03:53:14.827Z`) ROTATED before it could
  be hashed — an acknowledged, unrecoverable gap.

### A.3 — retained incident-level facts (exact)
- accidental cache-root creation `2026-09-03T03:53:27.528188923Z`;
- `ssr/` final mtime `2026-09-03T03:53:45.672212090Z`;
- empty `/home/ubuntu/evidence/comprehensive-testing/phase-6/{logs,screenshots}` tree
  `2026-09-03T03:53:45.300211617Z`;
- npm-log start `2026-09-03T03:53:14.827Z`, 975 bytes, rotated before hashing;
- PID chain `1400451 / 1400467 / 1400500 / 1400501`; controller terminated the exact
  chain; all four confirmed absent this pass (`kill -0` → absent);
- zero NEW `_npx` files (the 25 pre-existing `_npx` entries are unrelated) and zero
  `hermes-test-home-*` directories;
- non-filesystem effects (registry traffic, cache mutation, rotated log) remain
  UNRESOLVED; no test result is inferred; it is not claimed that nothing ran/was touched.
