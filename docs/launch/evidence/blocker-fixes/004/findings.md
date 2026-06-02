# GAP-VER-004 — /agents shows only 8 built-ins — fix

## Verifier finding
`/agents` listed only the 8 built-in stock agents (Roger/Sally/Bill/Ada/Max/
Luna/Kai/Nova). No profile-distributed SOULs (`<profile>/SOUL.md`,
`<profile>/governance/agents/*.md`) and no custom agents surfaced.

## Root cause
`/api/agents` returned `listAgents()` = built-ins + custom only. Nothing ever
read the profile SOULs off `~/.hermes/profiles/`.

## Fix
- `src/server/agent-definitions-store.ts`: new `getProfileSoulAgents()` walks
  every `~/.hermes/profiles/<profile>/` for `SOUL.md` + `governance/agents/*.md`.
  Handles SOULs **with or without** YAML frontmatter (production profile
  SOUL.md files are bare markdown — name derived from the first `# heading`).
  Entries are `source: 'profile'`, `isBuiltIn: true` (read-only in the library).
- `src/types/agent.ts`: added optional `source` ('builtin'|'custom'|'profile')
  and `profile` fields. Back-compat: inferred from `isBuiltIn` when absent.
- `src/routes/api/agents/index.ts`: GET now returns
  `[...listAgents(), ...getProfileSoulAgents()]` (filesystem read guarded).
  `listAgents()` itself is unchanged, so the crews endpoint is unaffected.
- `src/screens/agents/agent-library-screen.tsx`: counts, filter chips, and the
  per-row badge are now source-aware (built-in / profile / custom). Profile
  agents are read-only (no edit/delete; Duplicate only).

## Verification
- `src/test/profile-soul-agents.test.ts` (5 tests): frontmatter SOUL, bare SOUL
  (first-heading name), governance/agents enumeration, source/read-only invariant.
- Live headed pass (local build, two seeded local SOULs): `/api/agents` returns
  `{builtin: 8, profile: 2}`; the page shows **"8 built-in · 2 profile · 0
  custom"**, a `profile` filter, the two profile SOULs with `profile` badges and
  correct roles/tags, and NO edit/delete on profile rows. Screenshot:
  `agents-with-profile-souls.png`.
- vitest 530 pass; Playwright workflows 16 pass / 49 fixme / 0 fail.

## Production note
Reflects only after a Coolify redeploy (operator-only). On the production
volume the profile SOUL.md files are bare markdown; the 7 new governor SOULs
are not on the volume yet (that is GAP-SG-001 — see deploy-phase8-souls.sh).
PROC-011 is PENDING-COOLIFY-REDEPLOY.
