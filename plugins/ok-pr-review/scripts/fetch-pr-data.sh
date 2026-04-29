#!/bin/bash
#
# fetch-pr-data.sh — fetch all PR data in parallel to local files
#
# Usage:
#   fetch-pr-data.sh <owner> <repo> <pr-number> [output-dir] [--delta-only]
#
# Options:
#   --delta-only   Only fetch commits and inline comments (for re-reviews)
#
# Output directory structure:
#   overview.txt          gh pr view (title, description, status, reviewers)
#   comments.txt          gh pr view --comments (top-level discussion)
#   files.txt             gh pr diff --name-only (changed file list)
#   diff.txt              gh pr diff (full unified diff)
#   inline-comments.json  gh api pulls/.../comments (inline review threads)
#   commits.json          gh api pulls/.../commits (commit list)
#   issue-<N>.txt         gh issue view (one per linked issue, fetched later)
#
# Prints the output directory path on success.
# Exits non-zero if any required fetch fails.

set -euo pipefail

OWNER="${1:?Usage: fetch-pr-data.sh <owner> <repo> <pr-number> [output-dir] [--delta-only]}"
REPO="${2:?}"
PR="${3:?}"
OUTPUT_DIR="${4:-/tmp/pr-review-${OWNER}-${REPO}-${PR}}"
DELTA_ONLY=0

# Check for --delta-only anywhere in args
for arg in "$@"; do
  [[ "$arg" == "--delta-only" ]] && DELTA_ONLY=1
done

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

if [[ $DELTA_ONLY -eq 0 ]]; then
  run_fetch "overview"         "$OUTPUT_DIR/overview.txt"          gh pr view "$PR" --repo "$OWNER/$REPO"
  run_fetch "comments"         "$OUTPUT_DIR/comments.txt"          gh pr view "$PR" --repo "$OWNER/$REPO" --comments
  run_fetch "files"            "$OUTPUT_DIR/files.txt"             gh pr diff "$PR" --repo "$OWNER/$REPO" --name-only
  run_fetch "diff"             "$OUTPUT_DIR/diff.txt"              gh pr diff "$PR" --repo "$OWNER/$REPO"
fi

run_fetch "inline-comments"  "$OUTPUT_DIR/inline-comments.json"  gh api "repos/$OWNER/$REPO/pulls/$PR/comments"
run_fetch "commits"          "$OUTPUT_DIR/commits.json"           gh api "repos/$OWNER/$REPO/pulls/$PR/commits" \
  --jq '[.[] | {sha: .sha[0:8], message: .commit.message | split("\n")[0], date: .commit.committer.date, author: .commit.author.name}]'

# Wait for all fetches and report any failures
failed=0
for i in "${!fetch_pids[@]}"; do
  if ! wait "${fetch_pids[$i]}"; then
    echo "[ERROR] Failed to fetch: ${fetch_labels[$i]}" >&2
    failed=1
  fi
done

[[ $failed -eq 1 ]] && exit 1

echo "$OUTPUT_DIR"
