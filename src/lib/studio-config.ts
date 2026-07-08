/**
 * Per-profile studio.yaml schema and parser.
 *
 * Each customer profile under ~/.hermes/profiles/<name>/ may include a
 * studio.yaml that the customer-console plugin reads to drive branding,
 * menu visibility, widget list, agent picker, and federation scopes.
 *
 * Phase C IA (6 pages): Chat, InfoStore, Tools (with Widget sub-page),
 * Dashboard, Comms (Sales/Service segments), Campaigns (Service sub-page).
 * The previous IA (Chat/Dashboard/Widget/Service) was retired in C.0.
 */

import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

const BrandingSchema = z.object({
  logo_path: z.string().optional(),
  accent_color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  persona_name: z.string().min(1),
})

const MenuSchema = z
  .object({
    chat: z.boolean().optional().default(true),
    agents: z.boolean().optional().default(true),
    infostore: z.boolean().optional().default(true),
    /** Legacy flags retained so older studio.yaml files continue parsing. */
    knowledge: z.boolean().optional().default(true),
    tools: z.boolean().optional().default(true),
    data: z.boolean().optional().default(true),
    comms: z.boolean().optional().default(true),
    campaigns: z.boolean().optional().default(true),
    notifications: z.boolean().optional().default(true),
  })
  .optional()
  .default({})

const WidgetEntrySchema = z.object({
  slug: z.string().min(1),
  mode: z.enum(['chat', 'voice', 'video', 'form']),
  agent: z.string().min(1),
})

const AgentPickerSchema = z
  .object({
    /** Agent IDs (SOUL fragment basenames) eligible to appear in the Chat picker. Empty = all profile agents. */
    visible_agents: z.array(z.string()).optional().default([]),
    /** Default-selected agent when the page loads. */
    default_agent: z.string().optional(),
  })
  .optional()
  .default({ visible_agents: [] })

const ToolsWidgetSchema = z
  .object({
    /** Whether the embed-code copy block is visible to customer-admin. */
    show_embed_snippet: z.boolean().optional().default(true),
    /** Whether the live demo iframe is visible. */
    show_live_demo: z.boolean().optional().default(true),
    /** Whether the Consult sub-page is exposed under Tools (AC.13.1). */
    consult: z.boolean().optional().default(false),
  })
  .optional()
  .default({})

/**
 * Lookahead schema for AC.5.8 (agent-autonomous two-way reply). Per-thread
 * rule overrides live in the messaging-hub plugin; this is the per-profile
 * default set referenced when an agent subscribes to a thread with no
 * explicit per-thread rule.
 */
const AutonomousReplyDefaultsSchema = z
  .object({
    enabled: z.boolean().optional().default(false),
    business_hours_only: z.boolean().optional().default(false),
    /** Max consecutive agent turns before escalating to human. 0 = no limit. */
    max_agent_turns: z.number().int().min(0).optional().default(3),
    /** Per-channel allowlist; empty = all channels permitted. */
    channels: z
      .array(z.enum(['chat', 'email', 'sms', 'phone', 'video']))
      .optional()
      .default([]),
  })
  .optional()
  .default({})

const FederationSchema = z
  .object({
    read_scopes: z.array(z.string()).optional().default([]),
  })
  .optional()
  .default({ read_scopes: [] })

/**
 * Per-profile VinSolutions access. `org_id` is the **Nexxus org UUID** (NOT the
 * VIN dealerId) — the central-mcp broker maps UUID→dealerId internally. Every
 * live `vin_query_leads` / `vin_get_contact` call MUST carry this orgId; passing
 * the profile slug silently fails. Operator-controlled (lives in studio.yaml).
 * If absent here, the resolver falls back to the `VIN_ORG_ID` profile env var;
 * if neither is set the VIN path is reported unconfigured (no silent fallback).
 */
/**
 * VIN-watcher opt-in (WS-2). The new-lead follow-up agent polls vin_query_leads,
 * resolves names, and texts new leads as the dealership. It is DEFAULT OFF — a
 * profile must explicitly set `vin.watcher.enabled: true` in studio.yaml to be
 * swept. `dealer_name` is what the templates speak as ("this is {dealer}"); it
 * falls back to branding.persona_name when absent. The window/dedup knobs mirror
 * the Nexxus trigger gates (see NEXXUS_FIT_SPEC §1.4) and rarely need changing.
 */
