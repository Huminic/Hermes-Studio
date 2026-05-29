# Customer Provisioning Recipe

End-to-end steps for standing up a NEW customer on the existing Huminic Studio + Hermes deployment. This is the recipe Cedar Ridge follows in V5; it should work for any future customer the same way.

**Assumption:** Studio + Hermes are already running at `studio.huminic.app` per the V0 baseline. You are provisioning a new customer profile alongside `huminic`, `serra-automotive`, `strukture`.

## 1. Decide the profile id

Convention: lowercase, hyphen-separated, matches business name. Examples:
- Customer name "Cedar Ridge Automotive Group" → profile id `cedar-ridge-automotive`
- Customer name "Serra Automotive" → profile id `serra-automotive`
- Customer name "Strukture" → profile id `strukture`

Reserve also `<profile-id>-data-governor` (the unified KSG+DSG companion profile).

## 2. Create the profile directories on the production volume

The production volume is `nh5vnz9kz226cj9ib3nodg1j_hermes-state`, mounted at `/root/.hermes` inside the agent container. Profile dirs live under `/root/.hermes/profiles/`.

```bash
PROFILE="cedar-ridge-automotive"
GOVERNOR="${PROFILE}-data-governor"
AGENT_CONTAINER=$(docker ps --format '{{.Names}}' | grep '^hermes-agent-' | head -1)

docker exec "$AGENT_CONTAINER" sh -c "
  mkdir -p /root/.hermes/profiles/${PROFILE}/{governance,canon,data,knowledge/{inbox,drafts,published,reports/specs,reports/published,templates,workflows,widgets,dashboards},templates,vocabulary,archive,skills,cron}
  mkdir -p /root/.hermes/profiles/${GOVERNOR}/{governance,knowledge/inbox}
"
```

## 3. Drop the distribution scaffold

Copy the standard scaffold from the implementation package. The bootstrap script handles this; for a single new customer, do it manually:

```bash
SCAFFOLD="/home/ubuntu/Claude-store/huminic-studio/docs/consulting_package/Hermes_Cursor_Implementation_Package/scaffold/profiles"

# Customer profile — copy the org template (use huminic as the template since it is canonical)
for f in distribution.yaml SOUL.md config.yaml mcp.json .env.example; do
  docker cp "${SCAFFOLD}/huminic/${f}" "${AGENT_CONTAINER}:/root/.hermes/profiles/${PROFILE}/${f}"
done

# Data-governor profile — same shape, slimmer SOUL
for f in distribution.yaml SOUL.md config.yaml mcp.json .env.example; do
  docker cp "${SCAFFOLD}/huminic-data-governor/${f}" "${AGENT_CONTAINER}:/root/.hermes/profiles/${GOVERNOR}/${f}"
done

# Customize: edit SOUL.md, config.yaml, mcp.json to reflect the new customer's name
docker exec "$AGENT_CONTAINER" sh -c "
  cd /root/.hermes/profiles/${PROFILE}
  sed -i 's/huminic/${PROFILE}/g' SOUL.md config.yaml mcp.json
"
docker exec "$AGENT_CONTAINER" sh -c "
  cd /root/.hermes/profiles/${GOVERNOR}
  sed -i 's/huminic/${PROFILE}/g; s/huminic-data-governor/${GOVERNOR}/g' SOUL.md config.yaml mcp.json
"
```

## 4. Initialize git in the customer profile (for wiki history)

```bash
docker exec "$AGENT_CONTAINER" sh -c "
  cd /root/.hermes/profiles/${PROFILE}
  git init -q && git add -A && git -c user.name=hermes -c user.email=hermes@local commit -q -m 'initial profile scaffold'
"
```

## 5. Seed engagement-state.yaml

Per the schema in `src/lib/engagement-state.ts`:

