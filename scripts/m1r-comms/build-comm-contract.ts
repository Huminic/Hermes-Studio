/**
 * Gate 4C1 — emit the machine-readable Enhanced Sales Communication Log (weekly) contract
 * mirror from the code constants, so the JSON can never silently drift from the module. A
 * test recomputes this and asserts byte-identity. Non-PII; declarations only.
 */
import fs from 'node:fs'
import path from 'node:path'
import { formatJsonFile } from '../m1r-evaluator/serialize'
import {
  ADMITTED_HOSTS,
  ALLOWED_LEAD_TYPES,
  BUSINESS_TIMEZONE,
  CATEGORICAL_SERVICE_SCAN_COLUMNS,
  COMM_CLASSIFIER_CHECKS,
  COMM_COLUMN_COUNT,
  COMM_HEADERS,
  COMM_WEEKLY_FAMILY,
  DEALER_IDENTITY,
  EXPECTED_REPORT_KIND,
  LEGACY_STRICT_COMM_FAMILY,
  PERMITTED_DERIVED_COLUMNS,
  REPORT_HOST,
  REPORT_PATH_PREFIX,
  REQUIRED_COMM_TYPE,
  REQUIRED_PROVENANCE_FIELDS,
  RESTRICTED_COLUMNS,
  SOURCE_HOST,
  SOURCE_PATH_PREFIX,
  TRANSFORM_VERSION,
} from '@/server/reports/comms/comm-family-contract'

export function commContractObject(): unknown {
  return {
    artifact: 'enhanced-sales-communication-log-weekly-contract',
    family: COMM_WEEKLY_FAMILY,
    contract_state: 'proposed_extension_pending_consumer_acceptance',
    capture_kind: 'browser_export',
    separate_from_legacy_strict_family: LEGACY_STRICT_COMM_FAMILY,
    not_a_relaxation_note:
      'This is a NEW weekly browser-export family. It does not reuse or relax the strict single-day scheduled Sales Communication family (sales_comm_log), which remains quarantined.',
    provenance: {
      source_host: SOURCE_HOST,
      report_host: REPORT_HOST,
      admitted_hosts: [...ADMITTED_HOSTS],
      source_path_prefix: SOURCE_PATH_PREFIX,
      report_path_prefix: REPORT_PATH_PREFIX,
      expected_report_kind: EXPECTED_REPORT_KIND,
      capture_id_pattern: 'VIN-COMM-WEEKLY-YYYYMMDD-<dealerId>',
      required_provenance_fields: [...REQUIRED_PROVENANCE_FIELDS],
    },
    schema: {
      column_count: COMM_COLUMN_COUNT,
      headers: [...COMM_HEADERS],
      restricted_columns: [...RESTRICTED_COLUMNS],
      permitted_derived_columns: [...PERMITTED_DERIVED_COLUMNS],
    },
    sales_only: {
      required_comm_type: REQUIRED_COMM_TYPE,
      allowed_lead_types: [...ALLOWED_LEAD_TYPES],
      service_parts_scan_columns: [...CATEGORICAL_SERVICE_SCAN_COLUMNS],
      row_scan_guard:
        'no categorical field may contain a \\b(service|parts)\\b token',
      message_content_excluded_from_scan:
        'Message Content is restricted and is never read as text for matching; it is converted in-memory to length/presence only.',
    },
    business_timezone: BUSINESS_TIMEZONE,
    rooftop_identity: DEALER_IDENTITY,
    classifier_checks: [...COMM_CLASSIFIER_CHECKS],
    privacy: {
      raw_repository_commit_allowed: false,
      restricted_raw_columns: [...RESTRICTED_COLUMNS],
      never_persisted: [
        'Customer',
        'User (employee name)',
        'Message Content (verbatim)',
        'phone/email',
        'any person name',
      ],
      pseudonym_scheme:
        'non-reversible goal-scoped truncated SHA-256 over salt||rooftop||kind||rawId; used only where rep/thread/person joins are necessary; blank id yields no token',
      content_derivation:
        'Message Content -> length + presence ONLY (in-memory), then discarded',
      transform_version: TRANSFORM_VERSION,
      committed_outputs:
        'aggregate admission proof + lineage only; per-row derived data is never committed',
    },
  }
}

async function main(): Promise<void> {
  const p = path.join(
    process.cwd(),
    'docs/halo/contract/enhanced-sales-communication-log-weekly-contract.json',
  )
  fs.writeFileSync(p, await formatJsonFile(commContractObject(), p))
  console.log(`wrote ${path.relative(process.cwd(), p)}`)
}

void main()
