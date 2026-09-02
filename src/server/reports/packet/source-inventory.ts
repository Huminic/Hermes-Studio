/**
 * PKT-02-01 finite source-field inventory for the source-investigation-pending
 * metrics SW-013 and SW-014.
 *
 * This performs a BOUNDED, deterministic search of the accepted Leads schema (the
 * committed 57-header contract) for the EXACT authoritative fields each metric
 * requires. It NEVER derives, substitutes, or infers a value: if the direct field
 * is absent the metric stays `source_investigation_pending` with the precise
 * missing fields recorded. Fields that could be mistaken for a stand-in (generic
 * hours, adjusted response time, channel/direction) are enumerated as
 * `forbidden_proxies` and explicitly NOT used to satisfy a requirement.
 */
export class SourceInventoryError extends Error {}

export type RequiredCapability = {
  key: string
  description: string
  /** Exact header names that would DIRECTLY satisfy this capability. */
  acceptable_fields: Array<string>
  /** Fields that must NEVER be used as a proxy for this capability. */
  forbidden_proxies: Array<string>
}

export type CapabilityFinding = {
  key: string
  description: string
  present: boolean
  satisfied_by: string | null
  forbidden_proxies_present: Array<string>
}

export type SourceInventory = {
  metric_id: string
  disposition: 'source_investigation_pending' | 'source_satisfiable'
  searched_universe: Array<string>
  required: Array<CapabilityFinding>
  missing_fields: Array<string>
  evidence: string
}

export const SW013_REQUIRED: Array<RequiredCapability> = [
  {
    key: 'authoritative_opening_schedule',
    description:
      'Authoritative Serra Honda 21043 opening-hours schedule to compute the next opening + 15 minutes (America/New_York).',
    acceptable_fields: ['Dealership Opening Hours Schedule'],
    forbidden_proxies: [
      'Originated After Hours',
      'Actionable Response Datetime',
    ],
  },
  {
    key: 'first_human_response_timestamp',
    description:
      'Timestamp of the first HUMAN response (requires a human-actor classification, not any response event).',
    acceptable_fields: ['First Human Response Datetime'],
    forbidden_proxies: [
      'Actual Response Time (Min)',
      'Adjusted Response Time (Min)',
      'First Contact Attempt',
    ],
  },
]

export const SW014_REQUIRED: Array<RequiredCapability> = [
  {
    key: 'first_response_actor_classification',
    description:
      'Direct actor classification of the first response as auto-reply vs human (no channel/direction inference).',
    acceptable_fields: ['First Response Actor Type'],
    forbidden_proxies: [
      'Lead Source',
      'Contacted Indicator',
      'ADF/XML Indicator',
    ],
  },
  {
    key: 'human_touch_event_timestamps',
    description:
      'Response event timestamps sufficient to test that no HUMAN touch occurred within two hours of the first response.',
    acceptable_fields: ['First Human Touch Datetime'],
    forbidden_proxies: [
      'Actual Response Time (Min)',
      'Actionable Response Datetime',
    ],
  },
]

const REQUIRED_BY_METRIC: Record<string, Array<RequiredCapability>> = {
  'SW-013': SW013_REQUIRED,
  'SW-014': SW014_REQUIRED,
}

export function inventorySourceFields(
  metricId: string,
  headers: ReadonlyArray<string>,
): SourceInventory {
  if (!(metricId in REQUIRED_BY_METRIC)) {
    throw new SourceInventoryError(
      `no source-investigation inventory defined for ${metricId} (only SW-013/SW-014)`,
    )
  }
  const required = REQUIRED_BY_METRIC[metricId]
  const headerSet = new Set(headers)
  const findings: Array<CapabilityFinding> = required.map((cap) => {
    const satisfied_by =
      cap.acceptable_fields.find((f) => headerSet.has(f)) ?? null
    return {
      key: cap.key,
      description: cap.description,
      present: satisfied_by !== null,
      satisfied_by,
      forbidden_proxies_present: cap.forbidden_proxies.filter((f) =>
        headerSet.has(f),
      ),
    }
  })
  const missing_fields = findings.filter((f) => !f.present).map((f) => f.key)
  const disposition =
    missing_fields.length > 0
      ? 'source_investigation_pending'
      : 'source_satisfiable'
  const evidence =
    `Searched the ${headers.length} accepted Leads headers for the exact authoritative fields of ${metricId}. ` +
    (missing_fields.length > 0
      ? `Absent: ${missing_fields.join(', ')}. No proxy/inference used (forbidden proxies present but rejected: ` +
        `${findings.flatMap((f) => f.forbidden_proxies_present).join(', ') || 'none'}). ` +
        `Held open as source_investigation_pending; no value derived.`
      : `All required authoritative fields present; source is satisfiable.`)
  return {
    metric_id: metricId,
    disposition,
    searched_universe: [...headers],
    required: findings,
    missing_fields,
    evidence,
  }
}
