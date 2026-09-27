#!/usr/bin/env bash
# Host cron wrapper (N3.3) — Serra management reports + alerts, run INSIDE the
# live studio container (mirrors cron-catchup-followup.sh). One <job> per run:
#   morning   Daily AI Management Report   (email)
#   noon      Lead Source Report           (email)
#   wrapup    End-of-day Wrap-up           (email)
#   text      End-of-day text wrap-up      (SMS)
#   snapshot  Nightly lead-status snapshot (no send)   [N3.4]
#
# Iterates REPORT_PROFILES (space/comma separated; DEFAULT EMPTY so NOTHING runs
# until Major sets it). Each profile: gate on comms.reports.enabled + a non-empty
# management audience, run comms-preview for the right window into
# /tmp/reports/<profile>/<date>/, then the matching send script with --send using
# the store's configured management audience. Logs one line per profile per job.
#
# Every send self-guards (CommGate + prelaunch lock + comms_log); the gate here is
# a convenience so a disabled/empty store is skipped cleanly rather than erroring.
# Crontab lines: docs/serra-reports-cron.txt. No crontab edit lives here.
set -uo pipefail

JOB="${1:-}"
case "$JOB" in
  morning|noon|wrapup|text|snapshot) ;;
  *) echo "usage: $0 <morning|noon|wrapup|text|snapshot>"; exit 2 ;;
esac

STAMP="$(date -u +%FT%TZ)"
CID="$(docker ps --format '{{.Names}}' | grep -m1 '^hermes-studio-' || true)"
[ -n "$CID" ] || { echo "$STAMP [cron-serra-reports:$JOB] no hermes-studio container"; exit 0; }

# REPORT_PROFILES: space/comma separated. Empty ⇒ nothing to do (safe default).
RAW_PROFILES="${REPORT_PROFILES:-}"
RAW_PROFILES="${RAW_PROFILES//,/ }"
if [ -z "${RAW_PROFILES// }" ]; then
  echo "$STAMP [cron-serra-reports:$JOB] REPORT_PROFILES empty — nothing to do"
  exit 0
fi

DATE="$(date -u +%F)"

# Map job → (gate kind, preview window, send command). Text uses the wrapup
# artifacts; noon reuses the morning window (lead-source windows are report-day
# relative). Snapshot is handled separately (N3.4).
run_job_for_profile() {
  local profile="$1"
  local kind window sender extra=""
  case "$JOB" in
    morning) kind=reports; window=morning; sender="send-daily-report.ts" ;;
    noon)    kind=reports; window=morning; sender="send-lead-source-report.ts" ;;
    wrapup)  kind=reports; window=wrapup;  sender="send-daily-wrapup.ts" ;;
    text)    kind=text;    window=wrapup;  sender="send-text-report.ts"; extra="--window wrapup" ;;
  esac

  # Gate: skip a disabled/empty store cleanly (exit 10 = SKIP).
  if ! docker exec "$CID" sh -lc "cd /app && npx tsx scripts/report-gate.ts --profile '$profile' --kind '$kind'"; then
    echo "$STAMP [cron-serra-reports:$JOB] $profile skipped (gate)"
    return 0
  fi

  local outdir="/tmp/reports/$profile/$DATE"
  docker exec "$CID" sh -lc "cd /app && mkdir -p '$outdir' && npx tsx scripts/comms-preview.ts --profile '$profile' --window '$window' --out '$outdir'" \
    || { echo "$STAMP [cron-serra-reports:$JOB] $profile preview FAILED"; return 0; }

  if docker exec "$CID" sh -lc "cd /app && npx tsx scripts/$sender --profile '$profile' --from '$outdir' $extra --send"; then
    echo "$STAMP [cron-serra-reports:$JOB] $profile sent"
  else
    echo "$STAMP [cron-serra-reports:$JOB] $profile send FAILED"
  fi
}

run_snapshot_for_profile() {
  local profile="$1"
  if docker exec "$CID" sh -lc "cd /app && npx tsx scripts/lead-status-snapshot.ts --profile '$profile'"; then
    echo "$STAMP [cron-serra-reports:snapshot] $profile ok"
  else
    echo "$STAMP [cron-serra-reports:snapshot] $profile FAILED"
  fi
}

for profile in $RAW_PROFILES; do
  [ -n "$profile" ] || continue
  if [ "$JOB" = "snapshot" ]; then
    run_snapshot_for_profile "$profile"
  else
    run_job_for_profile "$profile"
  fi
done
