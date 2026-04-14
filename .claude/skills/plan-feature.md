---
description: "Plan a feature without implementing — create PRD and epic with task breakdown, estimate complexity, identify risks."
user-invocable: true
---

# Plan Feature

Trigger: `/plan-feature <name>` or when user wants to plan but not yet implement.

## Process

1. **Research**: Read existing code to understand current architecture and identify integration points.
2. **PRD**: Write `.claude/prds/<name>.md` with problem, success metrics, scope, and non-goals.
3. **Epic**: Write `.claude/epics/<name>/epic.md` with task breakdown.
4. **Risk Assessment**: Identify blockers, dependencies, and platform parity concerns.
5. **Report**: Present the plan to the user for approval before any implementation.

## Output Format

```markdown
## Feature: <name>

### Complexity: Low / Medium / High
### Platforms: iOS / Android / Skills / All
### Estimated Tasks: N

### Task Breakdown
1. [task] — [files affected] — [complexity]
2. ...

### Risks
- ...

### Dependencies
- ...
```
