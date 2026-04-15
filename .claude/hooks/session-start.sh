#!/usr/bin/env bash
# Session start hook — runs when a new Claude Code session begins.
# Ensures environment is ready for development work.

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"

# Verify we're in the right repo
if [[ ! -f "$PROJECT_DIR/CLAUDE.md" ]]; then
  echo "WARNING: CLAUDE.md not found — are you in the openclaw-console repo?"
fi

# Check for uncommitted changes
if cd "$PROJECT_DIR" && git diff --quiet 2>/dev/null; then
  : # clean
else
  DIRTY_COUNT=$(git diff --name-only 2>/dev/null | wc -l | tr -d ' ')
  echo "NOTE: $DIRTY_COUNT uncommitted file(s) in working tree."
fi

# Check current branch
BRANCH=$(cd "$PROJECT_DIR" && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
echo "Branch: $BRANCH"