```bash
docker exec "$AGENT_CONTAINER" sh -c "cat > /root/.hermes/profiles/${PROFILE}/engagement-state.yaml" <<'YAML'
schema_version: 1
customer: cedar-ridge-automotive
current_stage: draft
build_time_crew:
  - role: consultative-architect
    profile: consultative-agent
  - role: audit-supporter
    profile: consultative-agent
run_time_crew:
  - role: consultative-architect
    profile: consultative-agent
  - role: knowledge-semantic-guardian
    profile: cedar-ridge-automotive-data-governor
  - role: data-semantic-guardian
    profile: cedar-ridge-automotive-data-governor
readiness_gates:
  ready_to_blueprint: { status: pending }
  ready_to_instantiate_runtime: { status: pending }
  ready_to_publish_mcp_projections: { status: pending }
  ready_to_hand_off_externally: { status: pending }
  topology_decided: { status: pending }
deployment_notes: []
open_decisions: []
adjacent_data_neighbors: []
stage_history: []
YAML
```

(The agent will overwrite this file as it progresses through orient → audit → … → ready_to_run.)

## 6. Verify

```bash
# Studio sees the new customer
curl -s -b /tmp/auth-cookie.txt https://studio.huminic.app/api/engagements | python3 -m json.tool

# Profile is selectable
curl -s -b /tmp/auth-cookie.txt https://studio.huminic.app/api/profiles/list | python3 -c "import sys,json; print([p['name'] for p in json.load(sys.stdin)['profiles']])"

# Engagement state parses cleanly
docker exec "$AGENT_CONTAINER" cat /root/.hermes/profiles/cedar-ridge-automotive/engagement-state.yaml | head -5
```

Expected:
- `/api/engagements` lists the new customer at `current_stage: draft`
- `/api/profiles/list` includes both the customer and governor profile

## 7. Optionally provision a profile user

For login as a customer admin (separate from the global operator):

```bash
docker cp /home/ubuntu/Claude-store/huminic-studio/scripts/create-user.ts "$AGENT_CONTAINER":/tmp/create-user.ts
docker exec "$AGENT_CONTAINER" sh -c "
  cd /tmp && pnpm tsx /tmp/create-user.ts --profile cedar-ridge-automotive --username cedar-admin
"
# follow password prompts; auth.yaml written with 0600 perms
```

Or, to bypass the prompt (for fixtures only), generate the hash on the host and `docker cp` the auth.yaml directly (see `docs/v0-validation-runbook.md` for the one-liner).

## 8. Dispatch the consultative agent against the new customer

This is V4 of the validation phase. From the operator (or from Studio's chat UI):

1. Switch active profile to `consultative-agent` via `/profiles` screen or `POST /api/profiles/activate`
2. Open a new chat session — name it `<profile>-orient-YYYY-MM-DD`
3. Use the initial prompt template in `~/.hermes/profiles/consultative-agent/HAND_OFF_OPERATOR_GUIDE.md` Step 3
4. Track readiness gate approvals in `engagement-state.yaml` (the agent updates the file; the operator confirms via /engagements UI)

## 9. After ready_to_run

The build-time crew is dissolved. The run-time crew (consultative + KSG + DSG + customer runtime workers) takes over. At that point:

- Provision per-profile MCP tokens (Vapi, Tavus, VinSolutions) per `docs/system-services-resend.md`
- Wire customer-facing routes via the customer-console plugin (already installed; new customer inherits the route shells)
- If the customer needs a customer-facing console with custom branding, drop a `studio.yaml` in their profile dir per the plugin manifest schema

---

## Defaults a new customer inherits

- The customer-console plugin (installed once at the studio-plugins level; serves every customer)
- The 4-tab console shell (Chat, Dashboard, Widget, Service) at `/console/<profile>/*` — stubs until the renderers are wired in Phase 5 v2
- The engagement-tracker UI at `/engagements/<profile>`
- The unified KSG+DSG governance pattern (one governor profile watching the customer's wiki + data)

## What MUST be customized

- SOUL.md (operating identity for the primary org agent)
- config.yaml (model + persona settings)
- mcp.json (per-customer MCP servers — Vapi/Tavus/CRM)
- .env (per-profile secrets — never committed)
- knowledge/widgets/*.md (customer-specific widget definitions)
- knowledge/dashboards/*.md (customer-specific dashboard artifacts)
- studio.yaml (optional — branding, menu visibility, federation read scopes)