const VinWatcherSchema = z
  .object({
    enabled: z.boolean().optional().default(false),
    /** Spoken dealership name; falls back to branding.persona_name. */
    dealer_name: z.string().optional(),
    /** IMMEDIATE: lead must have synced within this many minutes. */
    synced_within_min: z.number().int().min(1).optional().default(30),
    /** IMMEDIATE: lead must have been created within this many hours. */
    created_within_hours: z.number().int().min(1).optional().default(4),
    /** IMMEDIATE dedup window (hours): one immediate text per phone. */
    immediate_dedup_hours: z.number().int().min(1).optional().default(24),
    /** 24h CHECK-IN target delay after first contact (minutes). */
    checkin_after_min: z.number().int().min(1).optional().default(1440),
    /** 24h CHECK-IN tolerance band (± minutes) around the target. */
    checkin_window_min: z.number().int().min(1).optional().default(30),
    /** 24h CHECK-IN dedup window (hours): one check-in per phone. */
    checkin_dedup_hours: z.number().int().min(1).optional().default(48),
    /** Max leads processed per cycle (also caps name resolution). */
    poll_limit: z.number().int().min(1).optional().default(10),
  })
  .optional()
  .default({})

/**
 * SMS FAST-FOLLOW TRIGGERS (operator spec, 2026-06). A per-profile, DEFAULT-OFF
 * config for the two approved trigger texts. This block ONLY carries config +
 * the verbatim approved copy; it does NOT itself send anything. Every send still
 * flows through dispatchOutbound → CommGate (OUTBOUND_LIVE_ENABLED, TCPA hours,
 * blacklist, VIN-DNC) and the pre-launch allowlist, exactly like the existing
 * watcher/flow paths.
 *
 *   Trigger 1 (immediate): THIRD-PARTY leads only (not our own widget/system
 *     leads). Caroline/Nancy-style outreach to open a dialogue toward a test
 *     drive / service appointment; the human salesperson completes the booking
 *     by phone. Gated by `trigger1.third_party_only` (DEFAULT true) — the actual
 *     lead-source classification is a Duane decision (which VIN/lead field marks
 *     a third-party source), so the gate is SCAFFOLDED behind this flag, not
 *     wired to a live source field yet.
 *   Trigger 2 (24h): ALL leads. Check-in / insurance follow-up.
 *
 * `domain` selects which copy variant renders: `sales` → Caroline/Serra Honda;
 * `service` → Nancy/Serra Service. Absent → falls back to comms/sms inbound
 * domain semantics at the call site. Both triggers DEFAULT enabled:false so no
 * existing profile changes behavior; the whole block is optional.
 *
 * Templates use `{{first_name}}` and an OPTIONAL vehicle clause written as
 * `{{ <literal text> <vehicle>}}` — the inner clause renders only when a vehicle
 * is known, with `<vehicle>` replaced by the vehicle string; when no vehicle is
 * known the entire `{{ ... }}` clause (including its leading space) is omitted.
 */
const SmsTriggerDomain = z.enum(['sales', 'service'])

const SmsTrigger1Schema = z
  .object({
    /** DEFAULT OFF — must be explicitly enabled per profile. */
    enabled: z.boolean().optional().default(false),
    /**
     * Restrict Trigger 1 to THIRD-PARTY-sourced leads only (not our own
     * widget/system leads). DEFAULT true. The live source classification is a
     * Duane decision and is NOT yet wired — see sms-triggers.ts isThirdParty().
     */
    third_party_only: z.boolean().optional().default(true),
    /** Sales copy (Caroline / Serra Honda). Verbatim approved draft default. */
    template_sales: z
      .string()
      .optional()
      .default(
        "Hi {{first_name}}, I'm Caroline with Serra Honda. I saw you were looking at{{ the <vehicle>}} — we'd love to get you in for a test drive, but I need a couple quick details first so we set it up right. What's the best day for you to come by? Reply STOP to opt out.",
      ),
    /** Service copy (Nancy / Serra Service). Verbatim approved draft default. */
    template_service: z
      .string()
      .optional()
      .default(
        "Hi {{first_name}}, this is Nancy with Serra Service. I saw your service request{{ for your <vehicle>}}. I'd love to get you scheduled — just need a little more info first. What's going on with the vehicle, and when works to bring it in? Reply STOP to opt out.",
      ),
  })
  .optional()
  .default({})

