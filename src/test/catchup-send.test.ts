import { describe, expect, it, vi } from 'vitest'
import {
  runCatchupSends,
  effectivePerMinute,
  FAILED_RETRY_DELAY_MS,
  RATE_CAP_RULE,
  type CatchupSendItem,
  type CatchupSendOutcome,
} from '../server/catchup-send'

function item(phone: string): CatchupSendItem {
  return { phone, firstName: 'Test', leadId: phone }
}

/** A scripted sender: returns the queued outcome per call, tagging each with a run id. */
function scriptedSender(outcomes: CatchupSendOutcome[]) {
  let i = 0
  const calls: string[] = []
  const send = async (it: CatchupSendItem): Promise<CatchupSendOutcome> => {
    calls.push(it.phone)
    const base = outcomes[Math.min(i, outcomes.length - 1)]
    const o = { run_id: `run-${i}`, ...base }
    i++
    return o
  }
  return { send, calls }
}

describe('effectivePerMinute — one below the cap, override downward only', () => {
  it('defaults to cap-1', () => {
    expect(effectivePerMinute(5)).toBe(4)
    expect(effectivePerMinute(2)).toBe(1)
  })
  it('floors at 1 even for a cap of 1 or 0', () => {
    expect(effectivePerMinute(1)).toBe(1)
    expect(effectivePerMinute(0)).toBe(1)
  })
  it('lets an override lower the rate but never raise it above cap-1', () => {
    expect(effectivePerMinute(5, 2)).toBe(2) // lowered
    expect(effectivePerMinute(5, 10)).toBe(4) // clamped to cap-1
    expect(effectivePerMinute(5, 0)).toBe(1) // floored
  })
})

describe('runCatchupSends — pacing', () => {
  it('sleeps between sends (not after the last) at 60_000/perMinute', async () => {
    const { send, calls } = scriptedSender([{ action: 'sent', reason: 'ok' }])
    const sleeps: number[] = []
    const sleep = async (ms: number) => {
      sleeps.push(ms)
    }
    const summary = await runCatchupSends({
      items: [item('+1a'), item('+1b'), item('+1c')],
      perMinute: 4,
      deps: { send, sleep, log: () => {} },
    })
    expect(calls).toHaveLength(3)
    expect(summary.sent).toBe(3)
    // 3 sends → 2 inter-send gaps, each 60000/4 = 15000ms; no trailing sleep.
    expect(sleeps).toEqual([15000, 15000])
  })

  it('logs the pacing line', async () => {
    const { send } = scriptedSender([{ action: 'sent', reason: 'ok' }])
    const lines: string[] = []
    await runCatchupSends({
      items: [item('+1a')],
      perMinute: 4,
      deps: { send, sleep: async () => {}, log: (l) => lines.push(l) },
    })
    expect(lines.some((l) => l.startsWith('pacing: 4/min'))).toBe(true)
  })
})

describe('runCatchupSends — retryable ledger cleanup', () => {
  it('deletes the ledger row for a rate-cap block (so a retry is not blocked)', async () => {
    const { send } = scriptedSender([
      { action: 'blocked', reason: 'sms per-minute cap reached (5/5)', gate_rule: RATE_CAP_RULE },
    ])
    const deleteRun = vi.fn()
    const summary = await runCatchupSends({
      items: [item('+1a')],
      perMinute: 4,
      deps: { send, deleteRun, sleep: async () => {}, log: () => {} },
    })
    expect(deleteRun).toHaveBeenCalledWith('run-0')
    expect(summary.blockedByReason[RATE_CAP_RULE]).toBe(1)
    expect(summary.remaining).toBe(1)
  })

  it('KEEPS the ledger row for a terminal block (opt-out stays final)', async () => {
    const { send } = scriptedSender([
      { action: 'blocked', reason: 'recipient opted out', gate_rule: 'opt-out' },
    ])
    const deleteRun = vi.fn()
    const summary = await runCatchupSends({
      items: [item('+1a')],
      perMinute: 4,
      deps: { send, deleteRun, sleep: async () => {}, log: () => {} },
    })
    expect(deleteRun).not.toHaveBeenCalled()
    expect(summary.blockedByReason['opt-out']).toBe(1)
    expect(summary.remaining).toBe(0) // terminal blocks are not "owed" a re-send
  })

  it('deletes the ledger row for a send that finally fails', async () => {
    const { send } = scriptedSender([{ action: 'failed', reason: 'terminated' }])
    const deleteRun = vi.fn()
    await runCatchupSends({
      items: [item('+1a')],
      perMinute: 4,
      deps: { send, deleteRun, sleep: async () => {}, log: () => {} },
    })
    // both the first attempt and the retry are failed → both rows removed
    expect(deleteRun).toHaveBeenCalledWith('run-0')
    expect(deleteRun).toHaveBeenCalledWith('run-1')
  })
})

