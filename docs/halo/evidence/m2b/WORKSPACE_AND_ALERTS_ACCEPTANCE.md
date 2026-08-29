# M2B - Workspace verification, inert alerts, and AI-narrative acceptance

Isolated dev only (`127.0.0.1:3730`, `BRAIN_PROFILES_ROOT=/srv/ingest-dev/analytics`). No production, no deploy,
no CRM, no send. Studio owns generation of the three report-card artifacts; Codex owns independent reconciliation,
visual QA, inert UI acceptance, and the three allowlisted emails. Studio sent nothing.

## 1. Independent Codex UI acceptance (recorded)

Dashboard, Issues, Notifications, and Halo routes render for all three governed Sales profiles. The Halo screen
shows the accepted weekly period **2026-08-17..2026-08-23**:

| store | current | evidence |
|-------|---------|----------|
| serra-honda | 5 / 19 | appt 66.7% / 22.2% / 33.3% / 11.1%; gross $12,240.78 |
| serra-nissan | 1 / 19 | gross $5,263.60 |
| tony-serra-ford | 0 / 19 | all measures missing/withheld, explicit (coverage-first) |

Note (Codex): the legacy cockpit landing still shows old AI-action zeros; **Halo is the current
report-derived screen**. That legacy cockpit tile is out of M2B scope.

## 2. Durable TEST inert metric-alert records (created by Codex)

Exactly three durable TEST inert metric-alert records, recipient `duanekwells@gmail.com`:

| store | alert id (prefix) | rule | status | last_fired_at |
|-------|-------------------|------|--------|---------------|
| serra-honda | `f3335cad...` | `appt.show_rate` below 0.6 | active | null |
| serra-nissan | `2c4c760d...` | `gross.total_sum` below 5000 | active | null |
| tony-serra-ford | `7bb16cce...` | `appt.show_rate` baseline below 2 sigma | active | null |

**No send occurred.** Code evidence: `alert-dispatch.ts` defaults to dry-run unless `send: true`; a repository
search found **no runtime/scheduled caller** - only tests and fixtures reference the dispatch path.
`last_fired_at = null` on all three confirms nothing fired.

**Explicitly NOT wired / NOT authorized:** live automatic metric evaluation and alert dispatch are not connected
to any scheduler or runtime caller, and are not authorized. These records exist only to prove the inert
create-alert workflow (recipient + threshold/baseline rule) with dispatch disabled.

## 3. AI-narrative acceptance (offline authoring)

The isolated Studio has **no configured live inference provider**, so live automatic narration is **unconfigured**.
For this TEST milestone the narrative for each store was **authored offline in the Claude Code session**, grounded
only in that store's `buildHaloAiFacts` (no invented facts), and validated through the SAME evidence-constrained
checker (`validateAiNarrative` / `withAiNarration`) via an injected completion labeled **`claude-code-offline`**.

- Result per store: `narrative_mode = ai_grounded`, `narrative_provider = claude-code-offline`,
  `ai_narrative_acceptance = met`. Honda carries 7 validated evidence-referenced claims; Nissan 3; Ford 2
  (coverage-only, no fabricated numbers).
- The report header and body state **"AI-grounded (offline test)"** and note that **live automatic narration
  remains unconfigured**. Nothing is labeled as a live/production provider.
- Exact prompt + facts + authored output + validated claims are preserved per store in
  `docs/halo/evidence/m2b/artifacts/ai-narrative-evidence-<profile>.json`.

## 4. Completed independent QA (Codex)

- **Manifest integrity:** bytes and SHA-256 matched for **all 9 HTML/PDF/JSON artifacts** in the set inspected.
- **Reconciliation:** every metric/provenance/period/citation reconciled - Honda 3184.50 + 9056.28 = 12240.78 and
  rates 12/18 = 66.7%, 4/18 = 22.2%, 6/18 = 33.3%, 2/18 = 11.1%; Nissan -1300.85 + 6564.45 = 5263.60;
  Ford 0/19 explicit missing/withheld.
- **PDF -> PNG visual QA:** all three PDFs open, unencrypted, A4; **22 pages total** (Honda 8, Nissan 7, Ford 7)
  rendered at 120 dpi and visually inspected; **no clipping, overlap, blank pages, box glyphs, or PII**; page
  numbers + running headers/footers present; the Sales-only boundary is explicit on every report.

  *Post-QA metadata fix:* Ford's document/PDF `/Title` was subsequently corrected to drop a trailing hyphen
  (coverage end is null) - a **metadata-only** change; rendered pages and content are unchanged. The three Ford
  artifacts were regenerated (Honda/Nissan byte-identical); current hashes are in `manifest-index.json`. The
  visual-QA outcome above is unaffected by this metadata-only re-render.

## 5. Email delivery - COMPLETED (Codex-owned send)

- The three allowlisted TEST emails to `duanekwells@gmail.com` (one report PDF per store) were **delivered**
  (provider-confirmed) - Serra Honda `4b0f67be-5a08-4d47-91b4-8eeaf8715874`, Serra Nissan
  `337c136a-794e-41a8-887c-af943c4397ad`, Tony Serra Ford `615c5fc5-8852-4223-80f5-48d768d7a514`; sender
  `Huminic Studio <notifications@huminic.ai>`; execution completed 2026-08-29T23:27:23.354Z with errors empty.
  Honda was recovered/verified (not resent); the continuation made exactly two new send calls (Nissan, Ford);
  no other recipient, no retry. Full record: `docs/halo/evidence/m2b/HALO_M2B_EMAIL_DELIVERY.md`.
- **Studio did not send** these emails (Codex-owned step); this doc records the completed delivery only.

## 6. Remaining (separately gated)

- Live automatic narration and live metric evaluation/dispatch remain separately gated and unauthorized here.
- Newer daily files through 2026-08-28 remain quarantined (saved filters positively select Parts/Service); any
  VinSolutions schedule correction awaits separate explicit Duane approval.
