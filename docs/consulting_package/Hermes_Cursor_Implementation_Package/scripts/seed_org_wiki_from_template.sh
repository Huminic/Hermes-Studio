#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -ne 2 ]; then
  echo "Usage: seed_org_wiki_from_template.sh <org-profile-path> <package-path>"
  exit 1
fi
ORG_PATH="$1"
PACKAGE_PATH="$2"
TEMPLATE="$PACKAGE_PATH/scaffold/wiki-template"
cp -R "$TEMPLATE"/. "$ORG_PATH"/
echo "Seeded org wiki into $ORG_PATH"
