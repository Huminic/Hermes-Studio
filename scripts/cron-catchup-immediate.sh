#!/usr/bin/env bash
# Host cron wrapper — IMMEDIATE lead-engagement (first-touch) SMS, run inside the
# live studio container. Mirrors cron-catchup-followup.sh. The TS script
# SELF-GUARDS the 6-8pm + 8am CT immediate window and dedups via the
# automation_runs ledger, so this may run every 30m across the window band:
# off-window / already-sent runs no-op. Resolves the container dynamically.
#
# GENERIC BY DESIGN (no per-dealer code): iterates $IMMEDIATE_PROFILES (space- or
# comma-separated; default "serra-honda"). A profile with no ACTIVE new_lead/sms
# automation, or no VIN config, exits cleanly (skip) — so adding a dealer here is
# the ONLY activation step once they configure the automation in the UI. Widen
# IMMEDIATE_PROFILES (or set it to the discovered go-live set) to roll out more.
#
# Added 2026-07-13. Remove this crontab entry to pause continuous first-touch.
set -uo pipefail

PROFILES_RAW="${IMMEDIATE_PROFILES:-serra-honda}"
# normalize commas → spaces
PROFILES="$(printf '%s' "$PROFILES_RAW" | tr ',' ' ')"

CID="$(docker ps --format '{{.Names}}' | grep -m1 '^hermes-studio-' || true)"
[ -n "$CID" ] || { echo "$(date -u +%FT%TZ) no hermes-studio container"; exit 0; }

for P in $PROFILES; do
  [ -n "$P" ] || continue
  echo "$(date -u +%FT%TZ) immediate: $P"
  docker exec "$CID" sh -lc "cd /app && npx tsx scripts/catchup-immediate.ts --profile '$P' --send"
  rc=$?  # capture BEFORE any other command — a $(date) in the echo would clobber $? to 0 under bash
  [ "$rc" -eq 0 ] || echo "$(date -u +%FT%TZ) immediate: $P exit=$rc (off-window/no-automation/vin-timeout no-op is exit!=0 by design)"
done
exit 0
