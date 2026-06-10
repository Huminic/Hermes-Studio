# Launch Open Decisions - 2026-06-10

These are the remaining decisions to resolve before final launch certification.

## 1. Voice Webhook Shared Secret

Current truth:

- The voice webhook lead path works.
- Synthetic end-of-call webhook events created the expected lead/thread/email path for all six stores.
- The Studio server has shared-secret protection code ready.
- The deployed shared secret is unset, so protection is not currently active.
- Live voice provider wiring and header behavior are unverified without provider access or a live call/demo.

Decision:

- Fix before launch if Claude can prove both sides of the secret flow safely.
- Or accept as a monitored launch risk and schedule the hardening immediately after launch.

Recommended stance:

- Fix before launch if provider configuration can be verified without risking live voice lead creation.
- Do not force rejection on the server unless the matching provider header is proven.

## 2. Phone Demo Method

Current truth:

- Webhook-to-lead/email mapping is verified across all six stores.
- Live provider wiring and conversational behavior have not yet been demonstrated in the final walkthrough.

Decision:

- Run a short live or agent-call-agent demo in the morning walkthrough.
- Or explicitly accept webhook evidence as enough for tonight.

Recommended stance:

- Do one short live/agent-call demo if available. Use webhook evidence as the primary lead-path proof.

## 3. Partner / Group Admin

Current truth:

- Duane/Huminic is the super-admin.
- Six store accounts are profile-scoped Workspace logins.
- No scoped partner/group admin exists yet.
- Giving Durran `is_admin:true` would make him a super-admin, so that is not acceptable.

Decision:

- Launch with the six store Workspace logins and Duane super-admin access.
- Or hold launch until scoped partner/group admin is built and tested.

Recommended stance:

- Launch with the safe fallback and make scoped partner/group admin the first post-launch platform item, unless Duane decides it is contractual for this launch.

## 4. Campaign Scope

Current truth:

- Campaign draft and audience upload behavior passed the dry run.
- The current migration guide says service campaigns are in launch scope and sales campaigns are not.

Decision:

- Confirm that service-only launch wording is acceptable.
- Or require sales-campaign wording/functionality to be changed before customer handoff.

Recommended stance:

- Do not promise sales campaign launch capability unless Duane confirms it.

## 5. Customer / Partner Email Timing

Current truth:

- Draft emails can be prepared now.
- Emails should not be sent until after the morning Chrome walkthrough and final decisions above.

Decision:

- Send after walkthrough if no new blocker appears.
- Hold if voice hardening, phone demo, or partner-admin scope becomes launch-critical.

Recommended stance:

- Prepare now, send only after walkthrough.
