/**
 * Per-profile studio.yaml schema and parser.
 *
 * Each customer profile under ~/.hermes/profiles/<name>/ may include a
 * studio.yaml that the customer-console plugin reads to drive branding,
 * menu visibility, widget list, agent picker, and federation scopes.
 *
 * Phase C IA (6 pages): Chat, Knowledge, Tools (with Widget sub-page),
 * Data, Comms (Sales/Service segments), Campaigns (Service sub-page).
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
    knowledge: z.boolean().optional().default(true),
    tools: z.boolean().optional().default(true),
    data: z.boolean().optional().default(true),
    comms: z.boolean().optional().default(true),
    campaigns: z.boolean().optional().default(true),
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
const NotificationsSchema = z
  .object({
    lead_format: z.enum(['adf-xml', 'email']).optional().default('email'),
    lead_recipient: z
      .union([z.literal(''), z.string().email()])
      .optional()
      .transform((v) => (v === '' ? undefined : v)),
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
    start: z.string().regex(/^\d{2}:\d{2}$/).optional().default('08:00'),
    end: z.string().regex(/^\d{2}:\d{2}$/).optional().default('21:00'),
  })
  .optional()
  .default({})

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
  })
  .optional()
  .default({})

export const StudioConfigSchema = z.object({
  branding: BrandingSchema,
  menu: MenuSchema,
  agent_picker: AgentPickerSchema,
  tools_widget: ToolsWidgetSchema,
  widgets: z.array(WidgetEntrySchema).optional().default([]),
  autonomous_reply_defaults: AutonomousReplyDefaultsSchema,
  federation: FederationSchema,
  vin: VinSchema,
  lead_notifications: LeadNotificationsSchema,
  notifications: NotificationsSchema,
  channel_credentials: ChannelCredentialsSchema,
  comms: CommsSchema,
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
      knowledge: true,
      tools: true,
      data: true,
      comms: true,
      campaigns: true,
    },
    agent_picker: { visible_agents: [] },
    tools_widget: { show_embed_snippet: true, show_live_demo: true, consult: false },
    widgets: [],
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
    notifications: { lead_format: 'email' },
    channel_credentials: { default: 'shared' },
    comms: {
      outbound_enabled: true,
      channels: { sms: true, voice: true, video: true, email: true },
      business_hours: { tz: 'America/New_York', start: '08:00', end: '21:00' },
      vin_check: true,
      vin_check_fail_open: false,
      rate_caps: {},
    },
  }
}
