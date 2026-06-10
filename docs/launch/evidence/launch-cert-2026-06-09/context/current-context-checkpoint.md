# Launch Certification Context Checkpoint

Timestamp: 2026-06-09 22:59 ET

## Active Launch State

- Target under test remains `https://studio.huminic.app` only, unless explicitly documenting the new global-admin-route gap involving `live.huminic.app`.
- Tester role: no product/server/source edits; all fixes through Claude in tmux session `huminic` on `oracle`.
- `LC-BLOCKER-001` video has been PASS / RECLASSIFIED after Duane clarified the real requirement. The no-vendor rule applies to dealer/customer-facing text, notifications, emails, widget copy, and install snippets; the grey-label Tavus room URL may show after a shopper chooses Two-Way Video. Claude accepted the wrapper as an over-interpretation, removed `/widget/video-room`, restored the direct room handoff in `f15380955`, ran `716 passed`, and deployed `pz5w7s7doyp40hhrxl7l8k9p`. Independent retest confirms `/api/public/video-session` returns direct `https://tavus.daily.co/...`, dealer JS and Ford entry page scan clean, and old wrapper no longer serves a Tavus iframe.
- Platform 4 phone is now PARTIAL PASS / RECLASSIFIED: Claude validated synthetic Vapi end-of-call webhook events for all six stores. Each created the expected store lead/thread and used the correct email format mapping (Serra sales = ADF/XML; Columbia + Serra Service = readable email). Live conversational phone behavior remains a collaborative walkthrough/ops demo item, not the old "unknown lead path" blocker.
- New hardening finding `LC-MAJOR-012`: `VAPI_WEBHOOK_SECRET` is unset, so the optional `x-vapi-secret` webhook auth check is skipped. This is a fake-lead/spam hardening risk, not observed cross-store data exposure. Needs fix or operator acceptance.
- Partner/group admin remains `LC-MAJOR-007` / OPEN DECISION. Claude confirmed no auth edits were made after Codex interrupted him. Current model is binary: `is_admin:true` global super-admin, `is_customer_admin:true` single-profile Workspace login. Claude recommends Option A for tonight: no auth change, Duane super-admin plus six per-store Workspace logins; scoped partner-admin should be deliberate post-launch work. This recommendation is not yet operator-approved.
- The Codex goal UI may still say "blocked"; treat that as stale bookkeeping. Completion bar now includes independent retest, final collaborative full-Chrome demonstrative eval with Duane, and customer/partner email/manual packet drafting.
- `LC-BLOCKER-008` public sales chat vendor-name bait leak is now PASS after Claude deployed `364bb598c`.
  - Claude root cause: `/api/public/widget-chat` lacked a confidentiality guardrail, so the LLM answered stack questions from widget/SOUL context. Blast radius covered standalone `/w/<slug>`, storefront Web Chat, and dealer-embed Web Chat because they share the public widget-chat handler. Claude also patched `/api/customer/chat` for Workspace staff chat consistency.
  - Claude fix: `VENDOR_GUARDRAIL` prepended first in public and Workspace chat prompts, plus `scrubVendorTerms()` output backstop on Hermes/OpenAI replies before visitor/Teambox display. Tests: targeted dealer-safe test pass, `718 passed`, clean build, deploy `kjz1qopqcrzp72bavz05hiee`.
  - Independent retest: full standalone battery after deploy had no vendor terms in any vendor-bait assistant reply; one transient Serra Honda generic fallback had no vendor terms and did not reproduce. Focused Serra Honda rerun passed. Storefront and dealer-embed Web Chat spot checks passed through the shared `/w/ford-of-columbia-sales-chat` iframe.
  - Public source/bundle spot scan after the fix found no banned terms in fetched `/w/ford-of-columbia-sales-chat` HTML or `/widget/dealer/ford-of-columbia.js`; evidence `p6-post-364bb598c-public-source-vendor-scan.json`.
- `LC-MAJOR-005` lead-email legacy branding is now PASS. Fresh unique-contact retest stamp `20260609-224810` produced Gmail Inbox messages to `duanekwells@gmail.com`: Hyundai plain email footer says `Powered by Huminic`, and Serra Honda ADF sender is `Huminic <leads@huminic.ai>`.
- Legacy note superseded: Phone Platform 4 was previously tracked as `LC-BLOCKER-011` pending live calls. After Duane clarified that webhook triggering/lead creation is the priority, Claude validated the webhook→lead→email chain across all six stores. Live conversation demo still belongs in final walkthrough.
- Root route status rechecked at 19:13 ET: server returns `307` from `https://studio.huminic.app/` to `/dashboard`, and a fresh rendered browser load shows the Huminic Studio sign-in screen, not the chooser. If a browser still shows the chooser at root, treat it as stale browser/session state unless reproduced after hard refresh. The chooser intentionally lives at `/stores`.
- Workspace login URLs remain:
  - `https://studio.huminic.app/p/serra-honda/chat`
  - `https://studio.huminic.app/p/serra-nissan/chat`
  - `https://studio.huminic.app/p/tony-serra-ford/chat`
  - `https://studio.huminic.app/p/hyundai-of-columbia/chat`
  - `https://studio.huminic.app/p/ford-of-columbia/chat`
  - `https://studio.huminic.app/p/serra-service/chat`
