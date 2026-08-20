import { describe, it, expect } from 'vitest'
import {
  PACKS,
  computePackStatus,
  packsSummary,
  type Heartbeats,
} from '@/components/customer-console/cockpit/power-packs'

const base = PACKS.find((p) => p.kind === 'base')!
const coming = PACKS.find((p) => p.kind === 'coming')!
const activity = PACKS.find((p) => p.id === 'sms')!
const automation = PACKS.find((p) => p.id === 'newlead')!

describe('power-pack heartbeat status', () => {
  it('has 15 packs', () => {
    expect(PACKS).toHaveLength(15)
  })

  it('base capabilities are always Online', () => {
    expect(computePackStatus(base, {})).toEqual({ status: 'online', text: 'Online' })
  })

  it('the "coming" pack is Arriving next (standby)', () => {
    expect(computePackStatus(coming, {})).toEqual({ status: 'standby', text: 'Arriving next' })
  })

  it('an activity pack with live count shows Online + the count', () => {
    const hb: Heartbeats = { sms_replies: { count: 61 } }
    const st = computePackStatus(activity, hb)
    expect(st.status).toBe('online')
    expect(st.text).toBe('Online · 61 replies')
    expect(st.count).toBe(61)
  })

  it('an activity pack with ZERO activity honestly reads Ready — not enabled (Columbia case)', () => {
    expect(computePackStatus(activity, { sms_replies: { count: 0 } }).status).toBe('ready')
    expect(computePackStatus(activity, {}).status).toBe('ready') // missing heartbeat = same
  })

  it('an automation pack with no runs reads Ready — not enabled', () => {
    expect(computePackStatus(automation, {}).status).toBe('ready')
    expect(computePackStatus(automation, { automation_new_lead: { count: 12 } }).status).toBe('online')
  })

  it('summary counts only Online packs (base packs always count)', () => {
    // no heartbeats → only the base packs are online; coming + activity/automation are not
    const baseCount = PACKS.filter((p) => p.kind === 'base').length
    expect(packsSummary({})).toEqual({ online: baseCount, total: 15 })
  })
})