const SmsTrigger2Schema = z
  .object({
    /** DEFAULT OFF — must be explicitly enabled per profile. */
    enabled: z.boolean().optional().default(false),
    /** Delay after first contact before the 24h check-in fires (minutes). */
    window_min: z.number().int().min(1).optional().default(1440),
    /** Sales check-in copy (Caroline). Verbatim approved draft default. */
    template_sales: z
      .string()
      .optional()
      .default(
        "Hi {{first_name}}, it's Caroline at Serra Honda. Just making sure someone got in touch with you{{ about the <vehicle>}}. Is everything okay with your experience? If something's off I can make sure our manager knows — or let me know how else I can help.",
      ),
    /** Service check-in copy (Nancy). Verbatim approved draft default. */
    template_service: z
      .string()
      .optional()
      .default(
        "Hi {{first_name}}, it's Nancy at Serra Service. Just checking that someone followed up{{ on your <vehicle>}}. Is everything okay with your experience so far? If anything's off I'll flag it for our service manager — or tell me what else I can help with.",
      ),
  })
  .optional()
  .default({})

const SmsTriggersSchema = z
  .object({
    /** Which copy variant these triggers speak as. Absent → resolved at call site. */
    domain: SmsTriggerDomain.optional(),
    /** Immediate, third-party-only outreach. */
    trigger1: SmsTrigger1Schema,
    /** 24h check-in for all leads. */
    trigger2: SmsTrigger2Schema,
  })
  .optional()
  .default({})

export type SmsTriggersConfig = z.infer<typeof SmsTriggersSchema>

const VinSchema = z
  .object({
    org_id: z.string().min(1).optional(),
    /** Max contacts resolved via vin_get_contact per cycle (throttle guard). */
    name_resolve_cap: z.number().int().min(0).optional().default(10),
    /** WS-2 new-lead follow-up watcher (opt-in, default OFF). */
    watcher: VinWatcherSchema,
  })
  .optional()
  .default({})

/**
 * Per-store SMS identity. `inbound_numbers` lists the TextMagic number(s) that
 * route to THIS profile. Used by the generic inbound webhook
 * (/api/webhooks/textmagic) to map a payload's `receiver` (destination number)
 * → profile when one TextMagic (sub)account holds multiple numbers and exposes
 * a single account-level callback. The dedicated /api/webhooks/textmagic/$profile
 * route does not need this (profile comes from the URL).
 */
const SmsSchema = z
  .object({
    inbound_numbers: z.array(z.string()).optional().default([]),
    /**
     * Default domain (sales|service) for inbound SMS landing on this profile's
     * webhook, when the callback URL does not carry a `?domain=` override. A
     * sales store (e.g. serra-honda / Caroline) sets `sales`; a service store
     * (serra-service / Nancy) sets `service`. Absent → 'service' (legacy default).
     */
    inbound_domain: z.enum(['sales', 'service']).optional(),
    /**
     * central-mcp TextMagic account key to send FROM in `shared` mode (e.g.
     * `serra_honda`, `serra_service`). Passed as `account` to `tm_send_message`
     * so each store sends from its own provisioned number. Omit to use the
     * broker's default account. Only used when channel_credentials.sms=shared.
     */
    account: z.string().optional(),
  })
  .optional()
  .default({ inbound_numbers: [] })

/**
 * Operator-side per-profile channel-credential selection. Each outbound channel
 * (SMS/TextMagic, Vapi voice, Tavus video, email) can use the SHARED ("united")
 * credentials brokered by central-mcp, or the profile's OWN credentials in its
 * .env. Default is `shared` for every channel — the launch posture is one united
 * credential set, with per-profile opt-out to own creds. This block lives in
 * studio.yaml, which is operator-controlled (customer-admins cannot edit it).
 */
