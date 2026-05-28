export type WidgetChannel = 'chat' | 'voice' | 'video' | 'handoff'

export interface WidgetAgentEntry {
  agentId: string
  label: string
  description: string
  customerFacing: boolean
  channels: WidgetChannel[]
}

export interface ProfileWidgetConfig {
  profile: string
  widgetKey: string
  enabled: boolean
  allowedDomains: string[]
  launcherLabel: string
  accent: string
  agents: WidgetAgentEntry[]
  createdAt: number
  updatedAt: number
}

export interface PublicWidgetConfig {
  profile: string
  widgetKey: string
  launcherLabel: string
  accent: string
  agents: WidgetAgentEntry[]
}
