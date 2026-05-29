#!/usr/bin/env bash
set -euo pipefail
ROOT="${HOME}/.hermes/profiles"
PLUGINS_ROOT="${HOME}/.hermes/studio-plugins"
PROFILES=(consultative-agent huminic huminic-data-governor serra-automotive serra-automotive-data-governor strukture strukture-data-governor)

for p in "${PROFILES[@]}"; do
  for f in SOUL.md config.yaml mcp.json .env.example; do
    test -f "$ROOT/$p/$f" || { echo "Missing $ROOT/$p/$f"; exit 1; }
  done
  test -d "$ROOT/$p/skills" || { echo "Missing skills dir for $p"; exit 1; }
  test -d "$ROOT/$p/cron" || { echo "Missing cron dir for $p"; exit 1; }
done

for org in huminic serra-automotive strukture; do
  test -f "$ROOT/$org/index.md" || { echo "Missing index for $org"; exit 1; }
  test -f "$ROOT/$org/log.md" || { echo "Missing log for $org"; exit 1; }
  test -d "$ROOT/$org/knowledge/reports/specs" || { echo "Missing report specs for $org"; exit 1; }
  test -d "$ROOT/$org/knowledge/reports/published" || { echo "Missing report published dir for $org"; exit 1; }
  test -d "$ROOT/$org/.git" || { echo "Git not initialized for $org"; exit 1; }
done

test -d "$PLUGINS_ROOT" || { echo "Missing $PLUGINS_ROOT"; exit 1; }
test -f "$PLUGINS_ROOT/customer-console/plugin.yaml" || { echo "Missing customer-console plugin"; exit 1; }

echo "Validation passed."