const CredentialModeSchema = z.enum(['shared', 'own'])
const ChannelCredentialsSchema = z
  .object({
    /** Fallback mode for any channel not set explicitly. */
    default: CredentialModeSchema.optional().default('shared'),
    sms: CredentialModeSchema.optional(),
    vapi: CredentialModeSchema.optional(),
    tavus: CredentialModeSchema.optional(),
    email: CredentialModeSchema.optional(),
  })
  .optional()
  .default({ default: 'shared' })

/**
 * Lead notification destination per profile. When an inbound channel
 * adapter creates a "lead" thread (Vapi end-of-call summary, ADF email,
 * form submission), the messaging hub emits an ADF XML email to this
 * address via central-mcp Resend. Empty adf_email disables ADF emit.
 */
const LeadNotificationsSchema = z
  .object({
    adf_email: z
      .union([z.literal(''), z.string().email()])
      .optional()
      .transform((v) => (v === '' ? undefined : v)),
    sender_name: z.string().optional(),
    /** Name of the env var (in the profile .env or central-mcp tokens) that holds the Resend token used to send this profile's ADF emails. Defaults to CENTRAL_MCP_TOKEN. */
    resend_token_var: z.string().optional(),
  })
  .optional()
  .default({})

/**
 * Per-profile DEALER notification format + recipient (WS-4). When an
 * internal lead event fires for the store (Vapi end-of-call, new VIN lead),
 * the dealership gets a notification in the format its DMS/CRM ingests:
 *   - `adf-xml`  → structured ADF-XML (Serra stores; reuse the AC.6.8 emitter)
 *   - `email`    → plain readable email (Columbia stores)
 * `lead_recipient` is the dealer inbox the notification lands in. If absent,
 * the dispatcher falls back to the legacy `lead_notifications.adf_email` and,
 * failing that, reports `unconfigured` (no send, no throw). Default format is
 * `email` so an unconfigured profile cannot accidentally emit ADF.
 * Operator-controlled (studio.yaml); the store→format map lives in
 * NEXXUS_FIT_SPEC §5.
 */
/**
 * One notification routing rule (#207). Maps a CONDITION (an event id) to a
 * recipient on a channel. The condition is an arbitrary string so the same
 * matrix routes BOTH built-in lead/inbound events AND Guardian-produced
 * conditions / query-result alerts (Business Guardian #208, Performance
 * Guardian #209) — e.g. `perf_guardian:slow_first_response`,
 * `lead_source_underperforming`. `event: 'all'` matches every condition. When
 * no rule matches a lead event, dispatch falls back to the single
 * `lead_recipient` (legacy behavior preserved). Producers resolve recipients
 * via `resolveNotificationEmails`; the page is the routing layer in front of
 * the alert bus.
 */
export const NotificationEvents = [
  'new_lead', // generic / email lead (default catch-all)
  'inbound_sms',
  'inbound_call',
  'inbound_video',
  'inbound_chat',
  'website_form',
  'all',
] as const

const NotificationRuleSchema = z.object({
  /** Condition id: a built-in lead event (see NotificationEvents) or any
   * Guardian/query condition key. Free-form so new producers need no schema change. */
  event: z.string().min(1),
  /** Recipient: an email address for channel:email, a phone for channel:sms. */
  to: z.string().min(1),
  channel: z.enum(['email', 'sms']).optional().default('email'),
  /**
   * Per-notification template (#NW): how THIS recipient receives the alert.
   * 'email' = the styled HTML lead card; 'adf-xml' = the DMS-ingestable ADF
   * document (a .adf.xml attachment + raw XML body), used for a dealer's CRM
   * intake address. Absent → fall back to the store-level `lead_format`, so a
   * dealer can have human recipients on the email card AND a DMS contact on ADF
   * within the SAME store.
   */
  format: z.enum(['adf-xml', 'email']).optional(),
  /** Optional human label for the UI (e.g. "Sales BDC", "Service Manager"). */
  label: z.string().optional(),
  enabled: z.boolean().optional().default(true),
})

export type NotificationRule = z.infer<typeof NotificationRuleSchema>

