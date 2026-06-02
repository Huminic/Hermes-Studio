# UI audit — surfaces the first login-fix pass missed

After the login fix, an independent skeptical reviewer ("there IS more") found
the SAME bug class (theme-mapped light colors on light surfaces, and an
un-auth-gated global overlay) in surfaces the first pass missed. All confirmed
against src/styles.css (--color-primary-700..950 all map to --theme-text =
near-white in the dark theme) and fixed.

## Fixed
1. **MobileSetupModal.tsx (P1)** — the modal the mobile prompt OPENS used
   `bg-primary-950` (near-white) + `text-white` headings = invisible. The first
   pass gated the prompt's trigger but left the modal washed out. Restyled to a
   consistent dark surface (slate-900/800, slate text, accent buttons).
   VERIFIED LIVE: `?mobile-preview=1` opens a readable dark modal
   (mobile-modal-fixed.png).
2. **onboarding-tour.tsx (P3 overlay)** — OnboardingTour (Joyride) was mounted
   globally and gated only on `localStorage['hermes-configured']`, NOT auth, so
   it could fire over the LOGIN for a previously-configured-but-logged-out
   operator. Added the same `/api/auth-session.authenticated` gate as the mobile
   prompt.
3. **context-alert-modal.tsx (P2)** — "New Chat" CTA was `bg-primary-900`
   (light) + `text-white` = white-on-light. Now `bg-accent-500`.
4. **workspace-skills-screen.tsx (P2)** — 6 literal `bg-white` panels (rest of
   the screen already theme-aware) → `bg-[var(--theme-card)]`.
5. **usage-details-modal.tsx (P2)** — 4 solid `bg-white` rows/tab/button →
   `bg-[var(--theme-card)]` (translucent `bg-white/60-70` elevation panels left
   as-is — readable over the dark modal).

## Reviewer-validated SAFE (no change)
portal-login.tsx, reset.tsx (explicit dark colors); backend-unavailable-state,
provider-select-step, office-view, ui/switch, ui/button (theme-consistent or
intentionally inverted); Toaster/ConnectionStartupScreen (post-auth or
imperative-only).

## Honest residual (documented, not hidden)
The app has a broader theme-token convention (primary-700..950 = light text)
that a few low-traffic post-auth surfaces still lean on with translucent
`bg-white/60-70`. Those are readable (reviewer "tolerable") but a full
theme-consistency sweep of every modal is a separate post-launch polish task,
not a launch blocker. The login + every login-path/overlay surface is fixed.

vitest 530 pass; Playwright 16/49/0.
