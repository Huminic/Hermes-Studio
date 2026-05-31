/**
 * Brain ↔ guardian event publishing (SRS Tranche D.7).
 *
 * Reuses the existing /api/messaging/stream SSE bus rather than running
 * a parallel channel. Defines new event types for brain/guardian
 * activity and exposes a thin publisher other modules can call.
 *
 * Event types added by Tranche D:
 *   - brain_gate_decision (every DSG gate decision)
 *   - brain_lookup_miss (every recordLookupMiss)
 *   - brain_assumption_open (when an assumption is surfaced)
 *   - brain_assumption_resolved (when operator resolves)
 *   - brain_hunch_open (new hunch from KSG/DSG)
 *   - brain_self_improvement (Hermes file change detected)
 *   - brain_reconciliation_open (contradiction detected)
 */

import { publishMessagingEvent } from './messaging-hub-bus'

export type BrainEventType =
  | 'brain_gate_decision'
  | 'brain_lookup_miss'
  | 'brain_assumption_open'
  | 'brain_assumption_resolved'
  | 'brain_hunch_open'
  | 'brain_self_improvement'
  | 'brain_reconciliation_open'

export function publishBrainEvent(
  profile: string,
  type: BrainEventType,
  payload: Record<string, unknown>,
): void {
  publishMessagingEvent(profile, {
    type: 'campaign_progress', // reuse existing umbrella event type
    payload: { brain_event_type: type, ...payload },
    ts: Date.now(),
  })
}
