# Watchdog-Platform Execution Charter (guardrails)

Purpose: keep autonomous / looped execution on the goal — no drift, no rabbit holes,
no silent stalls. This is the control the operator asked for (2026-08-26).

## North star (the goal)
Ship the customer-facing dashboard from the IDEA-DOSSIER spec (15 sections, tentative-
voice epistemics, per-store Serra accents), the **metric-driven alert wizard** (create
internal alerts from dashboard metrics via a modal), and a **custom-report CLI** that
audits a dealership's metrics against best practices — then a full **regression +
Playwright headed pass + Codex co-test** before anything ships. Tracked as tasks
#172–#180. Authoritative spec: `uploads/serra-dashboard/IDEA-DOSSIER.md`; metric shapes
from the ingest contract (`SCHEMA_CONTRACT.md`).

## Execution rules (anti-drift)
1. **One task at a time.** Work the single in-progress task to DONE or STOP — never
   start a second in-progress task.
2. **DONE gate.** A slice is done only when: tests green + `tsc` clean on touched files
   + the task tracker updated + a plain-language report. No "done" on partial/red work.
3. **Scope lock.** Each task names the files it may touch. Needing to change something
   outside that set → STOP, record it as a new task, do not chase it inline.
4. **No rabbit holes.** Discoveries become new tasks, not detours. Max 2 attempts to get
   a slice green; if still red, STOP and report the blocker with options.
5. **Every turn ends explicitly** — either a verified slice + report, or a STOP with a
   blocker. Never a vague "continuing" that implies autonomy I don't have across turns.
6. **Gated actions need operator GO:** merge, push, deploy, prod, real customer sends.
7. **Honesty:** real data or an explicit "needs data" gap — never a fabricated number.

## Delegation rules (sub-agents)
- Delegate **rote / repetitive / read-only / isolated-file** work to named agents the
  operator can watch in the visor. The agent gets a single-purpose SoW with explicit
  outputs and a "do not touch shared files" constraint; it reports back; I integrate +
  independently verify.
- **I keep the hard, shared-state work** (the cockpit view model, `cockpit.css`,
  `DashboardLanding`, and anything interdependent) to avoid merge conflicts and keep
  fidelity.
- Roles: **researcher** (best-practices research, read-only) · **report-cli** (custom-
  report CLI, isolated files) · **pdf** (PDF export, isolated) · **reviewer** (adversarial
  independent verification, read-only). Spawned when their phase arrives, not all at once.

## Loop
Operator invokes `/loop` to enable self-continue on a cadence. Each loop iteration = one
bounded task worked to the DONE gate + report; the task tracker is the state of record.
