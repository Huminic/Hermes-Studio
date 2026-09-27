import { describe, it, expect, vi } from 'vitest'
import {
  sendIntroText,
  buildIntroText,
  resolveIntroAgentName,
} from '../../scripts/send-intro-text'
import type { SmsSendFn } from '../../scripts/sms-report-sender'

/** Isolated one-time marker (avoids touching a real profile DB in tests). */
function marker() {
  const seen = new Set<string>()
  return {
    seen,
    wasSent: (_p: string, cell: string) => seen.has(cell),
    markSent: (_p: string, cell: string) => void seen.add(cell),
  }
}

const EXPECTED_FORD =
  "Good morning! This is Georgia with Tony Serra Ford. Starting today I'll be texting you a short end-of-day wrap-up " +
  "with key numbers on the dealership, and you'll see some new reports in your email. Over the coming weeks " +
  "you'll be able to chat with me here too. Have a great day and let's get 'em!"

describe('buildIntroText', () => {
  it('produces the exact approved copy', () => {
    expect(buildIntroText('Georgia', 'Tony Serra Ford')).toBe(EXPECTED_FORD)
  })
})

describe('resolveIntroAgentName', () => {
  it('prefers the flag, then config, then the per-profile default', () => {
    expect(resolveIntroAgentName({ profile: 'serra-ford' })).toBe('Georgia')
    expect(resolveIntroAgentName({ profile: 'serra-nissan' })).toBe('Caroline')
    expect(resolveIntroAgentName({ profile: 'serra-honda' })).toBe('Caroline')
    expect(resolveIntroAgentName({ profile: 'serra-ford', configAgentName: 'Ada' })).toBe('Ada')
    expect(resolveIntroAgentName({ profile: 'serra-ford', configAgentName: 'Ada', agentNameFlag: 'Zoe' })).toBe('Zoe')
  })
})

describe('sendIntroText', () => {
  it('DRY-RUN: never calls the sender', async () => {
    const sender = vi.fn<SmsSendFn>()
    const { text, blast } = await sendIntroText({
      profile: 'serra-ford',
      to: ['+15551230000'],
      storeName: 'Tony Serra Ford',
      send: false,
      deps: { sender },
    })
    expect(sender).not.toHaveBeenCalled()
    expect(blast.sent).toBe(false)
    expect(text).toBe(EXPECTED_FORD)
  })

  it('--send: calls the injected sender once per recipient with the EXACT copy', async () => {
    const sender = vi.fn<SmsSendFn>().mockResolvedValue({ status: 'sent' })
    const { text } = await sendIntroText({
      profile: 'serra-ford',
      to: ['+15551230000', '+15551230001'],
      storeName: 'Tony Serra Ford',
      send: true,
      deps: { sender, ...marker() },
    })
    expect(text).toBe(EXPECTED_FORD)
    expect(sender).toHaveBeenCalledTimes(2)
    expect(sender).toHaveBeenNthCalledWith(1, { profile: 'serra-ford', to: '+15551230000', text })
    expect(sender).toHaveBeenNthCalledWith(2, { profile: 'serra-ford', to: '+15551230001', text })
  })

  it('prefers comms.agent_name from config over the profile default', async () => {
    const sender = vi.fn<SmsSendFn>().mockResolvedValue({ status: 'sent' })
    const { agentName, text } = await sendIntroText({
      profile: 'serra-ford',
      to: ['+15551230000'],
      storeName: 'Tony Serra Ford',
      send: true,
      deps: { sender, configAgentName: 'Ada', ...marker() },
    })
    expect(agentName).toBe('Ada')
    expect(text).toContain('This is Ada with Tony Serra Ford')
  })

  // N3.5 — the intro is one-time per (profile, cell).
  it('ONE-TIME: refuses to resend to a cell already introduced', async () => {
    const m = marker()
    const sender = vi.fn<SmsSendFn>().mockResolvedValue({ status: 'sent' })
    const first = await sendIntroText({
      profile: 'serra-ford',
      to: ['+15551230000', '+15551230001'],
      storeName: 'Tony Serra Ford',
      send: true,
      deps: { sender, ...m },
    })
    expect(first.targets).toEqual(['+15551230000', '+15551230001'])
    expect(sender).toHaveBeenCalledTimes(2)
    expect(m.seen.size).toBe(2)

    // Second run to the same two + one new cell: only the new cell is texted.
    sender.mockClear()
    const second = await sendIntroText({
      profile: 'serra-ford',
      to: ['+15551230000', '+15551230001', '+15551230002'],
      storeName: 'Tony Serra Ford',
      send: true,
      deps: { sender, ...m },
    })
    expect(second.targets).toEqual(['+15551230002'])
    expect(second.skipped).toEqual(['+15551230000', '+15551230001'])
    expect(sender).toHaveBeenCalledTimes(1)
    expect(sender).toHaveBeenCalledWith({ profile: 'serra-ford', to: '+15551230002', text: second.text })
  })

  it('ONE-TIME: --force resends to already-introduced cells', async () => {
    const m = marker()
    m.seen.add('+15551230000')
    const sender = vi.fn<SmsSendFn>().mockResolvedValue({ status: 'sent' })
    const out = await sendIntroText({
      profile: 'serra-ford',
      to: ['+15551230000'],
      storeName: 'Tony Serra Ford',
      send: true,
      force: true,
      deps: { sender, ...m },
    })
    expect(out.targets).toEqual(['+15551230000'])
    expect(sender).toHaveBeenCalledTimes(1)
  })

  it('ONE-TIME: dry-run does not stamp the marker', async () => {
    const m = marker()
    const sender = vi.fn<SmsSendFn>()
    await sendIntroText({
      profile: 'serra-ford',
      to: ['+15551230000'],
      storeName: 'Tony Serra Ford',
      send: false,
      deps: { sender, ...m },
    })
    expect(sender).not.toHaveBeenCalled()
    expect(m.seen.size).toBe(0)
  })
})
