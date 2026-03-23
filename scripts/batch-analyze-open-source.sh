#!/usr/bin/env bash
# Analyze every immediate child directory under OPEN_SOURCE_ROOT with Memor.
# Outputs go to memor-v0/output/ with filenames prefixed by each repo slug (see src/index.ts).
#
# Usage:
#   bash scripts/batch-analyze-open-source.sh
#   OPEN_SOURCE_ROOT=/other/path bash scripts/batch-analyze-open-source.sh
#
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEMOR_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OPEN_SOURCE_ROOT="${OPEN_SOURCE_ROOT:?Set OPEN_SOURCE_ROOT to the directory containing repos to analyze}"

cd "$MEMOR_ROOT" || exit 1

if [[ ! -d "$OPEN_SOURCE_ROOT" ]]; then
  echo "Error: directory does not exist: $OPEN_SOURCE_ROOT" >&2
  exit 1
fi

echo "Building Memor…"
npm run build --silent

failed=""
count=0

for entry in "$OPEN_SOURCE_ROOT"/*; do
  [[ -e "$entry" ]] || continue
  [[ -d "$entry" ]] || continue
  [[ "$(basename "$entry")" == .* ]] && continue

  abs="$(cd "$entry" && pwd)"
  count=$((count + 1))
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "[$count] Memor: $abs"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if node dist/index.js "$abs"; then
    :
  else
    failed="${failed}  - $abs"$'\n'
  fi
done

echo ""
if [[ "$count" -eq 0 ]]; then
  echo "No subdirectories found under: $OPEN_SOURCE_ROOT"
  exit 0
fi

if [[ -n "$failed" ]]; then
  echo "Some analyses failed:" >&2
  echo -n "$failed" >&2
  exit 1
fi

echo "Batch finished: $count repo(s) under $OPEN_SOURCE_ROOT"
