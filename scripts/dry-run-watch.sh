#!/usr/bin/env bash
# Dry-run readback watcher: polls the isolated-dev inbound for new complete
# deliveries (manifest present) and runs the reconcile on each. Read-only on
# deliveries; writes readback JSON. Isolated dev only.
INBOUND=/srv/ingest-dev/dry-run/inbound
LOG=/srv/ingest-dev/dry-run/watch.log
cd /home/ubuntu/hs-ingest-dev
echo "[$(date -u +%H:%M:%SZ)] watcher started" >> "$LOG"
while true; do
  shopt -s nullglob
  for m in "$INBOUND"/*/*/manifest.v1.json "$INBOUND"/*/*/manifest.json; do
    d=$(dirname "$m"); prof=$(basename "$(dirname "$d")"); cap=$(basename "$d")
    rb="/srv/ingest-dev/dry-run/readback/$prof/$cap.readback.json"
    if [ ! -e "$rb" ] || [ "$m" -nt "$rb" ]; then
      echo "[$(date -u +%H:%M:%SZ)] reconciling $prof/$cap" >> "$LOG"
      npx tsx scripts/dry-run-readback.ts "$d" >> "$LOG" 2>&1
    fi
  done
  sleep 20
done
