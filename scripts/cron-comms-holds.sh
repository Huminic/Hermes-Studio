#!/usr/bin/env bash
# Host cron wrapper — release Semantic Guardian / text-gate holds inside the live
# studio container, every minute. Releases after-hours deferrals at window open
# and unbacked holds once the knowledge is patched. Idempotent (atomic claim).
# Added 2026-07-09. Remove this crontab entry to pause hold release.
set -euo pipefail
CID="$(docker ps --format '{{.Names}}' | grep -m1 '^hermes-studio-' || true)"
[ -n "$CID" ] || { echo "$(date -u +%FT%TZ) no hermes-studio container"; exit 0; }
exec docker exec "$CID" sh -lc 'cd /app && npx tsx scripts/comms-holds-cron.ts'
