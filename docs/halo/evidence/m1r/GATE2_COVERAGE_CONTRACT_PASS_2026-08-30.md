# M1R Gate 2 — Coverage Contract PASS (2026-08-30)

**STATUS: SHADOW PASS — Gate 2 coverage contract RATIFIED. Committed local only (no push). Gate 3 NOT authorized.**

Shadow's independent M1R Gate 2B re-audit returned an explicit **PASS with no material discrepancies**.
This record is committed as the single Gate 2 commit in the isolated clone on branch
`codex/m1r-gate2-coverage-contract` (based on controller checkpoint
`cd33a7858056bc48d9bb1cc437a08d10a53ac922`). No push. No Gate 3 authorization is claimed or implied.

## Shadow independent verdict — two proof deltas
- **Proof Delta A (scope/state):** Shadow independently re-verified that the change set is exactly the nine
  allowlisted paths in the isolated clone; the original `/home/ubuntu/hs-ingest-dev` Gate-1 digests, the
  three Brain DBs, and the frozen/exited writer set are unchanged; the branch is unpushed and the local git
  identity was cleaned.
- **Proof Delta B (outcome/validation):** Shadow independently re-verified the contract content and the
  hardened validator — source SHAs, 295 sequential IDs, seven-/eight-class reconciliation to 295, the exact
  six family policies, the exact 18-cell state map (3/8/7, readiness=false), per-profile Service exclusion,
  the daily first-class clause, and the machine-readable Response Times browser contract — plus the
  `--self-test` mutation-rejection suite. No material discrepancy.

## Author-side self-validation (recorded)
- `node scripts/validate-m1r-coverage-contract.mjs` → **PASS (exit 0)**, read-only.
- `node scripts/validate-m1r-coverage-contract.mjs --self-test` → **PASS (exit 0)** — rejects wrong family
  cadence, swapped cell states, missing Service exclusion, wrong RT host, wrong RT expected-period, daily
  first-class clause weakened (family + top-level), invalid golden state, readiness=true, and overlay
  bad-origin; unmutated control clean.

## Review history (disclosure preserved)
- **HOLD (Shadow):** required a hardened validator before any committed PASS.
- **HOLD 2 (Shadow):** three corrections applied — (1) daily first-class clause
  `No gap may be relabeled current.` encoded exactly in `daily_freshness_policy` and
  `family_policies.sales_comm_log.freshness_policy` and asserted + mutation-tested; (2) Response Times
  `expected_period_policy = "most-recently completed Mon-Sun week"` added, asserted, and mutation-tested;
  (3) isolated-clone local git identity keys removed from `.git/config`.
- **Withdrawn commit:** a prior local commit `b437caba7ac7a08494a3b5eb011c533b3eda40a6` (never pushed) was
  withdrawn via `git reset --soft` under HOLD; it remains recoverable in the reflog. Disclosed, not hidden.
- **Byte-exact source copies:** `GATE2A_COVERAGE_INVENTORY_HOLD_2026-08-30.md` and
  `..._PASS_2026-08-30.md` are byte-exact copies of the operator `/tmp` sources; their two trailing-space
  Markdown hard-line-break lines each are preserved intentionally to keep byte/SHA exactness, so
  `git diff --check` flags whitespace on those two files only (all authored artifacts are diff-clean).
- **Identity cleanup:** this commit uses one-shot `git -c user.name=… -c user.email=… commit`; no local or
  global `[user]` keys persist.

## Disposition
Gate 2 coverage contract ratified and committed local only. **No push. No Gate 3.**
