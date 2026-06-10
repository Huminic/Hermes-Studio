# Huminic Studio Launch Status - 2026-06-10

Target under test: `https://studio.huminic.app`

This is not the final certification yet. The app is materially launch-ready across the main surfaces already tested, but final sign-off still requires the live Chrome walkthrough with Duane and resolution or explicit acceptance of the remaining open decisions.

## Current Verified Runtime

- Current verified running image after the latest content sprint:
  `nh5vnz9kz226cj9ib3nodg1j_hermes-studio:29399b7b150fb93e06d07cf175c984cf4e213dc0`
- Correct deployment UUID:
  `t59orjyiqr0zkjeh0384vdg6`
- Running container:
  `hermes-studio-nh5vnz9kz226cj9ib3nodg1j-114305174167`

## What Is Passing

- Global Huminic Studio root:
  `https://studio.huminic.app/` redirects to `/dashboard` and shows the Studio login, not the store chooser.
- Optional store chooser:
  `https://studio.huminic.app/stores`
- Store Workspaces:
  all six Workspaces have passed authenticated tab and workflow checks.
- Public Storefront widgets:
  the five sales Storefronts passed launcher, chat, contact form, callback, and video handoff checks under the clarified video requirement.
- Dealer.com embed:
  the self-hosted one-line install path and verification page passed after retests.
- Standalone widget pages:
  required standalone chat/contact routes passed.
- Lead routing:
  Gmail/Teambox evidence confirms launch leads arrive with Huminic-safe branding.
- Vendor-name hygiene:
  public widget/install JS, chat bait prompts, emails, and Workspace-visible text passed the latest visible-surface checks under the clarified rule.
- Workspace Widget content:
  LC-MAJOR-014 is closed. Form widgets are treated as live, stale coming-soon form copy is cleared, and snippets point at the current Huminic-hosted path.
- Manuals/handoff drift:
  LC-MAJOR-013 is closed. The stale "Data disabled" and old six-page IA claims were removed from the migration guide after Claude's fix and Codex retest.
- Workflow dry run:
  latest direct Node dry run passed with no issues in the evidence file:
  `work/launch-cert/evidence/workflow-dry-run/launch-workflow-dry-run-20260610115538.json`

## Still Open Before Final Certification

1. Voice webhook hardening:
   LC-MAJOR-012 remains open. The Studio server route has the shared-secret gate ready, but the deployed secret is unset. Live voice provider wiring and secret-header behavior are unverified without provider access or a live demo. Duane must either accept this as a monitored launch risk or hold for the coordinated fix.
2. Phone/live voice demo:
   webhook-to-lead/email mapping is verified across six stores using synthetic events, but live provider wiring and conversational behavior still need a short demo or Duane acceptance of the current evidence for launch.
3. Partner/group admin:
   current live model is super-admin plus one-store Workspace logins. Scoped partner/group admin is not implemented yet. Do not make Durran a super-admin. Launch fallback is six store Workspace logins unless Duane requires scoped partner admin before launch.
4. Sales campaign wording:
   the migration guide now says service campaigns are launch scope and sales campaigns are not. Duane should confirm that this matches the promise being made.
5. Final Chrome walkthrough:
   Duane and Codex still need to walk through the product together before this goal can be marked complete.

## Safe Login URLs

- Global Huminic Studio:
  `https://studio.huminic.app/`
- Global Studio fallback:
  `https://studio.huminic.app/dashboard`
- Store chooser:
  `https://studio.huminic.app/stores`
- Serra Honda Workspace:
  `https://studio.huminic.app/p/serra-honda/chat`
- Serra Nissan Workspace:
  `https://studio.huminic.app/p/serra-nissan/chat`
- Tony Serra Ford Workspace:
  `https://studio.huminic.app/p/tony-serra-ford/chat`
- Hyundai of Columbia Workspace:
  `https://studio.huminic.app/p/hyundai-of-columbia/chat`
- Ford of Columbia Workspace:
  `https://studio.huminic.app/p/ford-of-columbia/chat`
- Serra Service Workspace:
  `https://studio.huminic.app/p/serra-service/chat`

## Current Certification Stance

No known unresolved blocker remains in the already-tested public widget, Dealer.com embed, Workspace, Global Studio boundary, lead email, Teambox, or visible vendor-name surfaces.

The remaining items are launch gates and decisions: voice webhook hardening, phone demo/acceptance, partner-admin timing, sales-campaign scope wording, and the final live walkthrough.
