#!/usr/bin/env bash
# Render print-quality PDFs from the committed prototype HTML cards using headless Chromium.
# Aggregate-only inputs (no PII). Local-only fixtures are NOT required — this reads the
# already-rendered HTML in docs/halo/evidence/m1r/provisional-cards/.
set -euo pipefail
DIR="docs/halo/evidence/m1r/provisional-cards"
CHROME="$(command -v chromium-browser || command -v chromium || command -v google-chrome)"
cd "$(git rev-parse --show-toplevel)"
for html in "$DIR"/*-internal-prototype.html; do
  pdf="${html%.html}.pdf"
  "$CHROME" --headless=new --disable-gpu --no-sandbox --no-pdf-header-footer \
    --print-to-pdf="$pdf" "file://$PWD/$html" >/dev/null 2>&1
  echo "rendered $pdf ($(pdfinfo "$pdf" 2>/dev/null | awk '/Pages/{print $2" pages"}'))"
done
