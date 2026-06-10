# Draft Launch Emails - 2026-06-10

These are drafts only. Do not send until after the morning walkthrough and final open decisions are resolved or explicitly accepted.

## 1. Dealer.com Certification / Install Follow-Up

Subject: Huminic Studio widget install package for Dealer.com review

Hi [Name],

We are ready to provide the Huminic Studio self-hosted widget package for Dealer.com review.

The install uses one hosted script per rooftop. Example:

```html
<script async src="https://studio.huminic.app/widget/dealer/ford-of-columbia.js"></script>
```

Verification page:

`https://studio.huminic.app/dealer-widget-verification.html`

The widget presents the shopper menu for Web Chat, Instant Call Back, Contact Form, and Two-Way Video. The script is hosted by Huminic, and the shopper-facing dropdown/install experience does not require Dealer.com to host or maintain separate widget assets.

Please let us know if you need each rooftop's script URL listed separately or if you want us to walk through the verification page with your engineering team.

Thank you,

Duane

## 2. Serra / Store Team Launch Note

Subject: Huminic Studio Workspaces are ready for launch review

Hi team,

The Huminic Studio Workspaces are ready for launch review.

Each store has a dedicated Workspace for staff workflows, including Agents, Knowledge, Widgets, Data, Teambox, Campaigns, and Notifications. The public Storefront widget supports Web Chat, Instant Call Back, Contact Form, and Two-Way Video.

Workspace links:

- Serra Honda: `https://studio.huminic.app/p/serra-honda/chat`
- Serra Nissan: `https://studio.huminic.app/p/serra-nissan/chat`
- Tony Serra Ford: `https://studio.huminic.app/p/tony-serra-ford/chat`
- Hyundai of Columbia: `https://studio.huminic.app/p/hyundai-of-columbia/chat`
- Ford of Columbia: `https://studio.huminic.app/p/ford-of-columbia/chat`
- Serra Service: `https://studio.huminic.app/p/serra-service/chat`

We will provide credentials through the agreed secure channel rather than email.

The launch review will focus on confirming the storefront widget, lead routing, Teambox visibility, notification routing, and staff Workspace usability.

Thank you,

Duane

## 3. Durran / Partner Launch Note

Subject: Huminic Studio launch access for the six store Workspaces

Hi Durran,

The six Huminic Studio store Workspaces are ready for launch review.

For the launch window, access is organized as one Workspace login per store. That keeps each store's data and staff workflow scoped cleanly while the broader partner-level admin view is finalized.

Workspace links:

- Serra Honda: `https://studio.huminic.app/p/serra-honda/chat`
- Serra Nissan: `https://studio.huminic.app/p/serra-nissan/chat`
- Tony Serra Ford: `https://studio.huminic.app/p/tony-serra-ford/chat`
- Hyundai of Columbia: `https://studio.huminic.app/p/hyundai-of-columbia/chat`
- Ford of Columbia: `https://studio.huminic.app/p/ford-of-columbia/chat`
- Serra Service: `https://studio.huminic.app/p/serra-service/chat`

We will provide credentials through the agreed secure channel.

The current launch review includes the staff Workspaces, the public Storefront widget, lead routing, Teambox, notification routing, and the self-hosted website widget path.

Thank you,

Duane

## 4. Internal Launch Decision Note

Subject: Huminic Studio launch readiness - final decisions before send

Team,

The tested launch surfaces are materially ready: Global Studio, store Workspaces, public widgets, Dealer.com embed path, standalone routes, lead routing, Teambox, notifications, campaign draft path, custom dashboard behavior, and visible-surface vendor-name hygiene have all passed the latest checks.

Before we send external launch emails, we need final decisions on:

- voice webhook shared-secret hardening: fixed before launch or accepted as monitored risk;
- phone demo: live/agent-call-agent demo or acceptance of verified webhook-to-lead evidence;
- partner admin: launch with six store Workspace logins or hold for scoped partner admin;
- campaign scope: confirm current service-focused wording;
- final Chrome walkthrough: complete with Duane before certification is marked done.

No external emails should be sent until those points are resolved or explicitly accepted.
