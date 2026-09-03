# Item 12 — stale fixture-DB reconciliation (READ-ONLY; no deletion this pass)

Every `~/.hermes/profiles/*/brain/brain.db` inspected READ-ONLY via
`sqlite3 "file:<db>?mode=ro"` (never `openBrain`, so no migration/write side effect).
NOTHING deleted or altered. Cleanup, if any, is deferred to a separately reasoned,
recoverable action — never an implicit test side effect.

## Full inventory (15 DBs)
| profile | max_migration | v5 checksum | size | mtime (UTC) | class |
|---|---|---|---|---|---|
| difix | 5 | 9c9c4ce890dea7e1 | 544768 | 2026-09-02T23:25:57Z | test-fixture |
| lsdfix-none | 5 | 9c9c4ce890dea7e1 | 544768 | 2026-09-02T23:24:53Z | test-fixture |
| lsdfix-none2 | 5 | 9c9c4ce890dea7e1 | 544768 | 2026-09-02T23:24:53Z | test-fixture |
| missfix | 5 | 9c9c4ce890dea7e1 | 552960 | 2026-09-02T23:24:52Z | test-fixture |
| missfix2 | 5 | 9c9c4ce890dea7e1 | 552960 | 2026-09-02T23:24:52Z | test-fixture |
| spfix-none | 5 | 9c9c4ce890dea7e1 | 544768 | 2026-09-02T23:24:53Z | test-fixture |
| sptfix-none | 5 | 9c9c4ce890dea7e1 | 544768 | 2026-09-02T23:24:52Z | test-fixture |
| test | 5 | 9c9c4ce890dea7e1 | 552960 | 2026-09-02T23:25:46Z | test-fixture |
| serra-honda | 4 | none | 446464 | 2026-07-21T05:54:55Z | real-profile |
| serra-nissan | 4 | none | 405504 | 2026-07-21T05:53:06Z | real-profile |
| serra-service | 4 | none | 360448 | 2026-06-16T18:50:04Z | real-profile |
| ford-of-columbia | 4 | none | 360448 | 2026-06-16T18:50:04Z | real-profile |
| tony-serra-ford | 4 | none | 405504 | 2026-07-21T05:53:06Z | real-profile |
| huminic | 4 | none | 352256 | 2026-06-05T04:51:50Z | real-profile |
| hyundai-of-columbia | 4 | none | 360448 | 2026-06-16T18:50:04Z | real-profile |

(sha256 first-12 per DB captured in the run receipt; omitted here for brevity.)

## The eight reported stale fixture DBs — assessment
Profiles: `difix, lsdfix-none, lsdfix-none2, missfix, missfix2, spfix-none,
sptfix-none, test`.

Evidence they are test-generated (NOT real/production), converging:
1. **Names** are test tokens (di/lsd/miss/sp/spt "fix", "none", "test"), not dealer
   identities. No real rooftop is named `difix`/`missfix2`/`test`.
2. **Migration state**: all at max_migration=5 with the canonical migration-5 checksum
   `9c9c4ce890dea7e1`. Only code paths exercising migration 5 (the canonical §7 tests)
   produce this; the 7 real profiles are still at migration 4 (v5=none), i.e. never
   migrated by product code.
3. **Timestamps** cluster tightly on 2026-09-02T23:24–23:25Z — the canonical-store
   test-development window — not the June/July mtimes of the real profiles.
4. Sizes (~544–553 KB) are uniform and match a freshly-migrated empty canonical Brain,
   not an accreted real dealer Brain.

**Could any of the eight be non-test?** No plausible path: a real profile would carry a
dealer name and predate the canonical work at migration 4. All eight fail every
real-profile signal. Confidence: high that all eight are test residue.

## Provenance (honest)
These eight are residue from a PRIOR session whose full-regression run executed BEFORE
the `src/test/setup-brain-tmp.ts` HOME→/tmp redirect existed, so those tests wrote to
the default `os.homedir()/.hermes` path. The redirect now in place prevents recurrence.

## This session did NOT touch them
All three focused runs this session (2026-09-03T03:15/03:27/03:44Z) ran under
`setup-brain-tmp` (HOME→fresh /tmp). The eight fixtures retain 2026-09-02 mtimes, byte
sizes, and checksums — proving zero writes to `~/.hermes` from this session.

## Disposition
- No deletion / no cleanup performed this pass (per instruction).
- The 7 real profiles (migration 4) are OUT OF SCOPE and untouched.
- Recommended (separate, reasoned, recoverable) follow-up: relocate or archive the 8
  test-residue DBs with a backup, executed as its own action — not as a test side
  effect. Deferred; not part of this corrective commit.
