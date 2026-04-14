---
description: "Reset local environment to a clean state — clean builds, prune branches, remove stale worktrees, verify tools."
user-invocable: true
---

# Fresh Start

Trigger: `/fresh-start` or when user wants to reset their local dev environment.

## Process

### 1. Clean Build Artifacts
```bash
make clean-all
```

### 2. Prune Git State
```bash
git fetch --prune origin
# Remove worktrees that are clean and not tied to open PRs
git worktree list --porcelain | grep "^worktree " | sed 's/^worktree //'
# For each: check if clean and if branch has open PR
```

### 3. Delete Merged Branches
```bash
git branch --merged origin/develop | grep -v 'develop\|main\|\*' | xargs -r git branch -d
```

### 4. Verify Tools
```bash
make setup-dev
```

### 5. Sync to Latest
```bash
git checkout develop
git pull origin develop
```

### 6. Report
- Artifacts cleaned
- Branches deleted
- Worktrees removed
- Tool verification results
