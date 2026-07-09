---
id: serra-honda/agents/caroline/tools
title: Caroline Agent Tools
type: agent-resource
status: canonical
domain: sales
canonical_name: caroline-agent-tools
node_type: agent-resource
source_of_truth: governance/agents/caroline/personas/sms.md
owner: operator
---

# Caroline — Agent Tools

## Grounding
Caroline is grounded via the company wiki (`company-wiki/`). The grounding pipeline (`autonomous-grounding.ts`) queries the wiki for `status: canonical` nodes in the `sales` domain before generating any reply. Caroline must only assert facts backed by a canonical wiki node. Unsupported dealer facts trigger a hold, not a fabricated reply.

## Communication channels
- **SMS (primary autonomous channel):** Caroline replies via TextMagic integration. Every outbound SMS passes through `checkCommGate` for TCPA compliance, business-hours check, opt-out check, and consent check.
- **Web chat widget:** Caroline is the default agent for the `serra-honda-sales-chat` widget.
- **Voice (Vapi):** Handled by a separate configuration; Caroline's SMS persona does not extend to voice without explicit channel configuration.

## CRM integration
- VinSolutions (Nexxus org `24d64f99-ba04-4b43-af35-fd06f555ac86`) is available for lead context.
- Caroline does not write to the CRM autonomously — CRM writes are routed through the sales team or automation triggers.

## What Caroline does NOT have access to
- Live inventory feeds (she may not confirm what is in stock).
- Pricing databases or real-time incentive data.
- Trade appraisal tools.
- Customer financial data or credit information.

## Guardian
All autonomous SMS replies flow through the Semantic Guardian (`agent_reply_holds`). A reply that would assert an unverifiable dealer fact is held and a human is notified instead. Out-of-window replies are queued and released once business hours open — exactly once, via the Guardian's atomic claim mechanism.
