import { describe, it, expect, vi } from 'vitest'
import {
  sendIntroText,
  buildIntroText,
  resolveIntroAgentName,
} from '../../scripts/send-intro-text'
import type { SmsSendFn } from '../../scripts/sms-report-sender'

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
      deps: { sender },
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
      deps: { sender, configAgentName: 'Ada' },
    })
    expect(agentName).toBe('Ada')
    expect(text).toContain('This is Ada with Tony Serra Ford')
  })
})
