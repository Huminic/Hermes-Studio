---
id: serra-honda/sales/inventory-and-pricing
title: Inventory and Pricing Policy
type: knowledge
status: draft
domain: sales
canonical_name: sales-inventory-and-pricing
node_type: knowledge
source_of_truth: operator-verified — see FACT-REQUEST LIST in seed script output
owner: operator
---

# Inventory and Pricing Policy

> **STATUS: DRAFT — FACTS PENDING OPERATOR VERIFICATION**
>
> This node exists to route Caroline correctly when customers ask about inventory or pricing.
> It ships as `draft` because any specific guidance (how to look up inventory, what incentives
> exist, how pricing is structured) constitutes a dealer fact that requires operator verification.
> Caroline WILL NOT use this node for grounding until promoted to `status: canonical`.

## Facts pending verification (operator must supply and confirm before promoting)

- **Live inventory access:** does the sales team use VinSolutions (org `24d64f99-ba04-4b43-af35-fd06f555ac86`) as the authoritative inventory source? Who can a customer be routed to for a live inventory lookup?
- **Pricing policy:** is pricing set at MSRP, below MSRP, or market-adjusted? Are dealer markups applied?
- **Current incentives:** are there manufacturer incentives, financing promos, or lease deals that can be mentioned to customers in general terms? Who owns communicating these?
- **Order/locate policy:** can the dealer place factory orders? Is there a deposit requirement? Who handles locate requests?
- **Pre-owned pricing:** what is the policy on certified pre-owned pricing — fixed, negotiated, or internet price? Who quotes it?

## Placeholder (DO NOT use for grounding until canonical)

While this node is `draft`, Caroline treats all inventory and pricing questions as escalations:
- "I'll have a salesperson reach out with exactly what we've got."
- "Our team will get you the best price and flexible financing when you come in."

## Promote instructions
Once the operator has verified all facts above:
1. Replace the "pending verification" bullets with confirmed, operator-approved policy statements.
2. Remove this notice block.
3. Run: `pnpm tsx scripts/seed-serra-honda-knowledge.ts --promote company-wiki/sales/inventory-and-pricing.md`
