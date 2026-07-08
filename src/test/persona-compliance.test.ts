import { describe, expect, it } from 'vitest'
import {
  detectPersonaViolations,
  type PersonaRuleClass,
} from '../server/persona-compliance'
import { personaComplianceCheck, type SentinelStore } from '../server/sentinel'

const classes = (t: string): PersonaRuleClass[] =>
  detectPersonaViolations(t).map((v) => v.ruleClass).sort()

describe('detectPersonaViolations', () => {
  it('passes compliant, on-persona replies', () => {
    for (const ok of [
      "Great — a salesperson will reach out to confirm and answer any questions.",
      "I'll have someone reach out with exactly what we've got. What day works after 9?",
      "Happy to help set up a sales or service appointment!",
    ]) {
      expect(detectPersonaViolations(ok)).toEqual([])
    }
  })

  it('flags pricing / financing quotes (critical class)', () => {
    expect(classes('The CR-V is $28,500 out the door')).toEqual(['pricing'])
    expect(classes('We can do $399/mo with $2,000 down')).toEqual(['pricing'])
    expect(classes('MSRP is competitive')).toEqual(['pricing'])
    expect(classes('2.9% APR available')).toEqual(['pricing'])
  })

  it('catches common evasions (no "$": "25k", "20 grand", spelled price ranges)', () => {
    expect(classes("It's 25k even")).toEqual(['pricing'])
    expect(classes('About 20 grand out the door')).toEqual(['pricing'])
    expect(classes('The price is 27500')).toEqual(['pricing'])
  })

  it('does NOT trip pricing on non-finance "%" or "k miles"', () => {
    expect(classes('We are 99% booked this weekend')).toEqual([])
    expect(classes('10% chance of rain, come on by')).toEqual([])
    expect(classes('It has 25k miles on it')).toEqual([]) // mileage, not price
  })

  it('does NOT trip on a bare "down payment" mention with no figure', () => {
    expect(classes("I'll set the down payment paperwork aside — let's book a visit")).toEqual([])
  })

  it('flags inventory / stock claims incl. possession evasions', () => {
    expect(classes('Yes we have three in stock right now')).toEqual(['inventory'])
    expect(classes('It is on the lot today')).toEqual(['inventory'])
    expect(classes('Yes, we have that exact one here now')).toEqual(['inventory'])
  })

  it('does NOT trip inventory on appointment availability', () => {
    expect(classes('That time is available right now for a test drive appointment')).toEqual([])
  })

  it('flags spec quotes (mpg / horsepower)', () => {
    expect(classes('It gets 33 mpg highway')).toEqual(['specs'])
    expect(classes('That trim has 285 horsepower')).toEqual(['specs'])
  })

  it('reports one entry per rule class even with multiple hits', () => {
    const v = detectPersonaViolations('$30,000 and MSRP and $500/mo')
    expect(v.filter((x) => x.ruleClass === 'pricing')).toHaveLength(1)
  })

  it('returns the matched phrase for the alert detail', () => {
    const v = detectPersonaViolations('It is $19,999')
    expect(v[0]).toMatchObject({ ruleClass: 'pricing' })
    expect(v[0].match).toContain('$19,999')
  })
})

describe('personaComplianceCheck (Sentinel)', () => {
  const NOW = 1_750_000_000_000
  const store = (msgs: Array<{ thread_id: string; content: string }>): SentinelStore =>
    ({
      listOpenThreads: () => [],
      getThread: () => null,
      countCommsErrors: () => ({ count: 0, byChannel: {} }),
      countStuckAutomations: () => ({ automations: 0, flows: 0 }),
      countReplyJobs: () => ({ failed: 0, queued: 0 }),
      latestInboundAt: () => null,
      sampleRecentThreads: () => [],
      recentOutboundAgentMessages: () =>
        msgs.map((m) => ({ ...m, created_at: NOW - 1000 })),
    }) as unknown as SentinelStore

  const ctx = (msgs: Array<{ thread_id: string; content: string }>) =>
    ({ profile: 'serra-honda', now: NOW, store: store(msgs) }) as never

  it('raises a critical finding for a pricing violation', async () => {
    const findings = await personaComplianceCheck.run(
      ctx([{ thread_id: 't1', content: 'The CR-V is $28,500' }]),
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      severity: 'critical',
      category: 'persona-compliance',
      profile: 'serra-honda',
      key: 'persona-compliance:serra-honda:t1:pricing',
    })
  })

  it('raises a warning for inventory/specs', async () => {
    const findings = await personaComplianceCheck.run(
      ctx([{ thread_id: 't2', content: 'It gets 33 mpg and is in stock' }]),
    )
    expect(findings.map((f) => f.severity).sort()).toEqual(['warning', 'warning'])
  })

  it('stays silent for compliant messages', async () => {
    const findings = await personaComplianceCheck.run(
      ctx([{ thread_id: 't3', content: "A salesperson will reach out to confirm." }]),
    )
    expect(findings).toEqual([])
  })
})
