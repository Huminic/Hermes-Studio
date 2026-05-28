import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import type {
  ProfileWidgetConfig,
  PublicWidgetConfig,
  WidgetAgentEntry,
} from '../types/widget'
import { appendEvent } from './event-store'

const DATA_DIR = join(process.cwd(), '.runtime')
const WIDGETS_FILE = join(DATA_DIR, 'widgets.json')

type StoreData = { widgets: Record<string, ProfileWidgetConfig> }

let store: StoreData = { widgets: {} }

function loadFromDisk(): void {
  try {
    if (!existsSync(WIDGETS_FILE)) return
    const raw = readFileSync(WIDGETS_FILE, 'utf-8')
    const parsed = JSON.parse(raw) as StoreData
    if (parsed?.widgets && typeof parsed.widgets === 'object') store = parsed
  } catch {
    store = { widgets: {} }
  }
}

function saveToDisk(): void {
  mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(WIDGETS_FILE, JSON.stringify(store, null, 2), 'utf-8')
}

function newWidgetKey(): string {
  return `pub_widget_${randomBytes(18).toString('base64url')}`
}

loadFromDisk()

export function listWidgets(): ProfileWidgetConfig[] {
  return Object.values(store.widgets).sort((a, b) =>
    a.profile.localeCompare(b.profile),
  )
}

export function getWidget(profile: string): ProfileWidgetConfig {
  const existing = store.widgets[profile]
  if (existing) return existing
  const now = Date.now()
  const next: ProfileWidgetConfig = {
    profile,
    widgetKey: newWidgetKey(),
    enabled: false,
    allowedDomains: [],
    launcherLabel: `Ask ${profile}`,
    accent: 'blue',
    agents: [],
    createdAt: now,
    updatedAt: now,
  }
  store.widgets[profile] = next
  saveToDisk()
  return next
}

export function getWidgetByKey(widgetKey: string): ProfileWidgetConfig | null {
  return (
    Object.values(store.widgets).find((widget) => widget.widgetKey === widgetKey) ??
    null
  )
}

export function updateWidget(
  profile: string,
  input: Partial<{
    enabled: boolean
    allowedDomains: string[]
    launcherLabel: string
    accent: string
    agents: WidgetAgentEntry[]
  }>,
): ProfileWidgetConfig {
  const widget = getWidget(profile)
  if (input.enabled !== undefined) widget.enabled = input.enabled
  if (input.allowedDomains) widget.allowedDomains = input.allowedDomains
  if (input.launcherLabel) widget.launcherLabel = input.launcherLabel
  if (input.accent) widget.accent = input.accent
  if (input.agents) widget.agents = input.agents
  widget.updatedAt = Date.now()
  saveToDisk()
  appendEvent('widgets', undefined, 'widget.updated', {
    profile,
    enabled: widget.enabled,
  })
  return widget
}

export function rotateWidgetKey(profile: string): ProfileWidgetConfig {
  const widget = getWidget(profile)
  widget.widgetKey = newWidgetKey()
  widget.updatedAt = Date.now()
  saveToDisk()
  appendEvent('widgets', undefined, 'widget.rotated', { profile })
  return widget
}

export function publicWidgetConfig(widget: ProfileWidgetConfig): PublicWidgetConfig {
  return {
    profile: widget.profile,
    widgetKey: widget.widgetKey,
    launcherLabel: widget.launcherLabel,
    accent: widget.accent,
    agents: widget.agents.filter((agent) => agent.customerFacing),
  }
}
