#!/usr/bin/env bash
#
# Provision the 6 existing Nexxus customer profiles into the new
# Huminic Studio system. Idempotent — re-runs only create what's
# missing.
#
# What it creates per customer profile under
# ~/.hermes/profiles/<slug>/:
#   - SOUL.md, persona.md, config.yaml (Hermes basics)
#   - studio.yaml (branding, menu, agent_picker, widgets, lead_notifications)
#   - governance/agents/<id>.md with `enabled: false` for each Nexxus
#     agent so the roster mirrors prod but stays dark for cutover
#   - knowledge/ + governance/ tree shells
#   - engagement-state.yaml seeded at "draft"
#
# Does NOT:
#   - write any .env file with secrets
#   - create auth.yaml (operator runs scripts/create-user.ts after
#     review)
#   - flip enabled: true on any agent
#   - touch the existing Nexxus host
#
# Run inside the hermes-agent container (or against a local HOME
# during dry-run testing):
#   docker exec -i <container> bash < scripts/provision-existing-customers.sh
#
# To dry-run locally:
#   HOME=/tmp/dryrun bash scripts/provision-existing-customers.sh
#
set -euo pipefail

HERMES_DIR="${HOME}/.hermes/profiles"

# Customer roster discovered from Nexxus utilities/elliott-test.ts
# (Nexxus store → Huminic profile slug → primary Vapi agent → phone).
declare -a CUSTOMERS=(
  "serra-honda|Serra Honda|caroline|Caroline|+19012038267|#dc2626"
  "serra-service|Serra Service|nancy|Nancy|+19014361271|#dc2626"
  "serra-nissan|Serra Nissan|magnolia|Magnolia|+12568623318|#dc2626"
  "tony-serra-ford|Tony Serra Ford|georgia|Georgia|+12564599707|#1d4ed8"
  "ford-of-columbia|Ford of Columbia|savannah|Savannah|+19313692815|#1d4ed8"
  "hyundai-of-columbia|Hyundai of Columbia|elizabeth|Elizabeth|+19012039398|#0c4a6e"
)

# Per-dealership named-agent roster from Nexxus agent-instructions.json.
# Each store gets ALL these as disabled SOULs so the cutover preserves
# functional parity in shape.
declare -a NEXXUS_AGENTS=(
  "data-guru|Data Guru|CRM data + pipeline + conversion analytics"
  "sales-coach|Sales Coach|Objection handling + follow-up + closing"
  "communication-writer|Communication Writer|Drafts emails + SMS + sequences"
  "photo-studio|Photo Studio|Vehicle image generation + background swap"
  "video-producer|Video Producer|Promo video + voiceover"
  "copywriter|Copywriter|Conversion-focused ad copy"
  "market-intel|Market Intel|Competitor radar + local market"
  "creative-director|Creative Director|Marketing asset scoring + critique"
)

ensure_dir() {
  local d="$1"
  [ -d "$d" ] || mkdir -p "$d"
}

ensure_file() {
  local f="$1"
  local content="$2"
  if [ ! -f "$f" ]; then
    printf '%s' "$content" > "$f"
    echo "wrote $f"
  fi
}

