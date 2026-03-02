#!/bin/bash
set -euo pipefail

# This script sets up branch protection rules using the GitHub CLI
# Required environment variables:
# - GITHUB_TOKEN with admin:repo scope

# Function to check if GitHub CLI is installed
check_gh() {
  if ! command -v gh &> /dev/null; then
    echo "GitHub CLI (gh) is not installed. Please install it first."
    exit 1
  fi
}

# Function to check if logged in to GitHub CLI
check_auth() {
  if ! gh auth status &> /dev/null; then
    echo "Not logged in to GitHub CLI. Please run 'gh auth login' first."
    exit 1
  fi
}

# Set up develop branch protection
setup_develop_protection() {
  echo "Setting up develop branch protection..."
  gh api --method PUT "/repos/$GITHUB_REPOSITORY/branches/develop/protection" --input - <<'JSON'
{
  "required_status_checks": {
    "strict": false,
    "contexts": ["Android Tests", "iOS Build Check", "Security", "Seer Code Review"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true,
  "lock_branch": false,
  "allow_fork_syncing": false
}
JSON
}

# Set up main branch protection
setup_main_protection() {
  echo "Setting up main branch protection..."
  gh api --method PUT "/repos/$GITHUB_REPOSITORY/branches/main/protection" --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Android Tests", "iOS Build Check", "Security", "Seer Code Review"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true,
  "lock_branch": false,
  "allow_fork_syncing": false
}
JSON
}

# Main execution
main() {
  check_gh
  check_auth

  echo "Setting up branch protection rules for $GITHUB_REPOSITORY"

  # Create or update branch protection rules
  setup_develop_protection
  setup_main_protection

  echo "Branch protection rules set up successfully!"
}

main "$@"
