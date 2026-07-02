#!/bin/bash
set -euo pipefail

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')

if [ -z "$file_path" ]; then
  exit 0
fi

allowed_prefix="$HOME/.claude/ok-pr-review/"

case "$file_path" in
  "$allowed_prefix"*)
    exit 0
    ;;
  *)
    echo "{\"hookSpecificOutput\":{\"permissionDecision\":\"deny\"},\"systemMessage\":\"Write blocked: review agents may only write to $allowed_prefix. Attempted: $file_path\"}" >&2
    exit 2
    ;;
esac
