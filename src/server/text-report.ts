/**
 * Nightly agent-voice TEXT report (AC7 / P6 — Serra comms recovery).
 *
 * Format: Greeting | Data | Commentary | Outro. The DATA clause is pure numbers
 * (never invented — filled from computed values). The COMMENTARY is drawn ONLY
 * from fixed variation banks keyed to the computed up/down/even delta vs.
 * yesterday — the agent never free-generates a fact. Appointments are DROPPED
 * (no VinSolutions MCP source), so commentary covers leads + sales only.
 *
 * Pure + deterministic: the variant rotation is an injected number (e.g.
 * day-of-year) so consecutive nights don't read identically, and tests are
 * reproducible.
 */

export type Delta = 'up' | 'down' | 'even'

/** Direction of today vs yesterday. Equal ⇒ 'even'. */
export function deltaOf(today: number, yesterday: number): Delta {
  if (today > yesterday) return 'up'
  if (today < yesterday) return 'down'
  return 'even'
}

const GREETINGS = [
  'Hey team,',
  'Team —',
  'Hi all!',
  'Hola!',
  'Evening, team —',
  'Hey everyone,',
]

const OUTROS = [
  "I'll be watching the leads tonight!",
  'Talk to you tomorrow!',
  'Let me know if you need anything!',
  'Talk soon,',
  "Let's close some sales!",
  'Onward and upward!',
  "Let's go!",
]

const LEADS_BANK: Record<Delta, string[]> = {
  up: ['Leads beat yesterday', 'More leads than yesterday', 'Lead flow was up on yesterday'],
  down: [
    'Leads ran lighter than yesterday',
    'Fewer leads than yesterday',
    'Lead flow dipped from yesterday',
  ],
  even: ['Leads held even with yesterday', 'Lead flow matched yesterday'],
}

const SALES_BANK: Record<Delta, string[]> = {
  up: [
    'sales landed ahead of yesterday',
    'we closed more than yesterday',
    'closings topped yesterday',
  ],
  down: [
    'sales came up short of yesterday',
    'we closed fewer than yesterday',
    'closings slipped from yesterday',
  ],
  even: ['sales matched yesterday', 'closings held even'],
}

function pick<T>(arr: ReadonlyArray<T>, rotation: number): T {
  const i = ((Math.trunc(rotation) % arr.length) + arr.length) % arr.length
  return arr[i]
}

export type TextReportInput = {
  leadsToday: number
  salesLost: number
  active: number
  needsAttention: number
  leadsDelta: Delta
  salesDelta: Delta
  /** Store agent name (Caroline = Honda/Nissan, Georgia = Ford). */
  agentName: string
  /** Deterministic variant selector (e.g. day-of-year). */
  rotation: number
}

/**
 * Assemble the text-report body. Numbers are placed verbatim; commentary is
 * selected from the fixed banks — no free text is generated.
 */
export function buildTextReport(input: TextReportInput): string {
  const greeting = pick(GREETINGS, input.rotation)
  const data = `${input.leadsToday} new leads today, ${input.salesLost} marked lost, ${input.active} active. ${input.needsAttention} need attention.`
  const leadsClause = pick(LEADS_BANK[input.leadsDelta], input.rotation)
  const salesClause = pick(SALES_BANK[input.salesDelta], input.rotation)
  const commentary = `${leadsClause}, ${salesClause}.`
  const outro = pick(OUTROS, input.rotation)
  return `${greeting} ${data} ${commentary} ${outro} —${input.agentName}`
}
