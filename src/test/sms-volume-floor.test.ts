import { describe, it, expect, vi } from 'vitest'

// Mock only readStudioConfig (preserve the module's other exports): 'floor-store'
// opts into a 20/24h floor; 'nofloor-store' sets none (dark-by-design).
vi.mock('../server/studio-config', async (importActual) => {
  const actual = await importActual<typeof import('../server/studio-config')>()
  return {
    ...actual,
    readStudioConfig: (profile: string) => ({
      config: {
        comms:
          profile === 'floor-store'
            ? { sms_volume_floor_24h: 20 }
            : { outbound_enabled: true },
      },
      source: 'file' as const,
    }),
  }
})

import { smsVolumeFloorCheck } from '../server/sentinel'

function storeWithSmsTotal(total: number) {
  return { countCommsByOutcome: () => ({ ok: total, error: 0, total }) } as any
}

async function run(profile: string, total: number) {
  return smsVolumeFloorCheck.run({
    profile,
    now: 1_700_000_000_000,
    store: storeWithSmsTotal(total),
  } as any)
}

describe('smsVolumeFloorCheck (AC8 — per-store blind-spot fix)', () => {
  it('CRITICAL when an expected-to-send store sent 0 in 24h', async () => {
    const findings = await run('floor-store', 0)
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('critical')
    expect(findings[0].key).toBe('notifications:floor-store:sms-volume-floor')
    expect(findings[0].title).toContain('No SMS')
  })

  it('WARNING when below floor but not fully dark', async () => {
    const findings = await run('floor-store', 5)
    expect(findings).toHaveLength(1)
    expect(findings[0].severity).toBe('warning')
    expect(findings[0].title).toContain('Only 5')
  })

  it('no finding when at/above the floor', async () => {
    expect(await run('floor-store', 20)).toHaveLength(0)
    expect(await run('floor-store', 99)).toHaveLength(0)
  })

  it('OPT-IN: no floor configured => never alerts (dark-by-design store)', async () => {
    expect(await run('nofloor-store', 0)).toHaveLength(0)
  })
})
