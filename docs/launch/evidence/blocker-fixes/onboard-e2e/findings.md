# End-to-end onboarding verification (operator's core mandate)

The goal hinges on being able to: create agents, onboard staff, onboard
customers. I verified each as a real workflow, not just a rendering route.

## Create agent — WORKS
POST /api/agents (authenticated session) created "Onboard Test Agent" (201,
source: custom); /agents then showed "8 built-in · 2 profile · 1 custom" with
the agent visible. Full create -> persist -> display loop confirmed.

## Storefront (onboard customers, UX) — WORKS
/p/huminic/knowledge rendered the customer shell with all 6 tabs + the
KSG-gated wiki editor (SOUL.md in tree, canon/governance read-only).

## NEW GAP FOUND + FIXED — provision script ignored --slug (GAP-PROVISION-SLUG-001)
Running the manual's documented command
  npx tsx scripts/provision-launch-profiles.ts --slug <new> --brand ... \
    --accent ... --customer-admin-username ... --customer-admin-password ...
did NOT provision the new customer. The script had a hardcoded 7-profile SPECS
array and main() only read --dry-run/--force; it IGNORED --slug/--brand/
--accent/credentials and re-provisioned the 7 launch profiles instead. So the
documented "onboard a new customer" path was broken — an operator following the
manual would NOT get their customer.

Fix: added a single-customer mode. When --slug is supplied, the script
provisions exactly that one customer from the CLI args with a schema-correct
(P-FIX-003) studio.yaml; without --slug it keeps the 7-profile launch batch.

Verified end-to-end: `--slug onboard-demo --brand "Onboard Demo Motors" ...`
created ONLY onboard-demo (mode=single-customer, specs=1) + a correct
studio.yaml; /p/onboard-demo then rendered "Welcome to Onboard Demo Motors"
(brand from studio.yaml, not the slug fallback).

## Honest residual (operator-gated, not a code gap)
Agent CHAT producing a real AI response needs Hermes inference + a provider key
(OP-002/003/004) — the local backend is portable/partial, so I could not
confirm a live AI reply locally. The chat UI + agent picker render and persist;
the inference round-trip is an operator-credential gate, not a code defect.
