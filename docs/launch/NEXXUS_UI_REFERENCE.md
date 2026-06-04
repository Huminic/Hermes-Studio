# Nexxus 2.2 — UI Design Reference (Build-Ready Spec)

Source of truth: `nexxus2.2_replit/client/src` (read-only study). This document is the
visual + navigation spec to match in Huminic Studio.

**Theme verdict:** LIGHT mode by default (white background, slate text, blue primary,
purple accents). A dark mode exists (`.dark` class) but light is the modern/default target.
Stack: React + Wouter + Tailwind + shadcn/ui (Radix) + `lucide-react` icons + Inter font.

---

## 1. PALETTE (HSL tokens → hex)

Tokens are HSL triplets in `client/src/index.css`. Hex equivalents below.

### Light mode (default / target)
| Role | Token | HSL | Hex |
|------|-------|-----|-----|
| Background (app) | `--background` | 0 0% 100% | `#ffffff` |
| Foreground (text) | `--foreground` | 222 47% 11% | `#0f172a` (Slate 900) |
| Border | `--border` | 214 32% 91% | `#e2e8f0` (Slate 200) |
| Card / surface | `--card` | 210 40% 98% | `#f8fafc` (Slate 50) |
| Sidebar bg | `--sidebar` | 210 40% 98% | `#f8fafc` (Slate 50) |
| **Primary** | `--primary` | 217 91% 60% | `#3b82f6` (Blue 500) |
| Primary text | `--primary-foreground` | 0 0% 100% | `#ffffff` |
| Secondary | `--secondary` | 187 85% 43% | `#06b6d4` (Cyan 500) |
| **Accent (sidebar active / brand)** | `--sidebar-primary` | 263 70% 66% | `#8b5cf6` (Purple 500) |
| Muted bg | `--muted` | 210 40% 96% | `#f1f5f9` (Slate 100) |
| Muted text | `--muted-foreground` | 215 16% 47% | `#64748b` (Slate 500) |
| Accent hover | `--accent` | 210 40% 96% | `#f1f5f9` (Slate 100) |
| Destructive / error | `--destructive` | 0 84% 60% | `#ef4444` (Red 500) |
| Ring (focus) | `--ring` | 217 91% 60% | `#3b82f6` |
| Input border | `--input` | 214 32% 91% | `#e2e8f0` |

### Status / semantic (from `tailwind.config.ts` → `colors.status`)
| Role | Value |
|------|-------|
| Success / online | `rgb(34 197 94)` `#22c55e` (Green 500) |
| Warn / away | `rgb(245 158 11)` `#f59e0b` (Amber 500) |
| Busy / error | `rgb(239 68 68)` `#ef4444` (Red 500) |
| Offline | `rgb(156 163 175)` `#9ca3af` (Gray 400) |

### Signature gradient (chat input + AI accents)
`linear-gradient(90deg, #8b5cf6, #3b82f6, #06b6d4, #8b5cf6)` (purple→blue→cyan), animated,
with glow `box-shadow: 0 0 25px rgba(139,92,246,.4), 0 0 50px rgba(59,130,246,.2)`.
Agent avatars use `bg-gradient-to-br from-purple-500 to-blue-500`.

### Dark mode (reference only — not the target)
Background `#0f172a` (Slate 900), card `#1e293b` (Slate 800), border `#334155` (Slate 700),
primary `#60a5fa` (Blue 400), accent purple `#a78bfa` (Purple 400), text `#f8fafc`.

**Net:** white app surface, slate-900 text, blue-500 primary buttons/links, **purple-500 as the
brand/active-nav accent**, cyan as secondary. Charts: blue / cyan / cyan / green / amber.

---

## 2. TYPOGRAPHY

| Family | Token | Stack |
|--------|-------|-------|
| Sans (default UI) | `--font-sans` | `'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif` |
| Serif | `--font-serif` | `'Merriweather', Georgia, serif` |
| Mono | `--font-mono` | `'Fira Code', Monaco, 'Courier New', monospace` |

Body uses `font-sans antialiased`. Dual-density helpers:
- `.density-data` = 13px / 1.4 line-height (tables, dashboards)
- `.density-chat` = 14px / 1.6 line-height (chat)