describe('runCatchupSends — retry on failure', () => {
  it('retries a failed send ONCE after the delay and counts it sent on success', async () => {
    // first attempt fails, retry succeeds
    let call = 0
    const send = async (): Promise<CatchupSendOutcome> => {
      call++
      return call === 1
        ? { action: 'failed', reason: 'terminated', run_id: 'run-0' }
        : { action: 'sent', reason: 'ok', run_id: 'run-1' }
    }
    const sleeps: number[] = []
    const deleteRun = vi.fn()
    const summary = await runCatchupSends({
      items: [item('+1a')],
      perMinute: 4,
      deps: { send, deleteRun, sleep: async (ms) => void sleeps.push(ms), log: () => {} },
    })
    expect(call).toBe(2)
    expect(sleeps).toContain(FAILED_RETRY_DELAY_MS)
    expect(summary.retried).toBe(1)
    expect(summary.sent).toBe(1)
    expect(summary.failed).toBe(0)
    // the first (failed) row was cleaned up; the retry's sent row is kept
    expect(deleteRun).toHaveBeenCalledWith('run-0')
    expect(deleteRun).not.toHaveBeenCalledWith('run-1')
    expect(summary.remaining).toBe(0)
  })

  it('gives up after one retry and reports the recipient as still owed', async () => {
    const { send } = scriptedSender([{ action: 'failed', reason: 'terminated' }])
    const summary = await runCatchupSends({
      items: [item('+1a')],
      perMinute: 4,
      deps: { send, deleteRun: () => {}, sleep: async () => {}, log: () => {} },
    })
    expect(summary.retried).toBe(1)
    expect(summary.failed).toBe(1)
    expect(summary.remaining).toBe(1)
  })
})

describe('runCatchupSends — end-of-run summary', () => {
  it('tallies sent / blocked-by-reason / failed / retried / remaining', async () => {
    // sent, rate-cap block, opt-out block, failed (then failed retry)
    const outcomes: CatchupSendOutcome[] = [
      { action: 'sent', reason: 'ok' },
      { action: 'blocked', reason: 'cap', gate_rule: RATE_CAP_RULE },
      { action: 'blocked', reason: 'DNC', gate_rule: 'dnc' },
      { action: 'failed', reason: 'terminated' },
    ]
    let i = 0
    const send = async (): Promise<CatchupSendOutcome> => {
      // clamp to last for the retry of the final failed item
      const o = { run_id: `run-${i}`, ...outcomes[Math.min(i, outcomes.length - 1)] }
      i++
      return o
    }
    const summary = await runCatchupSends({
      items: [item('+1a'), item('+1b'), item('+1c'), item('+1d')],
      perMinute: 4,
      deps: { send, deleteRun: () => {}, sleep: async () => {}, log: () => {} },
    })
    expect(summary.attempted).toBe(4)
    expect(summary.sent).toBe(1)
    expect(summary.blockedByReason).toEqual({ [RATE_CAP_RULE]: 1, dnc: 1 })
    expect(summary.failed).toBe(1)
    expect(summary.retried).toBe(1)
    // remaining = rate-capped (1) + finally-failed (1)
    expect(summary.remaining).toBe(2)
  })
})
