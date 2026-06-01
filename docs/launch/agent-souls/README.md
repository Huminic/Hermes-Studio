# Agent SOUL stubs — Phase 8 launch closeout

**Purpose.** Author the ~17 (actually 21) agent SOUL stubs called out in `docs/launch/PLAN.md` Phase 8 step (d). These SOULs live in the repo for review + audit; the canonical runtime location is the production volume `~/.hermes/profiles/<slug>/governance/agents/`.

**Deployment.** Use the helper script `scripts/deploy-phase8-souls.sh` (to be authored as part of step e/f, or by hand via `docker cp`) to push each SOUL to its target path on the production volume. The path-mapping table is at the bottom of this README.

**Closes (at SOUL-identity level):**
- `GAP-PROV-001` — Provisioner agent identity (the *building* of the agent is post-launch; the SOUL stub names the role).
- `GAP-SG-001` — 7 missing `<slug>-data-governor` SOULs (huminic-motors, serra-honda, serra-nissan, serra-service, tony-serra-ford, ford-of-columbia, hyundai-of-columbia).

**Does NOT close:**
- Building the Provisioner executor.
- Wiring the integrity-scanner half of the KSG (`GAP-KSG-SCANNER-001` — still post-launch).
- Enabling any per-dealer template — every template ships `enabled: false`.

---

## File map

### Provisioner (1)

| File | Target path on production volume |
|---|---|
| `huminic/provisioner.md` | `~/.hermes/profiles/huminic/governance/agents/provisioner.md` |

### Governor SOULs (7 — closes GAP-SG-001 at SOUL level)

Each per-customer governor inherits the unified KSG+DSG pattern from the existing `huminic-data-governor/SOUL.md`. Watch paths point into the customer's profile.

| File | Target path on production volume |
|---|---|
| `governors/huminic-motors-data-governor.md` | `~/.hermes/profiles/huminic-motors-data-governor/SOUL.md` |
| `governors/serra-honda-data-governor.md` | `~/.hermes/profiles/serra-honda-data-governor/SOUL.md` |
| `governors/serra-nissan-data-governor.md` | `~/.hermes/profiles/serra-nissan-data-governor/SOUL.md` |
| `governors/serra-service-data-governor.md` | `~/.hermes/profiles/serra-service-data-governor/SOUL.md` |
| `governors/tony-serra-ford-data-governor.md` | `~/.hermes/profiles/tony-serra-ford-data-governor/SOUL.md` |
| `governors/ford-of-columbia-data-governor.md` | `~/.hermes/profiles/ford-of-columbia-data-governor/SOUL.md` |
| `governors/hyundai-of-columbia-data-governor.md` | `~/.hermes/profiles/hyundai-of-columbia-data-governor/SOUL.md` |

Note: each governor profile must also exist as a directory on the production volume before its SOUL.md can land. If any of these 7 governor profile directories do not exist yet, that is an additional gap (`GAP-SG-PROFILE-DIR-001`) — flagged during deployment, not blocking authoring.

### Per-dealer agent templates (13)

These live in `huminic/governance/agents/templates/` so per-dealer instances can be copied + customized when each dealer is enabled. Every template ships `enabled: false`.

| File | Target path on production volume |
|---|---|
| `templates/elliott.md` | `~/.hermes/profiles/huminic/governance/agents/templates/elliott.md` |
| `templates/caroline.md` | `~/.hermes/profiles/huminic/governance/agents/templates/caroline.md` |
| `templates/lead-follow-up.md` | `~/.hermes/profiles/huminic/governance/agents/templates/lead-follow-up.md` |
| `templates/lead-response.md` | `~/.hermes/profiles/huminic/governance/agents/templates/lead-response.md` |
| `templates/service.md` | `~/.hermes/profiles/huminic/governance/agents/templates/service.md` |
| `templates/crm-data-guru.md` | `~/.hermes/profiles/huminic/governance/agents/templates/crm-data-guru.md` |
| `templates/sales-coach.md` | `~/.hermes/profiles/huminic/governance/agents/templates/sales-coach.md` |
| `templates/communication-writer.md` | `~/.hermes/profiles/huminic/governance/agents/templates/communication-writer.md` |
| `templates/photo-studio.md` | `~/.hermes/profiles/huminic/governance/agents/templates/photo-studio.md` |
| `templates/video-producer.md` | `~/.hermes/profiles/huminic/governance/agents/templates/video-producer.md` |
| `templates/copywriter.md` | `~/.hermes/profiles/huminic/governance/agents/templates/copywriter.md` |
| `templates/market-intel.md` | `~/.hermes/profiles/huminic/governance/agents/templates/market-intel.md` |
| `templates/creative-director.md` | `~/.hermes/profiles/huminic/governance/agents/templates/creative-director.md` |

---

## SOUL frontmatter contract

Each SOUL uses this frontmatter shape:

```yaml
---
id: <slug>
role: <one-line role description>
channels: [<channel1>, <channel2>, ...]
scope_contract: <path to scope contract page>
workflow: <path to workflow page>
kanban_lane: <lane name>
enabled: <true | false>
status: <stub | live>
---
```

Body: a Mermaid sequence diagram + prose describing what the agent does + what wiki pages it reads at runtime.
