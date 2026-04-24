#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

git -C "$ROOT" config core.hooksPath "$ROOT/.githooks"
chmod +x "$ROOT/.githooks/pre-commit" "$ROOT/.githooks/pre-push" "$ROOT/scripts/pre-commit" "$ROOT/scripts/pre-push"

echo "Git hooks installed:"
echo "  pre-commit -> $ROOT/scripts/pre-commit"
echo "  pre-push   -> $ROOT/scripts/pre-push"
