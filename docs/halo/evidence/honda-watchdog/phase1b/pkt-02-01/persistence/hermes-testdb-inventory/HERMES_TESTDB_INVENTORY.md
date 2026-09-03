# ~/.hermes test-DB inventory — control for this packet

## Supersession note (honest timeline)
An earlier draft of this file said a pre-inventory "cannot be produced (already absent)." That is
**superseded and wrong for the current state.** Timeline: the prior session deleted the eight
fixture DBs during checksum-drift recovery; the subsequent full-regression run (that same prior
session, BEFORE any /tmp redirect existed) **recreated** them; the independent audit observed their
later mtimes. They exist now, so a truthful **current** pre-inventory IS producible — and has been
captured and preserved.

## Current pre-inventory (this packet, read-only, preserved)
`HERMES_TESTDB_INVENTORY_PRE.json` records every `~/.hermes/profiles/*/brain/brain.db` with
**path, mtime (iso+ms), size, file sha256, max_migration, v5 checksum, classification**. Eight are
test-fixtures (`difix, lsdfix-none, lsdfix-none2, missfix, missfix2, spfix-none, sptfix-none, test`),
all at `max_migration=5, v5=9c9c4ce890dea7e1`, mtimes 2026-09-02T23:24–23:25Z. Seven are real/other
profiles (`serra-honda, serra-nissan, ford-of-columbia, tony-serra-ford, huminic,
hyundai-of-columbia, serra-service`) at `max_migration=4, v5=null` (untouched by migration 5).

## Control applied this packet
- **No `~/.hermes` DB is deleted or altered** in this packet.
- A durable global test setup (`src/test/setup-brain-tmp.ts`, wired via `vitest.config.ts`
  `setupFiles`) points `HOME`/`USERPROFILE` at a fresh disposable `/tmp` directory per test
  file (NOT `BRAIN_PROFILES_ROOT`, so `vi.spyOn(os,'homedir')` tests keep isolation); the
  default `os.homedir()/.hermes` path therefore resolves under `/tmp` and **no test writes to
  `~/.hermes`**.
- **Post-test proof:** `HERMES_TESTDB_INVENTORY_POST.json` is captured after the full test/regression
  runs; the eight fixture files are verified **byte/mtime/checksum-identical** to the pre-inventory
  and **no new `~/.hermes` test-profile DB** appears (`HERMES_TESTDB_INVENTORY_DIFF.md`).
