# Huminic Studio Launch Decision Packet

Generated: 2026-06-09 20:13 ET  
Target: `https://studio.huminic.app`  
Current verified runtime: `f15380955` on `feat/nexxus-comms-engine`

## Current Certification State

### Verified Passes

- **Global Huminic Studio root**: `https://studio.huminic.app/` now redirects to `/dashboard` and renders the Huminic Studio password screen. The old store chooser no longer appears at root.
- **Optional store chooser**: preserved at `https://studio.huminic.app/stores`.
- **Workspace login URLs**:
  - `https://studio.huminic.app/p/serra-honda/chat`
  - `https://studio.huminic.app/p/serra-nissan/chat`
  - `https://studio.huminic.app/p/tony-serra-ford/chat`
  - `https://studio.huminic.app/p/hyundai-of-columbia/chat`
  - `https://studio.huminic.app/p/ford-of-columbia/chat`
  - `https://studio.huminic.app/p/serra-service/chat`
- **Global Studio / Workspace auth boundary**: store Workspace session gets `401` on global `/api/profiles/list`, `200` on own Workspace messaging API; super-admin session gets `200` on global profiles API.
- **Store Workspaces**: all six authenticated store consoles passed full Chrome sweep across Agents, Knowledge, Widgets, Data, Teambox, Campaigns, and Notifications.
- **Lead email routing and branding**: fresh Gmail retest stamp `20260609-224810` passed. Hyundai plain email says `Powered by Huminic`; Serra Honda ADF sender is `Huminic <leads@huminic.ai>`.
- **Standalone widget pages**: required standalone chat/contact routes passed, with `serra-service-service` accepted as a non-blocking nonexistent alias.
- **Dealer embed non-video**: all five sales stores passed launcher/chat/contact/callback. Embed control accessibility issue fixed.
- **Business agent prompts**: greeting, inventory/service help, and appointment/service intent passed across the six public standalone chat routes.
- **Public agent vendor-name bait guardrail**: LC-BLOCKER-008 is now PASS after commit `364bb598c`. Public standalone chat retest, focused Serra Honda rerun, and storefront/dealer-embed Web Chat spot checks returned Huminic/dealer-safe replies with no vendor terms.
- **Workspace terminology**: LC-MINOR-010 is PASS. `/p/<store>` entry copy now says `This is your dealership Workspace. Sign in to manage:`, the old customer-storefront wording is gone, the public widget remains available on the page, and the launch guide now distinguishes `/p/<store>` as a Workspace entry hosting the public Storefront widget.
- **Two-Way Video requirement realignment**: LC-BLOCKER-001 is PASS / RECLASSIFIED after operator clarification. The self-hosted widget/dropdown and install JS must be vendor-clean; the grey-label Tavus room URL is allowed after the shopper chooses Video. Claude removed the unnecessary same-origin wrapper in `f15380955`; independent API/source retest and browser click smoke confirm direct room URL handoff, no old wrapper frame, and no banned vendor terms in visible widget/page text.
- **Phone webhook lead chain**: LC-BLOCKER-011 is PARTIAL PASS / RECLASSIFIED. Claude validated synthetic Vapi end-of-call webhook events across all six stores; each created the expected store lead/thread and used the correct email format mapping. Live conversational call behavior remains a final demo/ops check.
- **Requirements audit**: `docs/launch/LAUNCH_REQUIREMENTS_AUDIT.md` crosswalks every guide platform to current evidence and remaining launch impact.

## Open Launch Gates

### 1. LC-MAJOR-012 — Voice Webhook Shared Secret

Current verified state:

- `VAPI_WEBHOOK_SECRET` is unset, so the optional `x-vapi-secret` check is skipped.
- The webhook lead path works, but unauthenticated webhook acceptance could allow fake/spam voice leads if the endpoint is discovered.

Why it matters:

- This is a launch-hardening/security item, not a lead-loss defect and not cross-store data exposure in current evidence.

Decision made (2026-06-10):

- **DEFERRED TO POST-LAUNCH**: Setting `VAPI_WEBHOOK_SECRET` requires coordination with the voice provider to ensure they send the matching `x-vapi-secret` header. This coordination is not safe to perform tonight without verification testing.
- **Accepted temporary risk**: Voice webhook endpoint accepts unauthenticated posts. Mitigation: endpoint URLs are not publicly advertised; webhook processing validates store profile existence; lead creation follows normal CommsGate and notification rules.
- **Follow-up owner**: Operator
- **Follow-up timeline**: Within 48 hours post-launch
- **Verification path**: Set `VAPI_WEBHOOK_SECRET` in Coolify env, coordinate with voice provider to add header, test synthetic webhook with correct and incorrect secrets, verify proper authentication enforcement.

### 2. Platform 4 — Live Phone Conversation Demo

Webhook→lead→email mapping is verified for all six stores. What remains is a live conversational spot check or approved agent-call-agent demonstration during the collaborative eval.

Phone numbers to test:

| Store | Number | Expected Assistant |
|---|---:|---|
| Serra Honda | `+19012038267` | Serra Honda sales AI / Caroline |
| Serra Service | `+19014361271` | Serra Service AI / Nancy |
| Serra Nissan | `+12568623318` | Serra Nissan sales AI / Caroline |
| Tony Serra Ford | `+12564599707` | Tony Serra Ford sales AI / Caroline |
| Hyundai of Columbia | `+19012039398` | Hyundai of Columbia sales AI / Caroline |
| Ford of Columbia | `+19313692815` | Ford of Columbia sales AI / Caroline |

Demo pass criteria:

- Correct store/assistant answers.
- Short coherent conversation succeeds.
- Matching lead/email/Teambox behavior is either observed live or correlated against the already-verified webhook mapping.
- No vendor/technical leakage.

Decision needed:

- Run the live/agent-call-agent demo during final walkthrough, or explicitly accept webhook validation as sufficient for tonight.

### 3. LC-MAJOR-007 — Partner / Group Admin Tier

Current model:

- Binary auth model only:
  - `is_admin:true`: super-admin, all profiles and system ops. Current live super-admin is `duane/huminic`.
  - `is_customer_admin:true`: one profile Workspace only. The six launch store logins use this model.
- No current partner/group admin role, ownership field, `scope_profiles`, or Durran/Cage login exists.

Current recommendation:

- **Option A for tonight**: no auth changes; Duane remains super-admin; stores use their six per-store Workspace logins; Durran can use the six Workspace logins for launch operations. Track scoped partner-admin as immediate post-launch work.
- **Option B before launch**: add `scope_profiles`/partner RBAC before launch. Claude says this is feasible but moderate risk because it touches auth session shape and multiple profile gates.

Critical guardrail:

- Do not provision Durran or any store/partner as `is_admin:true` unless scoped RBAC exists, because today that grants super-admin/system-wide access.

## Certification Conclusion

The app is materially closer to launch after the verified fixes. It is **not yet a clean final launch pass** because:

1. `LC-MAJOR-012` voice webhook shared-secret hardening needs fix or acceptance.
2. Live phone conversation behavior should be demonstrated or explicitly accepted based on the verified webhook path.
3. Partner/group admin needs an operator decision; Claude recommends Option A for tonight.
4. Final collaborative Chrome walkthrough with Duane is required before marking the certification complete.