const NotificationsSchema = z
  .object({
    lead_format: z.enum(['adf-xml', 'email']).optional().default('email'),
    lead_recipient: z
      .union([z.literal(''), z.string().email()])
      .optional()
      .transform((v) => (v === '' ? undefined : v)),
    /**
     * ADF parity fields (#NW) — mirror the dealer's DMS config so the ADF-XML
     * document a CRM ingests carries the right vehicle make and lead source.
     * `adf_brand` → the vehicle <make> (e.g. "Honda"); `adf_lead_source` → the
     * ADF <vendorname>/source (e.g. "Dealers WebSite"). Sourced from the Nexxus
     * org settings (adfBrand / adfLeadSource). Email format ignores these.
     */
    adf_brand: z.string().optional(),
    adf_lead_source: z.string().optional(),
    /** Per-event recipient × channel routing matrix (#207). Empty = use lead_recipient. */
    routing: z.array(NotificationRuleSchema).optional().default([]),
    /**
     * Anti-spam cooldown: once a new-lead notification fires for a contact key
     * (phone / email / chat-IP), suppress further new-lead notifications for the
     * SAME key for this many hours. Protects the BDC from a returning contact or
     * a bot opening many widget-chat sessions. 0 disables the cooldown.
     * Per-conversation spam is already prevented upstream (notify only on a NEW
     * thread; ongoing messages reuse the open thread). Default 4h (operator
     * 2026-06-06 — keyed per CONTACT, not per thread; a future "smart" filter may
     * replace the fixed window with a context-aware one, see #207).
     */
    notify_cooldown_hours: z.number().min(0).optional().default(4),
    /**
     * Slice H — active-conversation human-takeover alert. DEFAULT-OFF safety
     * flag. When TRUE, the FIRST follow-on customer message on an existing
     * thread (the conversation becoming active, NOT the first inbound that
     * already fired the new-lead alert) emails the SAME routing recipients an
     * EMAIL-format alert (never ADF, even for adf-xml profiles) with a "Stop the
     * AI conversation, I'll take it from here" takeover button. Deduped once per
     * thread. MUST stay false in every live profile until the operator
     * explicitly enables it per profile — widget chat is LIVE and we must not
     * start emailing real dealer admins automatically.
     */
    active_conversation_alert: z.boolean().optional().default(false),
  })
  .optional()
  .default({})

/**
 * Outbound communications gate (CommGate) — fail-closed safety, mirrors the
 * Nexxus `checkCommGate` contract. Per-profile + per-channel enable flags, a
 * TCPA business-hours window, and a flag to check live VinSolutions lead status
 * before sms/voice. The GLOBAL kill switch is the env var OUTBOUND_LIVE_ENABLED
 * (not here): nothing sends unless it is exactly "true".
 */
const BusinessHoursSchema = z
  .object({
    /** IANA tz, e.g. America/New_York. */
    tz: z.string().optional().default('America/New_York'),
    /** 24h "HH:MM". */
    start: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional()
      .default('08:00'),
    end: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional()
      .default('21:00'),
  })
  .optional()
  .default({})

/** Minutes-since-midnight for "HH:MM". */
function hhmmToMin(s: string): number {
  const [h, m] = s.split(':').map((x) => parseInt(x, 10))
  return h * 60 + m
}

/**
 * One send window. Refined to the A2P/CTIA/TCPA daytime envelope (08:00–21:00
 * local): start < end (no overnight/wraparound) and neither bound in quiet hours.
 * This makes it impossible to configure a window that would text during quiet
 * hours (21:00–08:00), which the send-windows evaluator would otherwise honor.
 */
const SendWindowSchema = z
  .object({
    start: z.string().regex(/^\d{2}:\d{2}$/),
    end: z.string().regex(/^\d{2}:\d{2}$/),
  })
  .refine(
    (w) => {
      const s = hhmmToMin(w.start)
      const e = hhmmToMin(w.end)
      return s < e && s >= hhmmToMin('08:00') && e <= hhmmToMin('21:00')
    },
    { message: 'send window must be within the A2P daytime envelope 08:00–21:00 (start < end)' },
  )

