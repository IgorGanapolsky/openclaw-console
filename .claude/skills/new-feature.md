---
description: "Scaffold a new feature end-to-end — PRD, epic, tasks, branch, and initial implementation across iOS and Android."
user-invocable: true
---

# New Feature Scaffold

Trigger: `/new-feature <name>` or when user requests a new feature that spans multiple files/platforms.

## Process

### Step 1: Create PRD
Write `.claude/prds/<feature-name>.md` with:
- Problem statement
- Success criteria tied to North Star (Daily Active Approvers)
- Scope (iOS, Android, Skills gateway, or all)
- Non-goals

### Step 2: Create Epic
Write `.claude/epics/<feature-name>/epic.md` with:
- Title, status (backlog)
- Task breakdown (numbered)
- Dependencies

### Step 3: Create Tasks
For each task in the epic, write `.claude/epics/<feature-name>/NNN.md`:
- Clear deliverable
- Files to modify
- Acceptance criteria

### Step 4: Branch & Implement
```bash
git checkout develop
git pull origin develop
git checkout -b feat/<feature-name>
```

### Step 5: Platform Parity
- If the feature touches UI, implement in both SwiftUI and Jetpack Compose
- If the feature touches services, implement in both Swift and Kotlin
- Ensure protocol messages match `docs/protocol.md`

### Step 6: Tests
- ViewModel unit tests for both platforms
- Gateway integration tests if applicable
- Maestro E2E flow if user-facing