write_primary_agent_soul() {
  local profile_dir="$1"
  local id="$2"
  local name="$3"
  local store_label="$4"
  local phone="$5"
  local agents_dir="${profile_dir}/governance/agents"
  ensure_dir "$agents_dir"
  local f="${agents_dir}/${id}.md"
  if [ -f "$f" ]; then return; fi
  cat > "$f" <<EOF
---
name: ${name}
type: customer-facing-agent
status: published
enabled: false
nexxus_role: primary-vapi-assistant
vapi_phone: "${phone}"
scope: ${store_label} customer-facing voice and chat
---

# ${name}

Primary customer-facing agent for ${store_label}.

**Cutover status:** mirrored from Nexxus. \`enabled: false\` until the operator
flips. The customer-facing chat picker will not list this agent until
\`enabled: true\` and (optionally) it appears in \`studio.yaml.agent_picker.visible_agents\`.

## Channel personas

When ready: drop chat persona at \`governance/agents/${id}/personas/chat.md\`
and Vapi persona at \`governance/agents/${id}/personas/vapi.md\`.

## Vapi context

- Vapi phone (Nexxus prod): ${phone}
- Vapi assistant id: TODO — fill from Vapi dashboard after cutover
- Webhook to wire after enabling: https://studio.huminic.app/api/webhooks/vapi/$(basename "$profile_dir")
EOF
  echo "wrote $f"
}

write_named_agent_soul() {
  local profile_dir="$1"
  local id="$2"
  local name="$3"
  local scope="$4"
  local store_label="$5"
  local agents_dir="${profile_dir}/governance/agents"
  ensure_dir "$agents_dir"
  local f="${agents_dir}/${id}.md"
  if [ -f "$f" ]; then return; fi
  cat > "$f" <<EOF
---
name: ${name}
type: customer-facing-agent
status: published
enabled: false
nexxus_role: named-agent
scope: ${scope}
---

# ${name}

${scope} for ${store_label}. Mirrored from Nexxus's per-store named-agent roster.

**Cutover status:** \`enabled: false\` until the operator flips. Instructions
will be ported from Nexxus's \`agent-instructions.json\` block when activated.
EOF
  echo "wrote $f"
}

write_studio_yaml() {
  local profile_dir="$1"
  local slug="$2"
  local label="$3"
  local accent="$4"
  local f="${profile_dir}/studio.yaml"
  if [ -f "$f" ]; then return; fi
  cat > "$f" <<EOF
# Studio per-profile config for ${label}.
# Mirror of Nexxus's customer; all agents start enabled:false in their SOUL
# frontmatter so the storefront chat picker is empty until cutover.

branding:
  persona_name: "${label}"
  accent_color: "${accent}"

menu:
  chat: true
  knowledge: true
  tools: true
  data: true
  comms: true
  campaigns: true

agent_picker:
  visible_agents: []  # all enabled agents from governance/agents/*.md

tools_widget:
  show_embed_snippet: true
  show_live_demo: true
  consult: false

widgets: []

autonomous_reply_defaults:
  enabled: false
  business_hours_only: false
  max_agent_turns: 3

federation:
  read_scopes: []

# Where Vapi/ADF-XML inbound leads land via the new system.
# During testing point this at neoweaver@gmail.com; flip to the
# dealership's BDC distribution list after cutover.
lead_notifications:
  adf_email: ""    # operator fills per profile when ready
  sender_name: "${label} new lead"
  resend_token_var: CENTRAL_MCP_TOKEN
EOF
  echo "wrote $f"
}

write_engagement_state() {
  local profile_dir="$1"
  local slug="$2"
  local f="${profile_dir}/engagement-state.yaml"
  if [ -f "$f" ]; then return; fi
  cat > "$f" <<EOF
schema_version: 1
customer: ${slug}
current_stage: draft
stage_entered_at: "2026-05-30T00:00:00Z"
stage_history:
  - stage: draft
    entered_at: "2026-05-30T00:00:00Z"
    exited_at: null
    notes: "Provisioned by provision-existing-customers.sh — Nexxus parity mirror"
    skipped: false
assigned_consultative_agent: consultative-agent
build_time_crew:
  - role: architect
    profile: consultative-agent
run_time_crew:
  - role: architect
    profile: consultative-agent
deployment_notes: []
readiness_gates:
  ready_to_blueprint:
    status: pending
    approved_by: null
    approved_at: null
    notes: ""
  ready_to_instantiate_runtime:
    status: pending
    approved_by: null
    approved_at: null
    notes: ""
  ready_to_publish_mcp_projections:
    status: pending
    approved_by: null
    approved_at: null
    notes: ""
  ready_to_hand_off_externally:
    status: pending
    approved_by: null
    approved_at: null
    notes: ""
  topology_decided:
    status: pending
    approved_by: null
    approved_at: null
    decision: null
open_decisions: []
adjacent_data_neighbors: []
EOF
  echo "wrote $f"
}

write_hermes_basics() {
  local profile_dir="$1"
  local label="$2"
  ensure_file "${profile_dir}/SOUL.md" "# ${label}

Customer-facing profile for ${label}. Storefront chrome is driven by
studio.yaml; per-agent SOULs live under governance/agents/. This file is
the Hermes profile shell.
"
  ensure_file "${profile_dir}/persona.md" "# Persona — ${label}

Load wiki at session start; speak as the ${label} brand.
"
  ensure_file "${profile_dir}/config.yaml" "# Hermes profile config for ${label}.
# Model selection / knobs go here. Real values land at cutover.
model: gpt-4o
"
}

write_wiki_tree() {
  local profile_dir="$1"
  for sub in knowledge/inbox knowledge/drafts knowledge/published knowledge/widgets governance data canon; do
    ensure_dir "${profile_dir}/${sub}"
  done
  ensure_file "${profile_dir}/governance/scope-contract.md" "---
title: Scope Contract
type: governance
status: published
---

# Scope Contract

Inherited from Nexxus parity. Replaced during cutover.
"
}

main() {
  ensure_dir "$HERMES_DIR"
  for row in "${CUSTOMERS[@]}"; do
    IFS='|' read -r slug label primary_id primary_name phone accent <<< "$row"
    profile_dir="${HERMES_DIR}/${slug}"
    echo "--- ${slug} (${label}) ---"
    ensure_dir "$profile_dir"
    write_hermes_basics "$profile_dir" "$label"
    write_studio_yaml "$profile_dir" "$slug" "$label" "$accent"
    write_engagement_state "$profile_dir" "$slug"
    write_wiki_tree "$profile_dir"
    write_primary_agent_soul "$profile_dir" "$primary_id" "$primary_name" "$label" "$phone"
    for agent_row in "${NEXXUS_AGENTS[@]}"; do
      IFS='|' read -r a_id a_name a_scope <<< "$agent_row"
      write_named_agent_soul "$profile_dir" "$a_id" "$a_name" "$a_scope" "$label"
    done
  done
  echo ""
  echo "Done. Next steps:"
  echo "  1. Verify the 6 profile dirs under ${HERMES_DIR}/."
  echo "  2. For each customer: pnpm tsx scripts/create-user.ts --profile <slug> --customer-admin"
  echo "  3. Set lead_notifications.adf_email in each studio.yaml (test → neoweaver@gmail.com)."
  echo "  4. Add Vapi webhook URL https://studio.huminic.app/api/webhooks/vapi/<slug> in Vapi dashboard for the TEST assistant ONLY (do not touch Nexxus-bound assistants)."
  echo "  5. When ready: flip enabled: true on the agent SOULs you want exposed."
}

main "$@"