const CommsSchema = z
  .object({
    /** Master per-profile outbound switch (still gated by OUTBOUND_LIVE_ENABLED env). */
    outbound_enabled: z.boolean().optional().default(true),
    /** Per-channel enable flags. */
    channels: z
      .object({
        sms: z.boolean().optional().default(true),
        voice: z.boolean().optional().default(true),
        video: z.boolean().optional().default(true),
        email: z.boolean().optional().default(true),
      })
      .optional()
      .default({}),
    /** TCPA window applied to sms + voice. */
    business_hours: BusinessHoursSchema,
    /** Check live VinSolutions lead status (DNC / opted-out) before sms/voice. */
    vin_check: z.boolean().optional().default(true),
    /**
     * When vin_check is on but the live VIN lookup ERRORS (outage / VIN not
     * wired on the broker), should we send anyway? Default false = fail-CLOSED
     * (block, because we cannot prove the recipient hasn't opted out — TCPA
     * safe). Set true only when you accept sending without a verifiable DNC
     * check (the local blacklist still applies regardless).
     */
    vin_check_fail_open: z.boolean().optional().default(false),
    /**
     * SMS CONSENT GATE (VinSolutions). When true, every proactive SMS is
     * scrubbed at send time against the recipient's VinSolutions contact
     * (SmsPreferences SubscriberStatus + CustomerConsent), on top of the
     * blacklist + business hours. Requires a contactId on the recipient
     * (VIN-sourced); a send with no contactId is BLOCKED. ALWAYS fail-closed —
     * vin_check_fail_open does NOT apply to this check.
     */
    sms_consent_check: z.boolean().optional().default(false),
    /**
     * SubscriberStatus value(s) that count as opted-in. EMPTY (default) =>
     * blocks EVERYONE — the affirmative value MUST be confirmed against
     * VinSolutions before enabling (only "Pending" = do-not-send observed live).
     */
    sms_opt_in_statuses: z.array(z.string()).optional().default([]),
    /** Which CustomerConsent qualifies for SMS texting. */
    sms_consent_mode: z
      .enum(['express', 'implied', 'either', 'none'])
      .optional()
      .default('either'),
    /** Also block SMS when ContactInformation.DoNotMail is true (policy). */
    sms_block_on_do_not_mail: z.boolean().optional().default(false),
    /** Per-channel rate caps (consumed by comms-rate-limiter). */
    rate_caps: z
      .record(
        z.string(),
        z.object({
          per_minute: z.number().int().min(0).optional(),
          per_hour: z.number().int().min(0).optional(),
        }),
      )
      .optional()
      .default({}),
    /**
     * Per-message-class send windows (consumed by src/server/send-windows.ts —
     * NOT by the global comms-gate business-hours layer). `immediate` gates the
     * lead-engagement first-touch (after-hours only); `followup` gates the 24h
     * follow-up (A2P daytime). `tz` defaults to business_hours.tz. When absent
     * the module applies A2P-compliant defaults (immediate 08:00–09:00 +
     * 19:00–21:00; followup 08:00–21:00). Quiet hours (21:00–08:00) are never
     * inside a default window.
     */
    send_windows: z
      .object({
        tz: z.string().optional(),
        immediate: z.array(SendWindowSchema).optional(),
        followup: z.array(SendWindowSchema).optional(),
      })
      .optional(),
    /**
     * Hub `via` tags whose leads are ALREADY handled by a conversational agent
     * and must be EXCLUDED from the immediate lead-engagement text (they are
     * engaged by Vapi/Tavus directly). Default: vapi-webhook + tavus-webhook
     * (voice + video, incl. widget video). Add 'widget-callback' to also exclude
     * call-back requests. Consumed by src/server/immediate-exclude.ts.
     */
    immediate_exclude_via: z.array(z.string()).optional(),
  })
  .optional()
  .default({})

/**
 * One custom dashboard card (data builder). `source` selects a metric the
 * /api/customer/reports payload already computes (calls=vapi, video=tavus,
 * sms, email, chat, leads=vin, service, sales, campaigns, followups). A
 * `federated` card stores a selected set of those sources and the renderer
 * combines them into one card. This schema stores the user's chosen cards.
 */
export const DashboardMetricSources = [
  'calls',
  'video',
  'sms',
  'email',
  'chat',
  'leads',
  'service',
  'sales',
  'campaigns',
  'followups',
] as const

