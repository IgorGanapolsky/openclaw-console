---
description: "Load project context — current branch, open PRs, CI status, recent commits."
user-invocable: true
---

# Context

Load current project context for informed decision-making.

## Steps

1. Show current branch and recent commits:
```bash
git log --oneline -5
```

2. Show open PRs:
```bash
REPO=$(git remote get-url origin | sed 's|.*github.com[:/]||;s|\.git$||')
gh pr list --state open
```

3. Show CI status on develop:
```bash
gh run list --branch develop --limit 3
```

4. Show uncommitted work:
```bash
git status --short
git stash list
```

5. Summarize in a concise table.
