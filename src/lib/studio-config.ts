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
 * Lead notification destination per profile. When an inbound channel
 * adapter creates a "lead" thread (Vapi end-of-call summary, ADF email,
 * form submission), the messaging hub emits an ADF XML email to this
 * address via central-mcp Resend. Empty adf_email disables ADF emit.
 */
const LeadNotificationsSchema = z
  .object({
    adf_email: z.string().email().optional(),
    sender_name: z.string().optional(),
    /** Name of the env var (in the profile .env or central-mcp tokens) that holds the Resend token used to send this profile's ADF emails. Defaults to CENTRAL_MCP_TOKEN. */
    resend_token_var: z.string().optional(),
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
  lead_notifications: LeadNotificationsSchema,
})

export type StudioConfig = z.infer<typeof StudioConfigSchema>

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
    lead_notifications: {},
  }
}