Common sizes (Tailwind): nav labels `text-[10px]`, section eyebrows `text-[10px] uppercase
tracking-wider`, body `text-sm` (14px), card titles `text-sm font-semibold`, page title
`text-xl`/`text-2xl font-bold`, login brand `text-6xl font-bold`. Weights used: 400, 500
(`font-medium`), 600 (`font-semibold`), 700 (`font-bold`).

---

## 3. SPACING / RADIUS / SHADOWS

| Property | Value |
|----------|-------|
| Base radius `--radius` | `.5rem` (8px) |
| `rounded-lg` | `.5625rem` (9px) |
| `rounded-md` | `.375rem` (6px) |
| `rounded-sm` | `.1875rem` (3px) |
| Avatars / chips | `rounded-full` |
| Cards | `rounded-2xl` on login; `rounded-lg`/card border elsewhere |
| Base spacing unit | `0.25rem` (4px grid) |

Shadows (light): `--shadow-sm` `0 1px 3px rgba(0,0,0,.1),0 1px 2px rgba(0,0,0,.06)`;
`--shadow-md` `0 4px 6px -1px rgba(0,0,0,.1)...`; `--shadow-lg`; `--shadow-2xl`
`0 25px 50px -12px rgba(0,0,0,.25)`.

**Component look:** flat cards with 1px slate-200 border + subtle shadow; hover uses an
`::after` overlay (`--elevate-1` = `rgba(0,0,0,.03)`, `--elevate-2` = `rgba(0,0,0,.08)`) via
`.hover-elevate` utility rather than color swaps. Buttons (shadcn): primary = solid blue,
`ghost` = transparent w/ hover-elevate (used for nearly all icon buttons). Inputs: h-12 on
auth, h-7/h-8 compact in panels, slate-200 border, blue focus ring. Custom 8px scrollbars
with translucent thumb.

---

## 4. LEFT NAV (Sidebar)

File: `client/src/components/layout/Sidebar.tsx`. **72px wide**, icon-on-top + tiny label
below (`text-[10px]`). Icon-only collapsed state is 40px. Monochrome **line icons from
`lucide-react`** (single icon set throughout the app).

**IMPORTANT — Nexxus nav is persona/department-based, NOT feature-based.** The labels the
operator listed (Agents, Knowledge, Widgets, Teambox, Campaigns, Data) are mostly NOT
top-level sidebar items in Nexxus — they live one level down (sub-menu flyout) or in Settings.

### Top-level sidebar items (exact order, labels, icons)
| # | Label | lucide icon | Route |
|---|-------|-------------|-------|
| 1 | **AI Chat** | `MessageSquare` | `/` |
| 2 | **TeamBox** | `Inbox` | `/teambox` |
| 3 | **Sales** | `ShoppingCart` | `/sales` |
| 4 | **Service** | `Wrench` | `/service` |
| 5 | **Insights** | `BarChart3` | `/insights` |
| 6 | **Marketing** | `Megaphone` | `/marketing` |
| 7 | **Manage** | `LayoutDashboard` | `/management` |

Bottom-pinned: **System** (`Settings`, `/settings/system`, RBAC-gated to admins) and
**Logout** (`LogOut`). "My Work" exists in code but is hidden (`User` icon).

**Active state:** purple-500 left border bar (`w-0.5 h-8 bg-purple-500 rounded-r-full`) +
purple icon tint (`text-purple-500 dark:text-purple-400`) + `bg-accent`. Inactive icons/labels
are `text-muted-foreground`.

### Sub-menu flyout (`SubMenuManager.tsx`, 280px, opens on hover/pin)
This is where the operator's expected labels actually appear:
- **TeamBox panel** → channel filters: SMS (`Smartphone`), Email (`Mail`), Phone (`Phone`),
  Video (`Video`); plus Tasks (`CheckSquare`).
