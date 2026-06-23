import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkWidget,
  readWidgetTargets,
  type BrowserLauncher,
} from '@/server/widget-monitor'

/**
 * Build a fake browser whose page.evaluate returns queued results in call order:
 * 1st evaluate → { script, launcher }; 2nd evaluate → { channels, chat }.
 */
function fakeLauncher(opts: {
  script: boolean
  launcher: boolean
  channels?: Record<string, boolean>
  chat?: string | null
  throwOnLaunch?: boolean
}): BrowserLauncher {
  return async () => {
    if (opts.throwOnLaunch) throw new Error('browser not installed')
    const results: Array<unknown> = [
      { script: opts.script, launcher: opts.launcher },
      { channels: opts.channels ?? {}, chat: opts.chat ?? null },
    ]
    let i = 0
    const page = {
      goto: async () => undefined,
      evaluate: async () => results[i++],
      click: async () => undefined,
      waitForTimeout: async () => undefined,
    }
    return { newPage: async () => page as never, close: async () => undefined }
  }
}

const ENV = 'SENTINEL_WIDGET_TARGETS'
afterEach(() => {
  delete process.env[ENV]
  vi.restoreAllMocks()
})

describe('checkWidget', () => {
  it('passes when script + launcher + expected channel render', async () => {
    const r = await checkWidget('https://x.test', {
      launch: fakeLauncher({
        script: true,
        launcher: true,
        channels: { chat: true, callback: true, video: true },
        chat: 'https://studio.huminic.app/w/x-sales-chat',
      }),
      expectChannels: ['chat', 'video'],
      settleMs: 0,
    })
    expect(r.ok).toBe(true)
    expect(r.scriptPresent).toBe(true)
    expect(r.launcherPresent).toBe(true)
    expect(r.channels.video).toBe(true)
  })

  it('fails when the launcher does not render', async () => {
    const r = await checkWidget('https://x.test', {
      launch: fakeLauncher({ script: true, launcher: false }),
      settleMs: 0,
    })
    expect(r.ok).toBe(false)
    expect(r.launcherPresent).toBe(false)
    expect(r.error).toMatch(/launcher/)
  })

  it('fails when our embed script is absent', async () => {
    const r = await checkWidget('https://x.test', {
      launch: fakeLauncher({ script: false, launcher: false }),
      settleMs: 0,
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/embed script/)
  })

  it('fails when an expected channel is missing', async () => {
    const r = await checkWidget('https://x.test', {
      launch: fakeLauncher({
        script: true,
        launcher: true,
        channels: { chat: true }, // no video
      }),
      expectChannels: ['chat', 'video'],
      settleMs: 0,
    })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/video/)
  })

  it('reports infra (not a widget fault) when the browser cannot launch', async () => {
    const r = await checkWidget('https://x.test', {
      launch: fakeLauncher({ script: true, launcher: true, throwOnLaunch: true }),
      settleMs: 0,
    })
    expect(r.ok).toBe(false)
    expect(r.infra).toBe(true)
  })
})

describe('readWidgetTargets', () => {
  it('parses the env target map and drops empty url lists', () => {
    process.env[ENV] = JSON.stringify({
      'serra-honda': { urls: ['https://www.serrahonda.net'], expectChannels: ['chat', 'video'] },
      empty: { urls: [] },
    })
    const t = readWidgetTargets()
    expect(t).toHaveLength(1)
    expect(t[0].profile).toBe('serra-honda')
    expect(t[0].urls).toEqual(['https://www.serrahonda.net'])
  })

  it('returns [] on malformed config (fail-safe)', () => {
    process.env[ENV] = 'not json'
    expect(readWidgetTargets()).toEqual([])
  })
})
