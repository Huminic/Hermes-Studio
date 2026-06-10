# Current Runtime Regression Sweep - d975cc130 branch head

Timestamp: 2026-06-09 20:10 ET
Target: `https://studio.huminic.app`

## Checks

- Root entry: `https://studio.huminic.app/` returned `307` to `/dashboard`; rendered source contains the Huminic Studio password screen.
- Store chooser: `https://studio.huminic.app/stores` remains available and lists the six store Workspace sign-ins.
- Workspace entry: `https://studio.huminic.app/p/ford-of-columbia?lc_regression=d975cc130` contains `This is your dealership Workspace. Sign in to manage:` and the widget launcher.
- Public source vendor scan: root HTML, `/stores` HTML, Ford Workspace entry HTML, five `/widget/dealer/<store>.js` scripts, and six standalone chat HTML pages scanned clean for banned vendor terms.

## Evidence Files

- `security/root-headers-post-d975cc130.txt`
- `security/root-body-post-d975cc130.txt`
- `security/stores-headers-post-d975cc130.txt`
- `security/stores-body-post-d975cc130.txt`
- `platform6/ford-entry-headers-post-d975cc130.txt`
- `platform6/ford-entry-body-post-d975cc130.txt`
- `current-regression-d975cc130/dealer-*.js`
- `current-regression-d975cc130/w-*.html`

## Result

PASS for the checked public/root/Workspace regression surfaces. No new regression finding opened.

Known exception remains `LC-BLOCKER-001`: the public `/widget/video-room?c=...` wrapper source still exposes `https://tavus.daily.co/...` and is tracked separately.