export const DashboardSources = [...DashboardMetricSources, 'federated'] as const

const DashboardCardSchema = z.object({
  title: z.string().min(1),
  source: z.enum(DashboardSources),
  sources: z.array(z.enum(DashboardMetricSources)).optional().default([]),
  visualization: z.enum(['number', 'bar', 'table']).optional().default('number'),
  display: z.enum(['summary', 'detail']).optional().default('summary'),
})

export type DashboardCard = z.infer<typeof DashboardCardSchema>

/**
 * Unified storefront widget (the floating circle + dropdown menu on the public
 * `/p/<profile>` page, ported from Nexxus). One launcher that fans out to up to
 * four connect options. Display fields (accent/subtitle/channels/agent name) are
 * PUBLIC — served to unauthenticated storefront visitors. `video_persona_id` is
 * NOT public: the Two-Way Video session is minted server-side via the broker, so
 * the persona id never reaches the browser. Absent persona → the video option
 * degrades to "temporarily unavailable" rather than failing.
 */
const UnifiedWidgetChannelsSchema = z
  .object({
    chat: z.boolean().optional().default(true),
    callback: z.boolean().optional().default(true),
    form: z.boolean().optional().default(true),
    video: z.boolean().optional().default(true),
  })
  .optional()
  .default({})

const UnifiedWidgetSchema = z
  .object({
    /** Master toggle for the floating launcher on the public storefront. */
    enabled: z.boolean().optional().default(true),
    /** Header/launcher accent. Nexxus used teal #0d9488 across all stores. */
    accent: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional()
      .default('#0d9488'),
    /** Header subtitle under the store name. */
    subtitle: z.string().optional().default('Choose how to connect'),
    /** Which of the four connect options appear (in this fixed order). */
    channels: UnifiedWidgetChannelsSchema,
    /** Widget slug opened by Web Chat. Defaults to `<profile>-sales-chat`. */
    chat_slug: z.string().optional(),
    /** Widget slug opened by Contact Form. Defaults to `<profile>-contact`. */
    form_slug: z.string().optional(),
    /** Tavus persona minted for Two-Way Video. Server-side only (never public). */
    video_persona_id: z.string().optional(),
    /** Name spoken in "Face-to-face with <name>". Defaults to 'our team'. */
    video_agent_name: z.string().optional(),
  })
  .optional()
  .default({})

export type UnifiedWidgetConfig = z.infer<typeof UnifiedWidgetSchema>

export const StudioConfigSchema = z.object({
  branding: BrandingSchema,
  menu: MenuSchema,
  agent_picker: AgentPickerSchema,
  tools_widget: ToolsWidgetSchema,
  widgets: z.array(WidgetEntrySchema).optional().default([]),
  dashboards: z.array(DashboardCardSchema).optional().default([]),
  autonomous_reply_defaults: AutonomousReplyDefaultsSchema,
  federation: FederationSchema,
  vin: VinSchema,
  sms: SmsSchema,
  lead_notifications: LeadNotificationsSchema,
  notifications: NotificationsSchema,
  channel_credentials: ChannelCredentialsSchema,
  comms: CommsSchema,
  /** SMS fast-follow triggers (operator spec). Optional, both default OFF. */
  sms_triggers: SmsTriggersSchema,
  unified_widget: UnifiedWidgetSchema,
})

export type StudioConfig = z.infer<typeof StudioConfigSchema>
export type CredentialMode = z.infer<typeof CredentialModeSchema>

/** Channels that resolve credentials via the shared/own selector. */
export type CredentialedChannel = 'sms' | 'vapi' | 'tavus' | 'email'

/**
 * Resolve the credential mode for a channel: explicit per-channel setting, else
 * the profile's `default`, else `shared`. Never throws.
 */
export function credentialModeFor(
  config: StudioConfig,
  channel: CredentialedChannel,
): CredentialMode {
  const cc = config.channel_credentials
  return cc?.[channel] ?? cc?.default ?? 'shared'
}

export type ParseResult =
  | { ok: true; config: StudioConfig }
  | { ok: false; errors: Array<string> }