- `LC-MINOR-010` Workspace terminology is PASS:
  - Product/runtime copy fixed in `d0d1e4619`; live `/p/<store>` entry pages now say `This is your dealership Workspace. Sign in to manage:`.
  - Independent browser retest on Ford of Columbia confirms the old `customer storefront` phrase is gone and the public widget menu is preserved.
  - Guide wording follow-up committed in `d975cc130`; `/p/<store>` is now described as a Workspace entry that hosts the public Storefront widget, while Storefront remains reserved for shopper-facing widget/embed/standalone surfaces.
- `docs/launch/LAUNCH_REQUIREMENTS_AUDIT.md` now exists and crosswalks every guide platform to current evidence, launch status, and remaining gates.
- `docs/launch/EVIDENCE_INDEX.md` and `docs/launch/LAUNCH_CLOSEOUT_REPORT.md` now have 2026-06-09 addenda at the top pointing readers to the current certification packet and warning that launch is not yet unconditionally certified.
- Remote launch-cert docs/evidence are synced but not committed as of 20:20 ET; local docs have newer 22:59 updates. A safe docs-only commit request exists at `/tmp/claude-commit-launch-cert-docs-request.txt` and in evidence as `claude-commit-launch-cert-docs-request.txt`. Do not use Claude tmux until stale prompt text is cleared; it currently displays an unsent line `Option A for tonight; we'll do partner-admin post-launch.` that Codex did not submit and should not be treated as operator approval.

## Latest Agent Eval Finding

Platform 6 public agent eval battery ran against:

- `https://studio.huminic.app/w/serra-honda-sales-chat`
- `https://studio.huminic.app/w/serra-nissan-sales-chat`
- `https://studio.huminic.app/w/tony-serra-ford-sales-chat`
- `https://studio.huminic.app/w/hyundai-of-columbia-sales-chat`
- `https://studio.huminic.app/w/ford-of-columbia-sales-chat`
- `https://studio.huminic.app/w/serra-service-chat`

Business prompts passed across all six routes: greeting, inventory/service help, and appointment/service intent.

`LC-BLOCKER-008` is closed/PASS. All post-fix vendor-bait assistant replies tested by Codex are vendor-clean.

Original sales replies explicitly named `Vapi`, `Tavus`, and in several cases `TextMagic`, `VinSolutions`, `SignalWire`, and `Resend`. Post-fix replies deflect using Huminic/dealer-safe language and do not repeat those terms in assistant replies.

`LC-OBS-009` is PASS/addressed by the same guardrail plus a local evaluator refinement for curly apostrophes. Unsafe/off-topic prompts produced non-harmful refusals in retest.

Evidence:

- `docs/launch/evidence/launch-cert-2026-06-09/platform6/p6-agent-eval-summary.json`
- Per-store `docs/launch/evidence/launch-cert-2026-06-09/platform6/p6-agent-eval-*.json`
- `docs/launch/evidence/launch-cert-2026-06-09/platform6/p6-agent-eval-retest-post-364bb598c-cert-summary.json`
- `docs/launch/evidence/launch-cert-2026-06-09/platform6/p6-agent-shared-handler-spot-check-post-364bb598c.json`
- `docs/launch/evidence/launch-cert-2026-06-09/platform6/p6-post-364bb598c-public-source-vendor-scan.json`

## Newly Raised Potential Gap

Duane reports a possible missing global/back-end Huminic Studio login:

- `studio.huminic.app` now appears to show the public landing/storefront surface.
- Per-store customer/staff consoles were tested at `/p/<store>/chat`, but this may not be the original global back-end Studio operator console.
- Need determine whether the global Studio login moved to another route/subdomain, still exists but is hidden, or is currently inaccessible after migration.
- If no route exists, likely solution candidate: create/restore a global Studio route such as `live.huminic.app/studio` or another agreed admin route, then update the test guide and launch docs.
- Important model to verify: when a profile user has `is_admin` selected, admin users should enter the global Studio back end; non-admin users should go to the store login/console.

Next actions: inspect deployed route/auth surface, ask Claude for intended access model, document as a finding if unverified/inaccessible, then retest after fix/confirmation.

