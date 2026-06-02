# Login UI — washed-out text, light-blue button, overlays popping over the login

Operator report: login text "too bright", button "too light blue", "unless
there is some kind of overlay that's popping up that I don't see." Reproduced
live (HERMES_PASSWORD set → profile-auth login).

## Root causes (3 separate issues, all visible on the login)
1. **Washed-out card** — LoginScreen used theme-mapped `text-primary-900` /
   `bg-accent-500`. In the active DARK theme those invert to LIGHT, so the card
   rendered light text on a white card (washed out) + a faded light-blue button.
   (See login-current.png / login-form.png — the "before".)
2. **Boot splash lingered** over the login during hydration
   (GAP-AUTH-HYDRATION-SPLASH-001) — the `h Huminic / Studio` overlay.
3. **"Set up mobile access" PWA prompt** popped over the login after 45s — it
   was mounted globally with no auth check.

## Fixes
- login-screen.tsx: explicit, theme-independent high-contrast colors
  (slate-900 text, slate-300 inputs, **blue-600** button, gray disabled state),
  dark backdrop so the white card pops. (login-fixed.png / login-enabled.png.)
- login-screen.tsx: call `window.__dismissSplash?.()` on mount so the boot
  splash clears the instant the login renders.
- MobilePromptTrigger.tsx: gate the prompt on `/api/auth-session.authenticated`
  — it only shows once authenticated (in no-auth mode that's true → workspace;
  while the password login shows it's false → suppressed).

## Verification (live, local password-protected build)
- Login card: dark readable headings, visible inputs, saturated-blue enabled
  "Continue", gray disabled "Continue". (login-fixed.png, login-enabled.png)
- After 50s on the login: `{mobilePromptShown:false, loginShown:true,
  splashShown:false}` — no overlay pops over the login.
- vitest 530 pass. PENDING-COOLIFY-REDEPLOY.
