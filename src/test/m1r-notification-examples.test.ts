import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { m1rNotificationExamples, toPausedMetricAlertInput } from '../server/watchdog/m1r-notification-examples'

const NOW = new Date('2026-08-31T12:00:00Z')
const REAL_ROOT = '/srv/ingest-dev/analytics'
const HAVE = fs.existsSync(`${REAL_ROOT}/serra-honda/brain/brain.db`)

describe.runIf(HAVE)('M1R inactive notification examples (real accepted store, 3 profiles)', () => {
  const saved = process.env.BRAIN_PROFILES_ROOT
  beforeAll(() => { process.env.BRAIN_PROFILES_ROOT = REAL_ROOT })
  afterAll(() => { if (saved === undefined) delete process.env.BRAIN_PROFILES_ROOT; else process.env.BRAIN_PROFILES_ROOT = saved })

  const PROFILES = ['serra-honda', 'serra-nissan', 'tony-serra-ford']

  it('exactly four definitions per profile, ALL inactive (paused), never active, never sent', () => {
    for (const p of PROFILES) {
      const defs = m1rNotificationExamples(p, NOW)
      expect(defs).toHaveLength(4)
      for (const d of defs) {
        expect(d.status).toBe('paused') // INACTIVE
        expect(d.status).not.toBe('active')
        expect(d.sendState).toMatch(/never/)
        // every definition surfaces the required fields
        expect(d.metric_label.length).toBeGreaterThan(0)
        expect(d.recipientRole.length).toBeGreaterThan(0)
        expect(['Sales Manager', 'Manager', 'Salesperson or Manager', 'Internal Analyst']).toContain(d.recipientRole)
      }
    }
  })

  it('freshness (data-through + age) is visible on every definition for the dashboard', () => {
    for (const p of PROFILES) {
      for (const d of m1rNotificationExamples(p, NOW)) {
        expect(d.dataThroughLabel).toBe('Aug 30, 2026')
        expect(d.ageLabel).toContain('Data through Aug 30, 2026')
        expect(d.ageLabel).toMatch(/updated (today|yesterday|\d+ days ago)/)
        expect(['current', 'aging']).toContain(d.freshnessState)
      }
    }
  })

  it('supported (accepted) metrics bind a real current value; recipient roles correct', () => {
    for (const p of PROFILES) {
      const [d1, d2, d3, d4] = m1rNotificationExamples(p, NOW)
      // 1: appt.show_rate bound to appointments family (Sales Manager)
      expect(d1.recipientRole).toBe('Sales Manager')
      expect(d1.metric_id).toBe('appt.show_rate')
      expect(d1.bound).toBe(true)
      expect(typeof d1.currentValue).toBe('number')
      expect(d1.currentValue!).toBeGreaterThanOrEqual(0)
      expect(d1.currentValue!).toBeLessThanOrEqual(1)
      // 4: gross reconciliation mismatches bound to CRM (Internal Analyst) — 0 on clean data
      expect(d4.recipientRole).toBe('Internal Analyst')
      expect(d4.metric_id).toBe('gross.reconciliation_mismatches')
      expect(d4.bound).toBe(true)
      expect(d4.currentValue).toBe(0)
      // 2: Manager, response time — bound to the FRESH Dashboard Response Time section
      const RT_ACTUAL: Record<string, number> = { 'serra-honda': 210, 'serra-nissan': 238, 'tony-serra-ford': 317 }
      expect(d2.recipientRole).toBe('Manager')
      expect(d2.metric_id).toBe('dashboard.response_time_actual_avg_min')
      expect(d2.bound).toBe(true)
      expect(d2.currentValue).toBe(RT_ACTUAL[p])
      expect(d2.dataThroughLabel).toBe('Aug 30, 2026') // fresh, not the Aug 17-23 readback
      void d3
    }
  })

  it('comm-dependent definition (#3) stays UNBOUND + inactive with NO fabricated value', () => {
    for (const p of PROFILES) {
      const d3 = m1rNotificationExamples(p, NOW)[2]
      expect(d3.recipientRole).toBe('Salesperson or Manager')
      expect(d3.metric_id).toBeNull() // unbound — Sales Communication quarantined
      expect(d3.bound).toBe(false)
      expect(d3.currentValue).toBeNull() // never a fabricated 0
      expect(d3.threshold).toBeNull()
      expect(d3.status).toBe('paused')
      expect(d3.unboundReason).toMatch(/quarantin/i)
      // it cannot be registered into the wizard/store while unbound
      expect(toPausedMetricAlertInput(d3)).toBeNull()
    }
  })

  it('mapping to the real wizard input forces status=paused (no activation path)', () => {
    const d1 = m1rNotificationExamples('serra-honda', NOW)[0]
    const input = toPausedMetricAlertInput(d1)
    expect(input).not.toBeNull()
    expect(input!.status).toBe('paused')
    expect(input!.email).toBe('') // no recipient bound → cannot send
    expect(input!.metric_id).toBe('appt.show_rate')
  })
})
