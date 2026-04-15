---
description: "Audit repository hygiene — check for stale branches, worktrees, large files, missing metadata, CI health, and .gitignore coverage."
user-invocable: true
---

# Repository Hygiene Audit

Trigger: `/hygiene-audit` or when user asks about repo health, cleanup, or organization.

## Checks

### 1. Worktree Audit
```bash
git worktree list
# Flag worktrees with no recent commits (>7 days old)
```

### 2. Branch Hygiene
```bash
# Branches with deleted remotes
git branch -vv | grep ': gone]'
# Branches merged into develop
git branch --merged origin/develop
```

### 3. Large Files
```bash
# Files over 1MB tracked by git
git ls-files | xargs -I{} sh -c 'size=$(wc -c < "$1" 2>/dev/null); [ "$size" -gt 1048576 ] && echo "$size $1"' _ {}
```

### 4. Store Metadata Completeness
- Android: `android/fastlane/metadata/android/en-US/` must have title, short_description, full_description, changelogs
- iOS: `ios/OpenClawConsole/fastlane/metadata/en-US/` must have name, subtitle, description, keywords, release_notes

### 5. CI Health
```bash
gh run list --limit 5
# Check for any failed runs on develop or main
```

### 6. .gitignore Coverage
- Verify no secrets (.env, credentials, API keys) are tracked
- Verify build artifacts are excluded
- Verify large binaries are excluded

## Output

Score each area 1-10, provide overall hygiene score, and list actionable fixes.
