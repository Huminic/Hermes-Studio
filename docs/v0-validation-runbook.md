# V0 Validation Runbook

Steps run by the verification agent once Coolify deployment `hlhck98zviy7mqxnax5e0elz` reports `finished`. Output recorded in `docs/test-cases-log.md` under the V0 section.

## V0.3 — Playwright login + new routes reachable

### Pre-step — create a profile user (so we can exercise profile-auth, not legacy)

Inside the agent container (where `/root/.hermes` is the live volume):

```bash
docker exec hermes-agent-nh5vnz9kz226cj9ib3nodg1j-084604266840 sh -c \
  "cd /tmp/Hermes_Cursor_Implementation_Package && \
   echo -e 'HuminicValidation2026!\nHuminicValidation2026!' | \
   pnpm tsx /app/scripts/create-user.ts --profile huminic --username duane --admin --force"
```

Note: the scripts/create-user.ts file is installed in the container at `/app/scripts/create-user.ts` because Studio's repo is mounted in the container build. If not present at that path, copy it via `docker cp` first.

Verify:
```bash
docker exec hermes-agent-nh5vnz9kz226cj9ib3nodg1j-084604266840 cat /root/.hermes/profiles/huminic/auth.yaml
```

### Playwright steps

1. browser_navigate https://studio.huminic.app
2. browser_snapshot → expect login form (profile_auth_mode: true)
3. browser_fill_form: username=duane, password=HuminicValidation2026!
4. browser_click submit
5. browser_wait_for { text: "Chat" } or similar nav element
6. browser_snapshot → expect sidebar with Engagements link visible
7. browser_navigate https://studio.huminic.app/engagements
8. browser_snapshot → expect 3 customer cards (huminic, serra-automotive, strukture)
9. browser_navigate https://studio.huminic.app/profiles
10. browser_snapshot → expect 7 profiles listed
11. browser_navigate https://studio.huminic.app/agents
12. browser_snapshot → expect agents screen loads
13. browser_take_screenshot full-page → save as evidence

Pass criteria:
- Login succeeds with profile credentials (not legacy HERMES_PASSWORD)
- All 3 admin routes load without errors
- /engagements shows 3 cards

## V0.4 — API smoke tests against live build

Run from a session with the auth cookie obtained from V0.3 step 4 (or via API):

```bash
# Get session cookie via API (alternative to UI login)
TOKEN=$(curl -s -X POST https://studio.huminic.app/api/auth -H "Content-Type: application/json" \
  -d '{"username":"duane","password":"HuminicValidation2026!"}' -c /tmp/auth.txt | jq -r .ok)

curl -s -b /tmp/auth.txt https://studio.huminic.app/api/auth-session | jq .
# Expect: {"authenticated":true,"profile_auth_mode":true,"profile":"huminic","username":"duane","is_admin":true}

curl -s -b /tmp/auth.txt https://studio.huminic.app/api/plugins | jq '.plugins[].id,.issues'
# Expect: "customer-console", []

curl -s -b /tmp/auth.txt https://studio.huminic.app/api/engagements | jq '.customers | length, .customers[].customer'
# Expect: 3, "huminic", "serra-automotive", "strukture"
```

Pass criteria:
- /api/auth-session returns authenticated:true with profile_auth_mode:true
- /api/plugins returns the customer-console plugin with no issues
- /api/engagements returns 3 customers, each with a parsed state object

## Recording

Each step result → `docs/test-cases-log.md` rows V0.3 / V0.4 (PASSING / FAILING with one-line evidence).
Screenshots saved under `docs/v0-evidence/` if needed.
