#!/usr/bin/env bash
# Host cron wrapper — Serra Honda 24h SMS follow-up, run inside the live studio
# container. The TS script SELF-GUARDS the 8am-9pm CT A2P window + dedups via the
# automation_runs ledger, so this may run hourly: off-window / already-sent runs
# no-op. Resolves the container dynamically (name changes each deploy).
# Added 2026-07-08. Remove this crontab entry to pause continuous follow-up.
set -euo pipefail
CID="$(docker ps --format '{{.Names}}' | grep -m1 '^hermes-studio-' || true)"
[ -n "$CID" ] || { echo "$(date -u +%FT%TZ) no hermes-studio container"; exit 0; }
exec docker exec "$CID" sh -lc 'cd /app && npx tsx scripts/catchup-followup.ts --profile serra-honda --send --days 2'
