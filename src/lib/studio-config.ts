/**
 * Per-profile studio.yaml schema and parser.
 *
 * Each customer profile under ~/.hermes/profiles/<name>/ may include a
 * studio.yaml that the customer-console plugin reads to drive branding,
 * menu visibility, dashboard list, widget list, and federation scopes.
 *
 * The schema mirrors plugin.yaml's studio_config_schema (customer-console
 * plugin). When new plugins ship more fields, this schema grows accordingly.
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
    dashboard: z.boolean().optional().default(true),
    widget: z.boolean().optional().default(true),
    service: z.boolean().optional().default(true),
  })
  .optional()
  .default({})

const DashboardEntrySchema = z.object({
  slug: z.string().min(1),
  title: z.string().optional(),
  artifact_path: z.string().min(1),
})

const WidgetEntrySchema = z.object({
  slug: z.string().min(1),
  mode: z.enum(['chat', 'voice', 'video', 'form']),
  agent: z.string().min(1),
})

const FederationSchema = z
  .object({
    read_scopes: z.array(z.string()).optional().default([]),
  })
  .optional()
  .default({ read_scopes: [] })

export const StudioConfigSchema = z.object({
  branding: BrandingSchema,
  menu: MenuSchema,
  dashboards: z.array(DashboardEntrySchema).optional().default([]),
  widgets: z.array(WidgetEntrySchema).optional().default([]),
  federation: FederationSchema,
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
    menu: { chat: true, dashboard: true, widget: true, service: true },
    dashboards: [],
    widgets: [],
    federation: { read_scopes: [] },
  }
}
