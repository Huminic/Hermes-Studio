import { describe, it, expect, vi } from 'vitest'
import { sendTextReport } from '../../scripts/send-text-report'
import type { SmsSendFn } from '../../scripts/sms-report-sender'

const artifacts: Record<string, string> = {
  'out/serra-ford-text-report.txt': 'Hey team, 5 new leads today. — Georgia\n',
  'out/serra-ford-wrapup-text-report.txt': 'Evening team, 12 leads today. — Georgia\n',
}
const readFile = (p: string) => {
  const key = Object.keys(artifacts).find((k) => p.endsWith(k))
  if (!key) throw new Error(`unexpected read ${p}`)
  return artifacts[key]
}

describe('sendTextReport', () => {
  it('DRY-RUN: reads the report, prints nothing to a sender (never called)', async () => {
    const sender = vi.fn<SmsSendFn>()
    const { text, blast } = await sendTextReport({
      profile: 'serra-ford',
      fromDir: 'out',
      to: ['+15551230000', '+15551230001'],
      window: 'morning',
      send: false,
      deps: { readFile, sender },
    })
    expect(sender).not.toHaveBeenCalled()
    expect(blast.sent).toBe(false)
    expect(text).toBe('Hey team, 5 new leads today. — Georgia')
  })

  it('--send: calls the injected sender once per recipient with the EXACT text', async () => {
    const sender = vi.fn<SmsSendFn>().mockResolvedValue({ status: 'sent', external_id: 'sid_1' })
    const { text } = await sendTextReport({
      profile: 'serra-ford',
      fromDir: 'out',
      to: ['+15551230000', '+15551230001'],
      window: 'morning',
      send: true,
      deps: { readFile, sender },
    })
    expect(sender).toHaveBeenCalledTimes(2)
    expect(sender).toHaveBeenNthCalledWith(1, { profile: 'serra-ford', to: '+15551230000', text })
    expect(sender).toHaveBeenNthCalledWith(2, { profile: 'serra-ford', to: '+15551230001', text })
  })

  it('--window wrapup reads the -wrapup text-report variant', async () => {
    const sender = vi.fn<SmsSendFn>().mockResolvedValue({ status: 'sent' })
    const { text } = await sendTextReport({
      profile: 'serra-ford',
      fromDir: 'out',
      to: ['+15551230000'],
      window: 'wrapup',
      send: true,
      deps: { readFile, sender },
    })
    expect(text).toBe('Evening team, 12 leads today. — Georgia')
    expect(sender).toHaveBeenCalledWith({ profile: 'serra-ford', to: '+15551230000', text })
  })
})