- **Sales panel** → Dashboard, **Agents** (`Bot`), Insights, Calendar + agent roster list.
- **Service panel** → **Campaigns** (`Megaphone`), Agents, Insights, Calendar + agent roster.
- **Marketing panel** → Dashboard, Studio (`Palette`), Insights + AI agent list.
- **Manage panel** → Insights, Hunches (`Lightbulb`), System Log, User Chats, Billing.
- **System panel** → Users, Organization, Tools & Integrations (**Widgets** live here),
  **Knowledge Base** (`BookOpen`), AI Configuration, Notifications, Appearance, Billing.

> Label mapping to operator's terms: **Agents** = Sales/Service "Agents" tab + `/agents`
> detail page. **Knowledge** = "Knowledge Base" (Settings). **Widgets** = "Tools &
> Integrations" (Settings). **Teambox** = top-level "TeamBox". **Campaigns** = Service
> "Campaigns" tab. **Data** = no item named "Data"; closest is "Insights"/dashboards and the
> "Data Guru" agent (the renamed "CRM Guru").

---

## 5. HEADER (TopBar)

File: `client/src/components/layout/TopBar.tsx`. Fixed height **h-14 (56px)**, white bg,
bottom border. Left→right:

| Zone | Content |
|------|---------|
| Left | **Brand — text only: `Nexxus Connect™`** (`font-semibold text-sm`, the ™ in muted color). NO logo icon (locked design decision). |
| Center | Org switcher dropdown (`Building2` icon + org name + `ChevronDown`) when multi-org; else plain org name. |
| Right | Globe (`Globe`, opens public page `/p/:slug`) · Notifications (`Bell` + red count badge) · Activity feed (`Activity`) · Theme toggle (`Sun`/`Moon`) · Profile avatar (initials on blue circle + `ChevronDown`). |

Profile dropdown: name, email, role badge, My Profile, Preferences, Reset Tour, Log out
(destructive red).

**Brand appears exactly ONCE in the header** (text-only "Nexxus Connect™", left). The org
name (center) is the dealership, not the brand. (Login page shows the brand "Nexxus"
separately — see §6.)

---

## 6. LOGIN PAGE

File: `client/src/pages/login.tsx`. **Dark, glassmorphism over a random full-bleed
wallpaper** (9 wallpapers in `/wallpapers/`). Distinct from the light in-app theme.

- Centered glass card: `rounded-2xl`, `background: rgba(0,0,0,0.5)`, `backdrop-filter:
  blur(20px)`, `1px rgba(255,255,255,0.1)` border, blue-tinted glow shadow. `max-w-lg`.
- Dark overlay `bg-black/40 backdrop-blur-[2px]` over the wallpaper.
- Brand: **`Nexxus`** `text-6xl font-bold`, white with blue neon `text-shadow`, letter-spacing
  `0.05em`; subtitle "Customer portal" (`text-xl font-light`, white/85).
- Fields: Email + Password, h-12, translucent `bg-white/10 border-white/20`, white text, blue
  focus ring. Submit button full-width h-12, `linear-gradient(135deg, #3b82f6, #2563eb)`,
  "Sign in" (spinner while submitting). "Forgot password?" link below.
- Footer: `By huminic` (lowercase, Arial).
- Session-expired amber alert when redirected from timeout.

---

## 7. PER-SECTION LAYOUT

Layout is route-driven via `AppLayout.getViewConfig()`:
`chat-only | data-display | sub-menu | heavy-chat | teambox`.

