#!/usr/bin/env bash
# User prompt submit hook — runs before each user prompt is processed.
# Lightweight guardrails to catch common mistakes.

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"

# Block operations on wrong repository
remote_url=$(cd "$PROJECT_DIR" && git remote get-url origin 2>/dev/null || echo "")
if [[ "$remote_url" == *"automazeio/ccpm"* ]]; then
  echo "ERROR: Cannot modify CCPM template repository"
  exit 1
fi