export function parseStudioConfig(yamlText: string): ParseResult {
  let raw: unknown
  try {
    raw = parseYaml(yamlText)
  } catch (err) {
    return {
      ok: false,
      errors: [`YAML parse error: ${(err as Error).message}`],
    }
  }

  const parsed = StudioConfigSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(
        (i) => `${i.path.join('.') || '(root)'}: ${i.message}`,
      ),
    }
  }
  return { ok: true, config: parsed.data }
}

/** Fallback used when no studio.yaml exists for a profile. Renders without branding. */
export function defaultStudioConfig(profile: string): StudioConfig {
  return {
    branding: { persona_name: profile },
    menu: {
      chat: true,
      agents: true,
      infostore: true,
      knowledge: true,
      tools: true,
      data: true,
      comms: true,
      campaigns: true,
      notifications: true,
    },
    agent_picker: { visible_agents: [] },
    tools_widget: {
      show_embed_snippet: true,
      show_live_demo: true,
      consult: false,
    },
    widgets: [],
    dashboards: [],
    autonomous_reply_defaults: {
      enabled: false,
      business_hours_only: false,
      max_agent_turns: 3,
      channels: [],
    },
    federation: { read_scopes: [] },
    vin: {
      name_resolve_cap: 10,
      watcher: {
        enabled: false,
        synced_within_min: 30,
        created_within_hours: 4,
        immediate_dedup_hours: 24,
        checkin_after_min: 1440,
        checkin_window_min: 30,
        checkin_dedup_hours: 48,
        poll_limit: 10,
      },
    },
    lead_notifications: {},
    sms: { inbound_numbers: [] },
    notifications: {
      lead_format: 'email',
      routing: [],
      notify_cooldown_hours: 4,
      active_conversation_alert: false,
    },
    channel_credentials: { default: 'shared' },
    comms: {
      outbound_enabled: true,
      channels: { sms: true, voice: true, video: true, email: true },
      business_hours: { tz: 'America/New_York', start: '08:00', end: '21:00' },
      vin_check: true,
      vin_check_fail_open: false,
      sms_consent_check: false,
      sms_opt_in_statuses: [],
      sms_consent_mode: 'either',
      sms_block_on_do_not_mail: false,
      rate_caps: {},
    },
    sms_triggers: {
      trigger1: {
        enabled: false,
        third_party_only: true,
        template_sales:
          "Hi {{first_name}}, I'm Caroline with Serra Honda. I saw you were looking at{{ the <vehicle>}} — we'd love to get you in for a test drive, but I need a couple quick details first so we set it up right. What's the best day for you to come by? Reply STOP to opt out.",
        template_service:
          "Hi {{first_name}}, this is Nancy with Serra Service. I saw your service request{{ for your <vehicle>}}. I'd love to get you scheduled — just need a little more info first. What's going on with the vehicle, and when works to bring it in? Reply STOP to opt out.",
      },
      trigger2: {
        enabled: false,
        window_min: 1440,
        template_sales:
          "Hi {{first_name}}, it's Caroline at Serra Honda. Just making sure someone got in touch with you{{ about the <vehicle>}}. Is everything okay with your experience? If something's off I can make sure our manager knows — or let me know how else I can help.",
        template_service:
          "Hi {{first_name}}, it's Nancy at Serra Service. Just checking that someone followed up{{ on your <vehicle>}}. Is everything okay with your experience so far? If anything's off I'll flag it for our service manager — or tell me what else I can help with.",
      },
    },
    unified_widget: {
      enabled: true,
      accent: '#0d9488',
      subtitle: 'Choose how to connect',
      channels: { chat: true, callback: true, form: true, video: true },
    },
  }
}

/**
 * Public display subset of the unified-widget config — what an UNAUTHENTICATED
 * storefront visitor may receive. Strips `video_persona_id` (server-side secret;
 * the Two-Way Video session is minted by the broker, never the browser).
 */
export type UnifiedWidgetPublic = Omit<UnifiedWidgetConfig, 'video_persona_id'>

export function publicUnifiedWidget(config: StudioConfig): UnifiedWidgetPublic {
  const { video_persona_id: _omit, ...rest } = config.unified_widget
  return rest
}