| Section | Route | Layout |
|---------|-------|--------|
| **AI Chat** (`main.tsx`) | `/` | `chat-only`, centered `max-w-4xl`, no right pane. Top: 2×2 pipeline metric tiles (gradient bg, decorative SVG circles) that collapse after first message. Center: chat thread (bot left on `bg-card`+border, user right on `bg-primary`, NO avatars). Bottom: suggestion chips + **gradient-bordered input** (`chat-input-gradient`) with file-upload dropdown. Typing = 3 `.wave-dot`s. |
| **Agent detail** (`agents.tsx`) | `/agents` | `heavy-chat`. Chat in center; **right pane = `AgentConfigPane`** (metrics, instructions, triggers, tools, skills, knowledge, activity). Empty state = "Select an Agent" + "Create New Agent". |
| **Knowledge / wiki** | Settings → `knowledge` | NOT a wiki. "Knowledge Base" = file upload for AI training data (FAQ, pricing, inventory CSVs). `BookOpen` icon. |
| **Widgets** | Settings → `tools` ("Tools & Integrations") | Widget cards + universal widget settings (channel toggles) + landing pages + embed-code generation. See §9. |
| **Dashboards / Data** | `/sales /service /marketing /management /insights` | `data-display`. KPI metric tiles + charts; **slide-out right pane** hosts the org's "Automa"/persona AI chat (toggle via chevron; FAB on mobile). |
| **TeamBox (inbox)** | `/teambox` | `teambox` — own internal **3-column** layout (no global right pane). Filters by **channel** (All, SMS, Email, Web Chat, WhatsApp, Voice) and **status** (All, Open, Assigned to me, Participating, Automated, Scheduled, Followup, Pending). Thread list (avatar, customer, channel badge, AI badge if automated, unread dot). Conversation header shows customer + channel badge + **`Take Over`** button (outline, appears only when `status === 'automated'` and an agent is attached) = agent→human handoff. Assign-to dropdown (Unassigned / users). Campaign disconnect button when `campaignId` present. |
| **Campaigns** | Service "Campaigns" tab (`service.tsx`) | Campaign table: status, channel, recipient/sent/replied counts, kill-switch toggle. Top buttons: **"New Campaign"** + **"Upload CSV"**. New-Campaign dialog: name + **channel checkboxes** (default `['sms']`; one campaign created per selected channel) + message template. CSV upload per-campaign via `/api/campaigns/:id/upload-csv`. Campaign Safety card explains kill switch. (Marketing page is read-only browse; outbound disabled this release.) |

---

## 8. AGENT ROSTER (Serra Honda + fleet)

Definitions seeded in `server/seed.ts` (`agentData` + `chatAgentDefs` arrays). Type:
`shared/schema.ts` Agent (fields: name, department, type, status, channels, description,
assignedPhone, vapiAssistantId, tavusPersonaId, autoGreeting). Org persona name "Caroline"
for Serra Honda (`organizations.personaName`).

### Serra Honda voice/video agent
| Name | Role / dept | Channels | Phone / IDs |
|------|-------------|----------|-------------|
| **Caroline** | AI **Sales** Agent — inbound leads, appt scheduling, follow-ups | **voice, video** | `+1 (901) 203-8267`, vapi `90a876c0-…-264d88`, tavus `p9eb007721f4`, has autoGreeting |

