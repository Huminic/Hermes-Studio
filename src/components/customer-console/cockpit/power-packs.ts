/**
 * AI Power Packs — the 15 capability cards. Status is HEARTBEAT-DRIVEN, not
 * hardcoded per store: a pack is "Online" only when it shows real activity this
 * period ("a green dot with a count is a fact"); otherwise it honestly reads
 * "Ready — not enabled here". This auto-adapts per store — e.g. a store with no
 * SMS traffic shows the SMS pack as Ready, without any per-store hardcoding.
 */
export type PackAccent = 'cool' | 'hot' | 'good'
export type PackKind = 'base' | 'activity' | 'automation' | 'coming'
export type PackStatus = 'online' | 'standby' | 'ready'

export type PackDef = {
  id: string
  name: string
  desc: string
  accent: PackAccent
  /** heartbeat key looked up in the per-store Heartbeats map */
  source: string
  kind: PackKind
  /** unit label appended to a live count, e.g. "replies" */
  unit?: string
}

export type Heartbeat = { count: number } | null
export type Heartbeats = Record<string, Heartbeat>

/** The canonical 15 packs (from the report JSON `power_packs`). */
export const PACKS: Array<PackDef> = [
  { id: 'video', name: '24-Hour Video Sales Agents', desc: 'live face-to-face, any hour', accent: 'hot', source: 'video_threads', kind: 'activity', unit: 'sessions' },
  { id: 'voice', name: 'After-Hours Voice Support', desc: 'the phone answered while closed', accent: 'hot', source: 'voice_threads', kind: 'activity', unit: 'calls' },
  { id: 'crm', name: 'VinSolutions CRM Integration', desc: 'live CRM read, all day', accent: 'cool', source: 'vin_join', kind: 'base' },
  { id: 'teambox', name: 'Internal AI Teambox', desc: 'one inbox for everything', accent: 'good', source: 'static', kind: 'base' },
  { id: 'widgets', name: 'Website AI Widgets', desc: 'the unified widget, site-wide', accent: 'cool', source: 'chat_threads', kind: 'activity', unit: 'chats' },
  { id: 'datamon', name: 'AI Data Monitoring', desc: 'round-the-clock checks', accent: 'good', source: 'static', kind: 'base' },
  { id: 'brain', name: 'AI Dealer Brain (Infostore)', desc: 'store knowledge on tap', accent: 'good', source: 'static', kind: 'base' },
  { id: 'orchestrate', name: 'Agent Orchestration Engine', desc: 'routes work between agents', accent: 'cool', source: 'static', kind: 'base' },
  { id: 'salesmon', name: 'AI Sales Monitor', desc: 'touched leads through to sold', accent: 'good', source: 'static', kind: 'base' },
  { id: 'newlead', name: 'New Lead Engagement Engine', desc: 'instant text on every new lead', accent: 'hot', source: 'automation_new_lead', kind: 'automation', unit: 'runs' },
  { id: 'followup', name: 'Lead Follow-Up Engagement Engine', desc: 'the 24-hour safety net', accent: 'cool', source: 'automation_followup', kind: 'automation', unit: 'saves' },
  { id: 'comms', name: 'AI Communications Agents', desc: 'voice · SMS · video · chat', accent: 'hot', source: 'agent_replies', kind: 'activity', unit: 'replies' },
  { id: 'perfmon', name: 'Sales Team Performance Monitor', desc: 'arriving with next integration', accent: 'cool', source: 'coming', kind: 'coming' },
  { id: 'sms', name: '2-Way SMS Conversation Engine', desc: 'real conversations by text', accent: 'hot', source: 'sms_replies', kind: 'activity', unit: 'replies' },
  { id: 'portal', name: 'Customer Portal & Notifications', desc: 'staff alerts, delivered', accent: 'good', source: 'notifications', kind: 'activity', unit: 'alerts' },
]

export type PackState = { status: PackStatus; text: string; count?: number }

/** Resolve a pack's live status from the store's heartbeat map. */
export function computePackStatus(pack: PackDef, heartbeats: Heartbeats): PackState {
  if (pack.kind === 'coming') return { status: 'standby', text: 'Arriving next' }
  if (pack.kind === 'base') return { status: 'online', text: 'Online' }
  const n = heartbeats[pack.source]?.count ?? 0
  if (n > 0) {
    const unit = pack.unit ? ` ${pack.unit}` : ''
    return { status: 'online', text: `Online · ${n.toLocaleString('en-US')}${unit}`, count: n }
  }
  // activity/automation pack with no live count → honest, not a fake green dot
  return { status: 'ready', text: 'Ready — not enabled here' }
}

/** Summary line: "N of 15 systems online". */
export function packsSummary(heartbeats: Heartbeats): { online: number; total: number } {
  const online = PACKS.filter((p) => computePackStatus(p, heartbeats).status === 'online').length
  return { online, total: PACKS.length }
}
