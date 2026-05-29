#!/usr/bin/env bash
# Idempotent. Safe to re-run against live profiles: never overwrites existing
# SOUL.md / config.yaml / mcp.json / .env.example / persona.md / AGENTS.md.
# Creates wiki tree directories (mkdir -p) and copies scaffold files only when
# the target file does not already exist (cp -n).
set -euo pipefail

ROOT="${HOME}/.hermes/profiles"
PLUGINS_ROOT="${HOME}/.hermes/studio-plugins"
PROFILES=(consultative-agent huminic huminic-data-governor serra-automotive serra-automotive-data-governor strukture strukture-data-governor)
ORG_PROFILES=(huminic serra-automotive strukture)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

for p in "${PROFILES[@]}"; do
  mkdir -p "$ROOT/$p"/{skills,cron}
  scaffold_src="$PACKAGE_ROOT/scaffold/profiles/$p"
  if [ -d "$scaffold_src" ]; then
    for f in distribution.yaml SOUL.md config.yaml mcp.json .env.example; do
      if [ -f "$scaffold_src/$f" ] && [ ! -f "$ROOT/$p/$f" ]; then
        cp "$scaffold_src/$f" "$ROOT/$p/$f"
        echo "Seeded $p/$f from scaffold"
      fi
    done
    if [ -f "$scaffold_src/skills/README.md" ] && [ ! -f "$ROOT/$p/skills/README.md" ]; then
      cp "$scaffold_src/skills/README.md" "$ROOT/$p/skills/README.md"
    fi
    if [ -f "$scaffold_src/cron/README.md" ] && [ ! -f "$ROOT/$p/cron/README.md" ]; then
      cp "$scaffold_src/cron/README.md" "$ROOT/$p/cron/README.md"
    fi
  fi
done

for org in "${ORG_PROFILES[@]}"; do
  mkdir -p "$ROOT/$org"/{canon,data,governance,templates,vocabulary,archive}
  mkdir -p "$ROOT/$org/knowledge"/{inbox,drafts,published,templates,workflows}
  mkdir -p "$ROOT/$org/knowledge/reports"/{specs,published}
  [ -f "$ROOT/$org/index.md" ] || touch "$ROOT/$org/index.md"
  [ -f "$ROOT/$org/log.md" ] || touch "$ROOT/$org/log.md"
  if [ ! -d "$ROOT/$org/.git" ]; then
    git -C "$ROOT/$org" init >/dev/null 2>&1 || true
  fi
done

mkdir -p "$PLUGINS_ROOT"
if [ -d "$PACKAGE_ROOT/scaffold/studio-plugins" ]; then
  for plugin_src in "$PACKAGE_ROOT/scaffold/studio-plugins"/*/; do
    plugin_name="$(basename "$plugin_src")"
    plugin_dest="$PLUGINS_ROOT/$plugin_name"
    if [ -d "$plugin_dest" ]; then
      echo "Studio plugin $plugin_name already installed, skipping"
    else
      cp -R "$plugin_src" "$plugin_dest"
      echo "Installed Studio plugin: $plugin_name"
    fi
  done
fi

echo "Base Hermes scaffold created under $ROOT"
echo "Studio plugins under $PLUGINS_ROOT"