### Serra Honda chat agents (seeded for all 5 stores via `chatAgentDefs`, channels `["chat"]`)
| Name | Dept | Description |
|------|------|-------------|
| **Data Guru** | sales | VIN Solutions CRM data expert — pipeline, lead insights, customer history. *(= operator's "CRM-GURU"; renamed from "CRM Guru" — see `plan-v1-archive.md`.)* |
| **Sales Coach** | sales | Coaching, objection handling, follow-up strategies. |
| **Communication Writer** | sales | Email/SMS drafts, templates, nurturing sequences. |
| **Nancy Gaston** | service | Service campaigns, recall notifications, maintenance scheduling, service knowledge. *(= operator's "Nancy".)* |
| **Photo Studio** | marketing | AI vehicle photo gen / background swap (fal.ai). |
| **Video Producer** | marketing | Promo video + voiceover (fal.ai). |
| **Copywriter** | marketing | Ad copy in 5 categories (OpenAI). |
| **Market Intel** | marketing | Competitor + local market intel. |
| **Creative Director** | marketing | Asset scoring / brand consistency. |

Also seeded (knowledge chat agents, channels `["chat"]`, lines ~178-179): "Service Agent" and
"Marketing Agent" for Serra Honda.

### Other fleet stores (voice+video sales/service/marketing agents)
| Agent | Store | Dept |
|-------|-------|------|
| Magnolia | Serra Nissan | service |
| Georgia | Tony Serra Ford | sales |
| Elizabeth | Hyundai of Columbia | marketing |
| Savannah | Ford of Columbia | service |

### Marketing agent UI defs (separate, client-side)
`client/src/lib/marketing-agents.ts` (`MARKETING_AGENTS`): `photo-studio`, `video-producer`,
`copywriter`, `creative-director`, `market-intel` — each with id, name, icon, accentColor, and
tool schemas. Rendered in the Marketing sub-menu.

**Names operator listed:** Caroline ✓, Nancy ✓ (= "Nancy Gaston"), CRM-GURU ✓ (= "Data Guru").
**"Semantic Guardian"** — NOT present anywhere in the Nexxus codebase (see GAPS).

---

## 9. WIDGET SET

Types: `client/src/lib/widget-types.ts`; configured in Settings → Tools (`settings.tsx`);
seeded examples in `server/seed.ts`.

### Widget types (`widgetTypeConfig`)
| Type | Label | Channel tech | Icon | Gradient |
|------|-------|--------------|------|----------|
| `text` | Text Chat Widget | AI text chat | `MessageSquare` | blue→cyan |
| `video` | Live Video Widget | Tavus AI persona | `Video` | purple→violet |
| `voice` | Voice Call Widget | VAPI browser voice | `Mic` | emerald→teal |
| `unified` | Unified Widget | chat+video+voice+SMS+callback | `LayoutGrid` | amber→orange |

### Config shape
- **`UniversalWidgetSettings`**: `enabledChannels` (chat/video/voice/sms/callback booleans),
  `defaultChannel`, `videoPersonaName` (default "Serra"), `videoPersonaGreeting`,
  `videoAutoLaunch`, `smsNumber`, `callbackFormFields` (`['name','phone','email','interest']`).
- **`IndividualWidget`**: id, type, widgetCode, name, description, status
  (active/inactive/draft), `appearance`, `targeting`, allowedDomains, config, impressions,
  interactions.
- **`WidgetAppearance`**: primaryColor (`#8b5cf6`), secondaryColor (`#3b82f6`), textColor,
  backgroundColor, organizationName, showLogo, position (`bottom-right`|`bottom-left`),
  animation (`pulse`|`bounce`|`none`), buttonLabel ("Chat with us"), welcomeHeading,
  welcomeMessage.
- **`WidgetTargeting`**: audience (all/leads/returning), includePages/excludePages,
  desktop/mobile/tablet, businessHoursOnly, delaySeconds, scrollDepthPercent, exitIntent.
- **`LandingPage`**: slug, type (multi/chat/video/callback), linkedWidgetId, appearance,
  views, conversions. Served at `/w/:slug` and `/p/:slug` (`widget-landing.tsx`).

Seeded Serra Honda widgets: "Serra Honda Sales Chat" (text, → Caroline), "Serra Video
Assistant" (video, Tavus `p9eb007721f4`), "Service Appointment Bot" (voice, VAPI), "Marketing
Landing Widget" (unified).

---

## GAPS

1. **"Semantic Guardian" agent** — not found anywhere in `nexxus2.2_replit` (no match in seed,
   server, client, json, or docs). Either it does not exist in Nexxus 2.2 or it lives outside
   this repo (e.g. `.halo`/`.ghost` linked dirs, not studied). Confirm with operator whether to
   invent it for Huminic or drop it.
2. **Top-level nav vs operator's expected labels** — operator expected "Agents, Knowledge,
   Widgets, Teambox, Campaigns, Data" as nav. Nexxus uses persona nav (AI Chat, TeamBox, Sales,
   Service, Insights, Marketing, Manage, System); the expected labels are sub-menu/Settings
   items. Decision needed: replicate Nexxus's department nav, or build a flat feature nav for
   Huminic using these labels. Mapping provided in §4.
3. **"Data" section** — no Nexxus item literally named "Data." Closest = Insights dashboards +
   "Data Guru" agent. Confirm what Huminic's "Data" should map to.
4. Exact rendered pixel metrics (real screenshots) not captured here — derived from source, not
   a live browser pass. Many reference PNGs exist in `nexxus2.2_replit/*.png` (e.g.
   `teambox-*.png`, `sales-dashboard.png`) if pixel-accurate confirmation is required.
5. Tailwind heading scale beyond what's quoted (e.g. h1/h2 defaults) relies on Tailwind defaults
   + `@tailwindcss/typography`; no custom fontSize scale is defined in `tailwind.config.ts`.
