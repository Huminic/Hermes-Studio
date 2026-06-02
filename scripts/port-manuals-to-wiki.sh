#!/usr/bin/env bash
#
# port-manuals-to-wiki.sh
#
# "Drink our own kool-aid": copies the 5 launch manuals into every profile's
# wiki on the production ~/.hermes volume, under
#   /root/.hermes/profiles/<profile>/knowledge/operating-manuals/
# so the Huminic agents can read their own processes + capabilities as wiki
# pages (knowledge/ is the agent-readable tree; this path is NOT canon/ or
# governance/, so it does not trip the KSG protected-tree gate).
#
# Source: docs/launch/manuals/*.md  (committed, version-controlled).
#
# SAFETY
#   * Dry-run by DEFAULT. Prints what it would do; changes nothing. Pass --apply.
#   * MUTATES PRODUCTION STATE — committed but intentionally NOT run by the
#     overnight pass (PENDING-OPERATOR-CONFIRMATION), same posture as
#     deploy-phase8-souls.sh.
#   * Additive + idempotent: writes into knowledge/operating-manuals/ only; it
#     never touches canon/, governance/, SOUL.md, config, or existing wiki pages.
#     Reverse it with: docker exec <c> rm -rf
#       /root/.hermes/profiles/<p>/knowledge/operating-manuals
#
# USAGE
#   scripts/port-manuals-to-wiki.sh                 # dry-run (default)
#   scripts/port-manuals-to-wiki.sh --apply         # actually port
#   scripts/port-manuals-to-wiki.sh --apply --only consultative-agent,huminic
#   CONTAINER=hermes-studio-... scripts/port-manuals-to-wiki.sh --apply
#
set -euo pipefail

APPLY=0
ONLY=""
while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --only) ONLY="${2:-}"; shift ;;
    -h|--help) sed -n '2,34p' "$0"; exit 0 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
  shift
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_DIR="$REPO_ROOT/docs/launch/manuals"
[ -d "$SRC_DIR" ] || { echo "ERROR: $SRC_DIR not found" >&2; exit 1; }

CONTAINER="${CONTAINER:-$(docker ps --format '{{.Names}}' | grep -m1 '^hermes-studio-' || true)}"
[ -n "$CONTAINER" ] || { echo "ERROR: no hermes-studio-* container; set CONTAINER=..." >&2; exit 1; }

# Build the profile list (all profile dirs, or the --only subset).
if [ -n "$ONLY" ]; then
  PROFILES="$(echo "$ONLY" | tr ',' ' ')"
else
  PROFILES="$(docker exec "$CONTAINER" sh -c "ls /root/.hermes/profiles" 2>/dev/null || true)"
fi
[ -n "$PROFILES" ] || { echo "ERROR: no profiles found" >&2; exit 1; }

echo "port-manuals-to-wiki"
echo "  container : $CONTAINER"
echo "  manuals   : $(ls "$SRC_DIR"/*.md | wc -l) file(s)"
echo "  mode      : $([ "$APPLY" -eq 1 ] && echo APPLY || echo DRY-RUN)"
echo

for p in $PROFILES; do
  dest="/root/.hermes/profiles/$p/knowledge/operating-manuals"
  echo "[$p] -> $dest"
  if [ "$APPLY" -eq 0 ]; then
    echo "  (dry-run) would mkdir -p and copy $(ls "$SRC_DIR"/*.md | wc -l) manuals"
    continue
  fi
  docker exec "$CONTAINER" sh -c "mkdir -p '$dest'"
  for f in "$SRC_DIR"/*.md; do
    docker cp "$f" "$CONTAINER:$dest/$(basename "$f")"
  done
  echo "  done"
done

echo
echo "processed profiles."
[ "$APPLY" -eq 0 ] && echo "DRY-RUN only. Re-run with --apply (requires operator confirmation)."
exit 0
