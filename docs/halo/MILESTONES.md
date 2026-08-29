# Halo — Execution Roadmap (Authoritative)

**Authorization:** Duane authorized (2026-08-29, America/New_York) continuation through the Halo
milestones after the M1 backup. **M2–M4 may proceed in ISOLATED / DEV planning and implementation**
under the separately-gated boundaries in this document. This is the authoritative execution roadmap;
strategy + scope live in `docs/halo/HALO_STRATEGY.md`, and the M1 acceptance record in
`docs/halo/M1_VALIDATION_MATRIX.md`.

## Permanent boundary + separately-gated actions (apply to ALL milestones)
- **SALES ONLY.** Service and Parts belong **only** to the separate combined **Serra Service workspace**
  and **never** enter the three Sales profiles (serra-honda, serra-nissan, tony-serra-ford). No commingling.
- The following remain **SEPARATELY GATED** (NOT covered by the 2026-08-29 dev authorization):
  **production deployment**, **customer outbound**, **autonomous actions**, **channel activation**
  (SMS/voice/video/live email beyond allowlisted test), **ad-account mutation**, and any
  **Service/Parts commingling**. Each requires its own explicit authorization at the point of use.

---

## M1 — Halo Data support subset — **CLOSED (isolated dev)**
- **Scope accepted:** supported = `gross.total_sum` + the four `appt.*` rates (native, provenance-backed)
  + the three hub `engagement.*` (withheld when 0 source threads). **Explicitly withheld** with reasons +
  295 anchors: ROI (`roi.total_leads`/`roi.sold_from_leads`/`roi.duplicate_rate`),
  `gross.reconciliation_mismatches`, `cage.*` (Enterprise Performance/CAGE), `comm.*` (Vin Sales
  Communication Log). Missing≠zero; three-layer evaluator with **non-scoring** industry and
  `insufficient_history`/`zero_variance` baselines.
- **Independent sign-off:** Codex QC ↔ Studio ACCEPTED (2026-08-28) — 15 focused files / 98 tests passed;
  three profiles read (Honda gross 12240.78 + four appt rates w/ accepted checksums/period; Nissan gross
  5263.6 only; Ford empty/withheld).
- **Backup commit:** `b920a89e312aaa8ea4ae4b28233f39086b3e3afa` on `feat/watchdog-dashboard`.

## M2 — Three-store Halo Data report cards + AI narrative — **AUTHORIZED (isolated/dev)**
- **Build & independently verify** a Halo Data report card for **each** of the three Serra Sales stores,
  presenting per supported metric:
  1. **Industry reference** — sourced, **definition-compatible** (source URL + type + confidence +
     source_published_or_updated + our verified_on); non-scoring where no compatible standard exists.
  2. **Dealer historical baseline** — the dealer's own trend (`insufficient_history` until ≥3 governed
     periods; `zero_variance` when identical).
  3. **Current result** — the governed current value.
  4. **Coverage / withheld states** — explicit supported / no-current-data / withheld with reasons.
  5. **AI narrative** — grounded, verify-first, evidence-backed; never fabricated numbers/benchmarks.
- Preserve Sales-only, tenant isolation, lineage, periods, units, missing≠zero. Independent Codex QC.
- **Out of M2 (still gated):** production deploy, customer outbound, autonomous action.

## M3 — Halo Presence definition + validation — **AUTHORIZED (isolated/dev)**
- **Define and validate** Halo Presence across, where access exists: **paid advertising**, **organic
  social**, **AI presence**, and **SEO presence** — compared to industry and dealer baselines, with the
  same sourced/definition-compatible + withheld-state discipline as Halo Data.
- Advertising and any account access are **read/plan only** in dev; **ad-account mutation stays separately
  gated**. Independent verification of definitions, coverage, and limitations.

## M4 — Governed monthly Data+Presence circuit — **AUTHORIZED to PREPARE + VERIFY (isolated/dev)**
- **Prepare and verify** the governed **monthly** circuit that assembles Data + Presence report cards for
  the three Serra Sales stores end-to-end in dev (schedule design, idempotency, receipts, coverage).
- **The production monthly run — deployment, scheduling, and any customer-facing delivery — remains
  SEPARATELY GATED** and requires explicit authorization before it executes against production.

---

**Status:** M1 CLOSED (backed up). M2–M4 authorized for isolated/dev planning + implementation under the
gates above. No production deploy, customer outbound, autonomous action, channel activation, ad-account
mutation, or Service/Parts commingling without separate authorization.
