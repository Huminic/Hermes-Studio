export interface MigratedAgentRecord {
  id: string
  sourceApplication: string
  sourceAgentId: string
  profile: string
  displayName: string
  studioAgentId: string | null
  systemPrompt: string
  customerFacing: boolean
  tools: string[]
  vapi: {
    assistantId?: string
    personaId?: string
  }
  tavus: {
    personaId?: string
    replicaId?: string
    conversationId?: string
    cviId?: string
  }
  status: 'inventory' | 'mapped' | 'imported' | 'blocked'
  notes: string
  createdAt: number
  updatedAt: number
}
