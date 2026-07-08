/**
 * Shared lead-touch templates — the static first-touch + check-in copy spoken as
 * the dealership. Extracted here so the new-lead producers (vin-watcher,
 * lead-flow, marketing automations) share ONE source of voice without importing
 * each other (avoids module cycles). Re-exported from vin-watcher for existing
 * importers.
 */

/** Render the IMMEDIATE first-touch template. */
export function renderImmediate(
  firstName: string,
  dealer: string,
  vehicle: string | null,
): string {
  const veh = vehicle ? ` regarding your ${vehicle}` : ''
  return `Hi ${firstName}, this is ${dealer}. Thanks for your interest${veh}. Is there a day or time that works for you to swing by? Happy to help line that up. Reply STOP to opt out.`
}

/** Render the follow-up / 24h CHECK-IN template. */
export function renderCheckin(
  firstName: string,
  dealer: string,
  vehicle: string | null,
): string {
  const veh = vehicle ? ` regarding your ${vehicle}` : ''
  return `Hi ${firstName}, this is ${dealer}. We wanted to check in — are you being taken care of? Is there anything we can help with${veh}? Reply STOP to opt out.`
}
