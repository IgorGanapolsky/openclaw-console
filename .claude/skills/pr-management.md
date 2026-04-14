---
description: "Full PR & branch management cycle — audit open PRs, identify orphan branches, merge green PRs, delete stale branches, verify CI, and provide build download links."
user-invocable: true
---

# PR Management & System Hygiene

Trigger: `/pr-management` or when user asks to review/merge PRs, clean branches, or check build status.

## Process

### Step 1: Audit Open PRs

```bash
REPO=$(git remote get-url origin | sed 's|.*github.com[:/]||;s|\.git$||')
gh pr list --state open --json number,title,headRefName,statusCheckRollup
```

Output a table: `| # | Title | Branch | CI Status |`

### Step 2: Identify Orphan Branches

```bash
# List remote branches not associated with any open PR
gh api repos/$REPO/branches --paginate --jq '.[].name' > /tmp/all_branches.txt
gh pr list --state open --json headRefName --jq '.[].headRefName' > /tmp/pr_branches.txt
comm -23 <(sort /tmp/all_branches.txt) <(sort /tmp/pr_branches.txt) | grep -v '^develop$\|^main$'
```

### Step 3: Merge Ready PRs

For each PR where all checks pass and it's approved:
```bash
gh pr merge $PR_NUMBER --squash --auto
```

### Step 4: Clean Up Stale Branches

```bash
# Delete remote branches that are fully merged
git fetch --prune
gh api repos/$REPO/branches --paginate --jq '.[].name' | while read branch; do
  if git merge-base --is-ancestor "origin/$branch" origin/develop 2>/dev/null; then
    echo "Merged: $branch"
  fi
done
```

### Step 5: Verify CI

```bash
gh run list --branch develop --limit 3
gh run list --branch main --limit 3
```

### Step 6: Report

Output summary with evidence:
- PRs merged (SHA, title)
- Branches deleted
- CI status on develop and main
- Any blockers found
