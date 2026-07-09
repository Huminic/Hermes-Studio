---
id: serra-honda/dealership/hours-location-contact
title: Serra Honda Hours, Location, and Contact
type: knowledge
status: draft
domain: sales
canonical_name: dealership-hours-location-contact
node_type: knowledge
source_of_truth: operator-verified — see FACT-REQUEST LIST in seed script output
owner: operator
---

# Serra Honda Hours, Location, and Contact

> **STATUS: DRAFT — FACTS PENDING OPERATOR VERIFICATION**
>
> This node contains dealer facts that have NOT been independently verified by the seeding agent.
> Caroline WILL NOT use this node for grounding until an operator promotes it to `status: canonical`
> after verifying every fact below. Until then, all questions about hours, address, phone, and
> directions are routed to a human.

## Facts pending verification (operator must supply and confirm before promoting)

- **Sales department hours:** hours per day of week (Monday through Sunday), including any seasonal or holiday exceptions
- **Service department hours:** opening time, closing time per day
- **Parts department hours:** if different from service
- **Street address:** full address including suite/unit if applicable
- **City, state, ZIP:** confirm current
- **Main sales phone number:** direct line customers should call
- **Sales department email:** if public-facing
- **Directions or landmarks:** any notable cross-streets or landmarks the team uses to guide customers

## Placeholder (DO NOT use for grounding until canonical)

The real facts for this node are pending operator verification. When a customer asks about hours, address, or contact information:
- Caroline must NOT answer from this node while it is in `draft` status.
- Caroline must route to a human: "Let me have a salesperson confirm that for you — they'll have all the details."

## Promote instructions
Once the operator has verified all facts above:
1. Replace each bullet in "Facts pending verification" with the real, confirmed value.
2. Remove this notice block.
3. Run: `pnpm tsx scripts/seed-serra-honda-knowledge.ts --promote company-wiki/dealership/hours-location-contact.md`
