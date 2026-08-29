import type { StudioConfig } from './studio-config'

/**
 * The CORE cockpit tabs — the fixed dashboard tab set (Dashboard, Issues, AI
 * Activity, Pipeline, Leads, Sales, Halo, Marketing, Custom). These are the
 * cockpit's OWN surfaces and are ALWAYS navigable; they are deliberately NOT
 * gated by the legacy per-store `menu` visibility flags, which govern only the
 * optional retained workspace surfaces (Chat, Storefront, Teambox, Agents, …).
 *
 * `campaigns` is the id behind the "Marketing" tab — it must stay accessible so
 * the eight-tab dashboard is complete even when a store's menu config omits it.
 */
export const CORE_COCKPIT_TABS: ReadonlySet<string> = new Set([
  'cockpit',
  'issues',
  'ai-activity',
  'pipeline',
  'leads',
  'sales',
  'halo',
  'campaigns',
  'custom',
])

/** Legacy per-store menu-visibility check for the retained workspace surfaces. */
export function isWorkspaceMenuEnabled(config: StudioConfig, id: string): boolean {
  if (id === 'infostore') {
    return config.menu.infostore ?? config.menu.knowledge ?? config.menu.data ?? true
  }
  return config.menu[id as keyof StudioConfig['menu']] ?? true
}

/**
 * Whether a sidebar tab is enabled/navigable. Core cockpit tabs are always on
 * (Marketing included); retained workspace surfaces still honour the store's
 * menu config.
 */
export function isTabEnabled(config: StudioConfig, id: string): boolean {
  if (CORE_COCKPIT_TABS.has(id)) return true
  return isWorkspaceMenuEnabled(config, id)
}
