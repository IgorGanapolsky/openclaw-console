#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
HOOKS_DIR="$ROOT/.githooks"

chmod +x "$HOOKS_DIR/pre-commit" "$HOOKS_DIR/pre-push" "$ROOT/scripts/pre-commit" "$ROOT/scripts/pre-push"
git config core.hooksPath .githooks

echo "Configured core.hooksPath to .githooks"
