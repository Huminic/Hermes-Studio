# M1R/M2R Gate 0 Preflight — HOLD

Date: 2026-08-30 EDT  
Controller: Codex task `01a00d84-9bd9-7860-98e9-1ac94d34cd1d`  
Independent reviewer: read-only Shadow Auditor  
Directive: `docs/halo/M1R_M2R_CONTROL_DIRECTIVE.md`

## Decision

**HOLD. Gate 0 did not pass and no downstream gate is authorized.** The independent shadow inspection found concurrent writer-capable processes and live sessions on governed repositories and analytics paths. Claude Code was instructed to stop before completing its preflight and acknowledged the HOLD. No backup, code edit, Git ref change, data promotion, VinSolutions access/schedule change, production access, Service workspace work, alert, or external send occurred.

## Planned versus actual

- Planned: establish a fresh read-only baseline and prove with two independent deltas that inspection caused no change and no concurrent writer existed.
- Actual: the shadow's independent inspection found active writer and shared-repository risks. The directive's immediate stop condition fired before Gate 0 completion.

## Proof Delta A — scope/state finding

Read-only process/session inspection identified:

- PID `2134376`, `dry-run-watch.sh`, cwd `/home/ubuntu/hs-ingest-dev`: active writer by design; polls approximately every 20 seconds, appends its log at startup and when it finds a new or updated manifest requiring reconciliation, and may then write run/readback artifacts.
- PID `3623548`, `node server-entry.js`, cwd `/home/ubuntu/hs-watchdog`: writer-capable and holding writable SQLite/WAL/SHM handles for the three Sales rooftops' `/srv/ingest-dev/analytics/*/messaging-hub.db` files.
- PIDs `170942` (Vite) and `171013` (esbuild), cwd `/home/ubuntu/hs-ingest-dev`: children of the existing `huminic-studio` Claude session; passive-looking file watchers but not proven non-writers.
- PID `703597`, `node server-entry.js` on the ingest-dev tree: request-triggered writer-capable; ownership not proved.
- PID `2333349`, pty helper/interactive shell, cwd `/home/ubuntu/hs-watchdog`: unknown interactive writer-capable process.
- tmux `vin-report-repair`, PID `2275091`: detached and idle at a prompt but shares the same common Git directory and previously performed edits.
- tmux `huminic-studio`, PID `1188579`: the intended Claude partner, but retaining an old `/goal active (9d)` indicator, scheduled-task lock, background wait shells, and Vite child.
- PID `3688853`: second live Claude process through mosh in the base `huminic-studio` repository; owner and current activity unresolved.
- No Git `*.lock` files were observed. Their absence does not negate active writer or shared-ref risk.

## Proof Delta B — independent outcome/control finding

Independent sources corroborated the stop condition: source-code inspection of `dry-run-watch.sh` proved designed write behavior; `lsof` file-descriptor modes proved writable database/WAL handles; `git rev-parse --git-common-dir` plus the worktree inventory proved shared-Git coupling; and the separately captured `vin-report-repair` tmux buffer showed that session idle at a prompt after earlier edits. A current read-only Git status for that repair worktree was clean on `fix/vinsolutions-report-window-provenance`, tracking `origin/main` and reported ahead 3/behind 3. It was not executing a visible command but remained writer-capable. Claude's acknowledgement is recorded as a control response, not outcome validation.

Gate 0's complete no-change Proof Delta B was never completed because the HOLD fired. That is the correct result: the available independent corroboration proves the stop condition, not a Gate 0 pass.

## Service/Parts and production safety

- No Service or Parts workspace, data, schedule, or plumbing was accessed or changed.
- No production target was accessed or changed.
- No VinSolutions browser or schedule was accessed or changed.
- No CRM/customer object was accessed or changed. No customer, dealer, email, or other external-system message was sent or changed. Local control instructions were sent to Claude Code.

## Narrowest safe remediation requiring Duane approval

1. Preserve relevant tmux buffers, exact process/session state, target branches/HEADs, full dirty/untracked inventories and hashes, shared-worktree inventory, and relevant ledger metadata.
2. Gracefully quiesce only the identified development watcher/server processes and idle repair session; do not use blanket kills and do not touch production.
3. Identify and freeze the second Claude process; stop if ownership cannot be proved.
4. Resolve the stale Claude goal, scheduled-task lock, and background-shell state through the owning Claude or supported control path; do not manually delete `.claude/scheduled_tasks.lock`.
5. Re-run Gate 0 from a clean controller context with fresh, distinct Proof Deltas A and B.
6. After Gate 0 passes, perform Git-changing work from a dedicated independent clone with a separate Git directory/object store, not another shared worktree.

No remediation has been executed. Duane approval is required before controlled process/session quiescence.

## Next action and owner

- Owner for authorization: Duane.
- Required decision: approve or deny the narrowly controlled development-session quiescence above.
- Controller action after approval: capture buffers, classify targets one last time, gracefully quiesce only approved dev targets, and re-run Gate 0. If approval is denied, the full M1R/M2R readiness objective cannot pass while these writers remain active.
