# Halo Reports — Strategy, Milestones & Permanent Boundaries

**Status:** Authoritative planning direction (Duane-confirmed, 2026-08-28, America/New_York). Recorded for the
Claude-owned Studio project. **Per Duane's 2026-08-29 authorization, M2–M4 may proceed in ISOLATED / DEV
planning and implementation**, under the separately-gated boundaries below (see `docs/halo/MILESTONES.md`).
Still separately gated (NOT covered by this authorization): production deployment, customer outbound,
autonomous actions, channel activation, ad-account mutation, and any Service/Parts commingling.

## What Halo is
Halo Reports is a diagnostic "report card" — a useful loss-leader and a backbone of business
development. Purpose: give **Durran** a diagnostic asset for coaching calls, expose missed
opportunities, and support sales of Huminic agents, workspaces, social, advertising, SEO, and
related services.

## Two categories

### 1) Halo Data — the governed Semantic Watchdog Metrics Catalog as a dealership-wide report card
For each **usable** catalog metric, show **three distinct comparison layers when supportable**:
1. **Industry reference** — definition-compatible, cited; never invented.
2. **Dealer historical baseline** — this dealer's own trend.
3. **Current dealer performance** — the current governed value.

Plus: **mine available conversation history for systemic weaknesses** (evidence-backed, with
explicit limitations — never fabricated). The same metric layer feeds **internal notifications**
and, **separately governed**, external automations/actions.

Non-negotiable data rules (carried from the platform): tenant isolation, lineage/provenance,
governed periods, correct units, **missing-not-zero**, and explicit **withheld/unavailable**
states rather than fabricated numbers or benchmarks.

### 2) Halo Presence — later loss-leader visibility report card
Paid advertising (where access exists), organic social, AI presence, SEO presence, and other
**approved** visibility channels — compared to industry and dealer baselines. Defined/piloted in M3.

## Milestones
- **M1 — CURRENT & AUTHORIZED (isolated dev only).** Verify supported catalog metrics process
  correctly at **both Codex QC and Studio** for **Serra Honda, Serra Nissan, Tony Serra Ford**.
  Preserve **Sales-only**, tenant isolation, lineage, periods, units, missing-not-zero and withheld
  states. Represent the **industry / dealer / current** comparison layers **without inventing
  benchmarks**. Surface **evidence-backed conversation weaknesses with limitations**. Prove **one
  internal threshold alert** plus **explicitly allowlisted external test channels** with
  **receipts/idempotency**. **No customer outbound or autonomous action.**
- **M2 — AUTHORIZED (isolated/dev planning + implementation, 2026-08-29).** Build and independently verify
  the Halo Data report card for all three Serra stores with an AI narrative. Production deploy / customer
  outbound / autonomous action remain separately gated.
- **M3 — AUTHORIZED (isolated/dev, 2026-08-29).** Define and validate Halo Presence (advertising where
  accessible, organic social, AI presence, SEO). Ad-account mutation remains separately gated.
- **M4 — AUTHORIZED to prepare + verify (isolated/dev, 2026-08-29).** Prepare the governed monthly
  Data+Presence circuit; the production monthly run stays separately gated.

See `docs/halo/MILESTONES.md` for the authoritative execution roadmap.

## Permanent boundary — SALES ONLY
Service and Parts stay in the **separate combined Serra Service workspace** and **never** enter
these three Sales profiles (serra-honda, serra-nissan, tony-serra-ford). This boundary is permanent
and applies to every Halo layer, metric, notification, and automation.

## Guardrails restated
Isolated dev only for M1. No customer outbound, no autonomous action, no deploy/merge/schedule/
service change, no dealer-data mutation. External sends only via explicitly allowlisted test
channels with durable receipts + idempotency (see the watchdog self-test contract).
