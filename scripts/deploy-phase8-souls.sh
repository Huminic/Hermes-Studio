#!/usr/bin/env bash
#
# deploy-phase8-souls.sh — GAP-SG-001
#
# Deploys the 7 Phase-8 governor SOULs from the repo into the production
# ~/.hermes volume so the data-governor profiles exist at runtime:
#
#   docs/launch/agent-souls/governors/<slug>-data-governor.md
#     ->  /root/.hermes/profiles/<slug>-data-governor/SOUL.md   (in the studio container)
#
# SAFETY
#   * Dry-run by DEFAULT. It prints exactly what it would do and changes
#     nothing. Pass --apply to actually copy.
#   * This MUTATES PRODUCTION STATE. It is committed but intentionally NOT run
#     by the overnight blocker-fix pass — it is PENDING-OPERATOR-CONFIRMATION.
#   * Idempotent: re-running overwrites each SOUL.md with the repo copy. Any
#     pre-existing SOUL.md is backed up to SOUL.md.bak.<timestamp> in the
#     container first, so a copy is reversible.
#
# USAGE
#   scripts/deploy-phase8-souls.sh                 # dry-run (default)
#   scripts/deploy-phase8-souls.sh --apply         # actually deploy
#   CONTAINER=hermes-studio-... scripts/deploy-phase8-souls.sh --apply
#
set -euo pipefail

APPLY=0
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

# Resolve repo root from this script's location.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SRC_DIR="$REPO_ROOT/docs/launch/agent-souls/governors"

if [ ! -d "$SRC_DIR" ]; then
  echo "ERROR: source dir not found: $SRC_DIR" >&2
  exit 1
fi

# Resolve the studio container (mounts the ~/.hermes volume at /root/.hermes).
CONTAINER="${CONTAINER:-$(docker ps --format '{{.Names}}' | grep -m1 '^hermes-studio-' || true)}"
if [ -z "$CONTAINER" ]; then
  echo "ERROR: could not find a running hermes-studio-* container." >&2
  echo "       Set CONTAINER=... explicitly. (docker ps | grep hermes-studio)" >&2
  exit 1
fi

TS="$(date -u +%Y%m%dT%H%M%SZ)"

echo "deploy-phase8-souls — GAP-SG-001"
echo "  container : $CONTAINER"
echo "  source    : $SRC_DIR"
echo "  mode      : $([ "$APPLY" -eq 1 ] && echo APPLY || echo DRY-RUN)"
echo

count=0
for f in "$SRC_DIR"/*-data-governor.md; do
  [ -e "$f" ] || continue
  slug="$(basename "$f" .md)"                 # e.g. ford-of-columbia-data-governor
  dir="/root/.hermes/profiles/$slug"
  dst="$dir/SOUL.md"
  count=$((count + 1))

  echo "[$slug]"
  echo "  -> $dst"

  if [ "$APPLY" -eq 0 ]; then
    echo "  (dry-run) would mkdir -p $dir, back up any existing SOUL.md, then docker cp"
    echo
    continue
  fi

  # 1) ensure the profile dir exists
  docker exec "$CONTAINER" sh -c "mkdir -p '$dir'"
  # 2) back up an existing SOUL.md (reversibility)
  docker exec "$CONTAINER" sh -c "[ -f '$dst' ] && cp '$dst' '$dst.bak.$TS' || true"
  # 3) copy the repo SOUL into the volume
  docker cp "$f" "$CONTAINER:$dst"
  # 4) verify
  docker exec "$CONTAINER" sh -c "head -1 '$dst'"
  echo "  done"
  echo
done

echo "processed $count governor SOUL(s)."
if [ "$APPLY" -eq 0 ]; then
  echo "DRY-RUN only. Re-run with --apply to deploy (requires operator confirmation)."
fi
