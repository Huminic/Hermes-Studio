# M1R/M2R Gate 1 — Recovery Package PASS

Date: 2026-08-30 EDT  
Controller: Codex  
Bounded implementer: Claude Code in `huminic-studio`  
Independent auditor: Shadow (`/root/shadow_auditor`)  
Result: **PASS**

## Bounded objective

Preserve the exact unpushed ingest commit `4c41df11dc48c3bc954ffdd45cdf125b2d67c2d5` from `/home/ubuntu/hs-ingest-dev` branch `dev/ingest-endpoint` as independently recoverable Andromeda, GitHub, and Mac evidence without modifying the original shared Git store, its dirty worktree, production, VinSolutions, or any Service/Parts domain.

## Planned versus actual

The allowed recovery writes all occurred:

1. Claude created and verified an Andromeda Git bundle.
2. Claude created an independent Andromeda clone with its own Git directory and object store.
3. Claude pushed a non-force GitHub backup branch and lightweight tag at the exact target commit.
4. Codex copied the unchanged bundle to the Mac evidence directory and verified its exact byte size and SHA-256.

No source-repository, application-data, production, browser, VinSolutions, scheduling, CRM, messaging, Service, or Parts write occurred.

## Control events and deviations

Claude's raw closing report said there were no deviations. That statement is superseded by this controller checkpoint.

Two pre-write HOLD events occurred:

1. Claude initially substituted three incorrect digest algorithms for the controller-specified preflight commands.
2. A later shell wrapper collapsed the `$d` variable and did not produce the required proof.

Shadow and Codex stopped execution before any recovery write, rejected both outputs, and required the exact commands against literal absolute paths. The corrected preflight matched the preserved baselines; no rebaseline occurred. These events demonstrate the gate controls worked and are part of the permanent evidence.

## Proof delta A — scope and state

### Recovery artifacts

- Andromeda bundle: `/tmp/m1r-gate1-recovery-20260830/dev-ingest-endpoint.bundle`
- Mac bundle: `/Users/duanewells/Documents/Cheif of Staff/Halo Reports/Hermes-Studio/docs/halo/evidence/m1r/recovery/dev-ingest-endpoint-4c41df11.bundle`
- Exact bundle size at both locations: `227155661 bytes`
- Exact bundle SHA-256 at both locations: `1a517285105af558bee81edb0c23ff01874bee1d27c335ba58afca29e394e3d3`
- The Mac bundle is intentionally untracked controller-transfer evidence. At 227,155,661 bytes it exceeds GitHub's normal 100 MB object limit and must not be staged or committed without a separately approved LFS/artifact route.
- Independent Andromeda clone: `/home/ubuntu/hs-m1r-isolated-20260830`
- GitHub branch: `backup/m1r-ingest-endpoint-20260830`
- GitHub tag: `m1r-ingest-endpoint-4c41df11-20260830`

### Original shared repository equality

The following values matched before and after recovery work:

- HEAD: `4c41df11dc48c3bc954ffdd45cdf125b2d67c2d5`
- Branch: `dev/ingest-endpoint`
- Status digest: `7c88f42043894ca259e881926b9afc97b10a62f5aadaae336c63bf99451356da`
- Binary diff digest: `d941627463357544baca9c40abad872b286f580fd9c5aa1da0d81c9d6de9a8b8`
- Changed/untracked-content digest: `864b5f87315ba9cac8c72d2aea2e35a3d15e74bbfcdc00522cfc80af5ba155d4`
- Worktree-list digest: `7630595e85d5585d12d1f53e44a32ec1d8d7ea8911f4a0b5dfe30aab9d3492b6`
- Shared-ref digest: `ba9a1052a7632820df1f853d572b4065f0aecb21d0e77287762809162a0a8090`
- Dirty `src/routeTree.gen.ts` digest: `1d724ea940fa6286055294946f801fcf342a8b1611bf5be0cd50919a2af37623`
- Git lock: absent before and after.

This proves the recovery refs were created only through the independent clone and did not mutate the original shared repository.

### Concurrent-writer state

There was no executable concurrent writer during Gate 1. The approved Gate 0 process groups that remained in `T` (SIGSTOP) state were PGIDs `2134376`, `703597`, and `3623548` (including stopped child `2333349`), separate bash `2333351`, and the separately preserved unknown Claude group `3688853` including its Playwright descendants. PGIDs `170942`, `303337`, and `361054` had already exited during the orderly stale-Claude session replacement before Gate 1 began; they were absent, not frozen. The exact preservation context is recorded in `GATE0_PREFLIGHT_PASS_2026-08-30.md`.

Any `SIGCONT`, new writer, changed shared digest, or Git lock would have invalidated this gate and required a new preflight. None occurred.

## Proof delta B — independent outcome validation

Shadow independently verified:

- `git bundle verify` passed and reported a complete history.
- The bundle head resolves to the exact target commit.
- The independent clone passed `git fsck` and `git cat-file` checks.
- The clone has no alternates and no shared `commondir`.
- Clone pack and index link counts are `1`.
- Bundle inode `2176788` and clone-pack inode `2623105` are distinct, closing the hardlink/shared-object-store risk.
- Independent `git ls-remote` checks resolve both the GitHub branch and tag to `4c41df11dc48c3bc954ffdd45cdf125b2d67c2d5`.
- The original shared-repository hashes and refs remained unchanged.
- Frozen process groups remained stable.
- The Mac bundle matches Andromeda at exactly `227155661 bytes` and SHA-256 `1a517285105af558bee81edb0c23ff01874bee1d27c335ba58afca29e394e3d3`.
- No Gate 2, production, Service, or Parts work occurred.

## Safety and unresolved state

- Sales-only boundary preserved.
- Service and Parts remained outside this work.
- No production deploy, live alert, customer/CRM mutation, VinSolutions change, schedule change, external message, or email occurred.
- The original shared worktree remains dirty exactly as found and is not the execution workspace for the next gate.
- The frozen groups remain a temporary isolation control. They must not be resumed or replaced without a fresh writer audit and an explicitly bounded decision.

## Next bounded action

Gate 2 may begin in the independent clone only: build the three-store report-family/metric/source-of-truth matrix from current governed evidence, explicitly separating scheduled native XLSX data, browser-only data, derived calculations, missing fields, and Service/Parts exclusions. No reader implementation or data mutation is authorized merely by this checkpoint.
