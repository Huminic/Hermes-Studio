# GAP-VER-007 — scripts/ not in the deployed image — fix

## Verifier finding
The production studio image's `/app/` contains only `dist/`, `node_modules/`,
`package.json`, `server-entry.js`. `/app/scripts/` does NOT exist, so the
documented `... tsx scripts/<file>.ts` workarounds (PROC-020 provision,
PROC-022 create-user, PROC-103 idempotency) fail at the `scripts/` lookup.

Two additional doc defects surfaced in the same area:
- The manuals used `pnpm tsx`, but the runtime image has **no global pnpm**.
- The manuals named the `hermes-agent-...` container, but the studio app and
  its TS scripts run in `hermes-studio-...`. The agent container has no node
  and ships unrelated Python scripts.

## Fix
1. `Dockerfile` runner stage: `COPY --from=builder /app/scripts ./scripts`,
   `COPY --from=builder /app/src ./src`, `COPY --from=builder /app/tsconfig.json`.
   `src/` is REQUIRED, not optional: copying `scripts/` alone is a false fix —
   the first build of just `scripts/` reproduced
   `ERR_MODULE_NOT_FOUND: /app/src/server/password-hash imported from
   /app/scripts/create-user.ts`. Five scripts import from `../src/...`
   (create-user, provision-launch-profiles, provision-brain,
   run-tranche-g-evals, run-cedar-ridge-engagement); tsx compiles those .ts
   modules on the fly. tsconfig.json lets tsx resolve `@/` aliases. The runner
   already has `node` + `npx` + `node_modules/.bin/tsx`; pnpm is intentionally
   NOT added (keeps the runtime image lean).
2. Manuals + test scripts updated so the workarounds actually run:
   - `pnpm tsx scripts/...` → `npx tsx scripts/...`
   - `hermes-agent-...` → `hermes-studio-...` for every studio-script / volume
     command.
   Files: docs/launch/manuals/studio-admin-guide.md,
   docs/launch/manuals/consulting-human-operator-guide.md,
   docs/launch/PROCEDURAL_TEST_SCRIPT.md, docs/launch/HUMAN_TESTING_SCRIPT.md.

## Verification
- `docker build` of the studio image succeeds (`Successfully built`).
- The built runner image contains `/app/scripts` (17 scripts; see
  image-scripts-listing.txt) + `/app/src` + `/app/tsconfig.json`.
- Scripts RUN inside the image via `npx tsx` (no pnpm):
  - `npx tsx scripts/create-user.ts` → prints usage, exit 0.
  - `npx tsx scripts/provision-launch-profiles.ts` → "provision-launch-profiles
    starting ... specs = 7" (resolves its `../src` imports — no
    ERR_MODULE_NOT_FOUND).
- DID NOT push or trigger a Coolify redeploy (operator-only per DECISIONS.log
  DEC phase-8-branch-not-main).

## Production status
PROC-020 / PROC-022 / PROC-103 are **PENDING-COOLIFY-REDEPLOY**: the running
production image predates this Dockerfile change, so `/app/scripts` will only
appear after the operator rebuilds + redeploys the studio image.
