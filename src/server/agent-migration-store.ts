import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { MigratedAgentRecord } from '../types/agent-migration'

const DATA_DIR = join(process.cwd(), '.runtime')
const MIGRATIONS_FILE = join(DATA_DIR, 'agent-migrations.json')

type StoreData = { agents: Record<string, MigratedAgentRecord> }

let store: StoreData = { agents: {} }

function loadFromDisk(): void {
  try {
    if (!existsSync(MIGRATIONS_FILE)) return
    const raw = readFileSync(MIGRATIONS_FILE, 'utf-8')
    const parsed = JSON.parse(raw) as StoreData
    if (parsed?.agents && typeof parsed.agents === 'object') store = parsed
  } catch {
    store = { agents: {} }
  }
}

function saveToDisk(): void {
  mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(MIGRATIONS_FILE, JSON.stringify(store, null, 2), 'utf-8')
}

loadFromDisk()

export function listMigratedAgents(profile?: string | null): MigratedAgentRecord[] {
  let agents = Object.values(store.agents)
  if (profile) agents = agents.filter((agent) => agent.profile === profile)
  return agents.sort((a, b) => b.updatedAt - a.updatedAt)
}

export function createMigratedAgent(
  input: Partial<MigratedAgentRecord> & {
    sourceApplication: string
    sourceAgentId: string
    profile: string
    displayName: string
  },
): MigratedAgentRecord {
  const now = Date.now()
  const agent: MigratedAgentRecord = {
    id: randomUUID(),
    sourceApplication: input.sourceApplication,
    sourceAgentId: input.sourceAgentId,
    profile: input.profile,
    displayName: input.displayName,
    studioAgentId: input.studioAgentId ?? null,
    systemPrompt: input.systemPrompt ?? '',
    customerFacing: input.customerFacing ?? false,
    tools: input.tools ?? [],
    vapi: input.vapi ?? {},
    tavus: input.tavus ?? {},
    status: input.status ?? 'inventory',
    notes: input.notes ?? '',
    createdAt: now,
    updatedAt: now,
  }
  store.agents[agent.id] = agent
  saveToDisk()
  return agent
}
