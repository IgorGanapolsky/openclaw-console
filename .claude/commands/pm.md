---
description: "PM pipeline — create PRD, epic, and tasks for a feature request."
user-invocable: true
---

# PM Pipeline

Activate for feature requests or multi-step work (3+ files).

## Steps

1. Create PRD at `.claude/prds/<name>.md`:
   - Problem statement
   - Success criteria (tied to Daily Active Approvers)
   - Scope and non-goals

2. Create Epic at `.claude/epics/<name>/epic.md`:
   - Status: backlog
   - Task list with dependencies

3. Create Tasks at `.claude/epics/<name>/NNN.md`:
   - Clear deliverable per task
   - Files affected
   - Acceptance criteria

4. If GitHub issues are enabled, sync:
```bash
REPO=$(git remote get-url origin | sed 's|.*github.com[:/]||;s|\.git$||')
gh issue create --repo "$REPO" --title "<task title>" --body-file <task-file>
```