## Clarification After Initial Probe

This must be handled carefully because the pre-existing global Huminic Studio work predates the dealer SPA/workspace certification and is important.

Terminology decision from Duane:

- **Global Huminic Studio** = central operator/admin backend. This is the important pre-SPA Studio surface and must be preserved. Access requires `is_admin: true`.
- **Workspace** = dealer/staff profile-scoped SPA at `/p/<profile>/*`. Avoid calling this "storefront" because it is not customer-facing. Access requires profile-scoped customer/admin rights.
- **Storefront** = public shopper-facing widget, embed, standalone chat/contact/video surfaces.

Expanded login/ownership model from Duane:

- **Super Admin** = Duane/system-level operator. Should see all partners/groups/profiles/workspaces in Global Huminic Studio.
- **Partner / Group Admin** = a partner account such as Durran Cage / Cage Automotive. Should have a Studio account for that company/group and should see/manage only the profiles/workspaces owned by that partner/group. Launch example: Durran owns the six store accounts and can switch between them.
- **Profile / Store Admin** = a login for a single store profile. It may exist in the Studio auth system, but it must be scoped to that store only. Operationally, stores will use this login for their SPA Workspace at `/p/<profile>/*`.
- Therefore the launch-safe boundary is not just "Global Studio requires is_admin:true" unless `is_admin` already means a scoped Studio role. Profile lists/global APIs must be role-scoped: Super Admin sees all; Partner/Group Admin sees only their group; Profile/Store Admin sees only its own profile or is redirected to its own Workspace, depending on final intended UX.

Current evidence shows the global Studio back end still exists in code and is reachable at direct routes such as `/profiles` and `/dashboard`. It should not be removed, replaced by the store picker, or conflated with `/p/<store>/*`.

The problem appears to be access-boundary and entry-point clarity:

- `https://studio.huminic.app/` now serves the store picker, while older docs say Studio admin login is at the bare Studio URL.
- Direct protected routes like `/profiles` render the global Studio login.
- Documented admin credential `duane / HuminicValidation2026!` works and returns `is_admin: true`.
- Store customer-admin credential `serra-honda` also reaches the global Studio shell and `/api/profiles/list` returns 200, which is a launch-blocking cross-surface/data exposure.

Updated root-domain decision from Duane:

- `https://studio.huminic.app/` should be the Global Huminic Studio login/backend entry, not the store chooser.
- Root entrypoint is now fixed and verified after Claude deployed `3cf693685`: `https://studio.huminic.app/` returns 307 to `/dashboard`, browser shows Huminic Studio password screen, and the store chooser is no longer visible at root.
- Fallback Global Studio entry remains `https://studio.huminic.app/dashboard`.
- Optional store chooser is preserved at `https://studio.huminic.app/stores`.
- Workspace login URLs:
  - `https://studio.huminic.app/p/serra-honda/chat`
  - `https://studio.huminic.app/p/serra-nissan/chat`
  - `https://studio.huminic.app/p/tony-serra-ford/chat`
  - `https://studio.huminic.app/p/hyundai-of-columbia/chat`
  - `https://studio.huminic.app/p/ford-of-columbia/chat`
  - `https://studio.huminic.app/p/serra-service/chat`

Desired fix shape should preserve the existing global Studio work and restrict it to `is_admin: true` users only, while keeping Workspace users confined to `/p/<profile>/*` and profile-scoped APIs. The final public/customer entrypoint (`live.huminic.app`, `/studio`, portal host, or another route) needs an explicit product decision and docs update after the auth boundary is fixed.

Claude has been handed LC-BLOCKER-006 plus the terminology model. His initial assessment agreed with a narrow fix pattern: Workspace APIs are already profile-scoped, while global operator routes/APIs broadly use authenticated-session checks and should be gated by `isAdmin`. Before accepting that as final, validate whether the existing architecture has, or needs, a Partner/Group Admin ownership scope; otherwise a blunt `isAdmin` gate could accidentally collapse partner-admin behavior or over-grant group admins.

Current role/ownership assessment:

- Claude found the live model is binary today, not three-tier.
- `duane/huminic` is the only `is_admin:true` super-admin account and has system-wide/global access.
- The six launch store accounts are `is_customer_admin:true`, `is_admin:false`, and are now verified confined to their own Workspace. Store session gets 401 on `/api/profiles/list` and 200 on own Workspace messaging API.
- There is no existing Partner/Group Admin tier, ownership field, `scope_profiles`, or Durran partner login.
- Launch decision remains open as `LC-MAJOR-007`: Option A is launch with the six per-store Workspace logins and track partner RBAC post-launch; Option B is build scoped Partner/Admin RBAC before launch. Do not provision Durran as `is_admin:true` unless scoped RBAC exists.
