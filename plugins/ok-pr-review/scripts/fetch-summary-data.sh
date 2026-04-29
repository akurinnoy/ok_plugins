#!/bin/bash
#
# fetch-summary-data.sh — fetch PR data for the summary command
#
# Usage:
#   fetch-summary-data.sh <owner> <repo> <pr-number> [output-dir]
#
# Output directory structure:
#   metadata.json   PR metadata (title, body, author, branches, stats)
#   files.txt       Changed files with stats
#   diff.txt        Full unified diff
#
# Prints the output directory path on success.

set -euo pipefail

OWNER="${1:?Usage: fetch-summary-data.sh <owner> <repo> <pr-number> [output-dir]}"
REPO="${2:?}"
PR="${3:?}"
OUTPUT_DIR="${4:-/tmp/pr-summary-${OWNER}-${REPO}-${PR}}"

mkdir -p "$OUTPUT_DIR"

fetch_pids=()
fetch_labels=()

run_fetch() {
  local label="$1"
  local outfile="$2"
  shift 2
  "$@" > "$outfile" 2>&1 &
  fetch_pids+=($!)
  fetch_labels+=("$label")
}

run_fetch "metadata" "$OUTPUT_DIR/metadata.json" \
  gh pr view "$PR" --repo "$OWNER/$REPO" \
  --json title,body,author,headRefName,baseRefName,changedFiles,additions,deletions

run_fetch "files" "$OUTPUT_DIR/files.txt" \
  gh pr view "$PR" --repo "$OWNER/$REPO" \
  --json files --jq '.files[] | "\(.path) (\(.status), +\(.additions) -\(.deletions))"'

run_fetch "diff" "$OUTPUT_DIR/diff.txt" \
  gh pr diff "$PR" --repo "$OWNER/$REPO"

failed=0
for i in "${!fetch_pids[@]}"; do
  if ! wait "${fetch_pids[$i]}"; then
    echo "[ERROR] Failed to fetch: ${fetch_labels[$i]}" >&2
    failed=1
  fi
done

[[ $failed -eq 1 ]] && exit 1

echo "$OUTPUT_DIR"
