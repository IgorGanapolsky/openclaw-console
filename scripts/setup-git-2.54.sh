#!/bin/bash
set -euo pipefail

echo "🚀 Setting up Git 2.54+ optimizations for OpenClaw Console..."

# Check Git version
git_version=$(git --version | awk '{print $3}')
echo "📋 Current Git version: $git_version"

# Apply OpenClaw Git configuration
config_file="$(pwd)/.gitconfig-openclaw"
if [[ -f "$config_file" ]]; then
  echo "⚙️  Applying OpenClaw Git configuration..."
  git config --global include.path "$config_file"
  echo "✅ Git configuration applied globally"
else
  echo "❌ .gitconfig-openclaw not found in current directory"
  exit 1
fi

# Enable configuration-based hooks (Git 2.9+)
if [[ -d "$(pwd)/.githooks" ]]; then
  echo "🔧 Enabling configuration-based pre-commit hooks..."
  git config --global core.hooksPath "$(pwd)/.githooks"
  echo "✅ Pre-commit hooks configured"
fi

# Enable additional Git 2.54+ features for large repositories
echo "🔧 Enabling additional Git 2.54+ optimizations..."

# Enable partial clone support for faster clones
git config --global fetch.uriProtocols "https,ssh"

# Enable feature.experimental for latest optimizations
git config --global feature.experimental true

# Enable advanced sparse-checkout for monorepo efficiency
git config --global core.sparseCheckout true
git config --global index.sparse true

# Enable commit-graph chains for better performance
git config --global core.commitGraph true
git config --global gc.writeCommitGraph true

echo "✅ Git 2.54+ setup complete!"
echo ""
echo "📊 Configuration summary:"
echo "   - HTTP rate limiting: 3 retries, 300s timeout"
echo "   - Geometric repacking: enabled"
echo "   - Multi-pack-index: enabled"
echo "   - Parallel fetching: 4 workers"
echo "   - Sparse-checkout: optimized"
echo "   - Commit-graph chains: enabled"
echo "   - Configuration-based hooks: enabled"
echo ""
echo "🎯 These optimizations improve CI/CD reliability and performance."