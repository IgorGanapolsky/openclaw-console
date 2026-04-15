# Context Discipline

## Plan-Mode-First

For any non-trivial task (3+ files, unclear scope, architectural choice), enter plan mode BEFORE implementation. This prevents wasted cycles from wrong assumptions.

Exceptions (skip plan mode):
- Single-file bug fixes
- Typo corrections
- Tasks with explicit, detailed instructions from user

## Context Compaction

Proactively compact context at **50% usage** — do not wait for automatic compression.

Signs you're approaching 50%:
- Multiple large file reads completed
- 3+ subagent results received
- Extended debugging session with many attempts

When compacting:
1. Summarize key findings and decisions so far
2. Note files modified and their purpose
3. List remaining work items
4. Drop verbose tool output, error traces, and exploration dead-ends

## Subtask Budget

Every subtask dispatched to a subagent must be completable within **50% of the subagent's context window**.

Rules:
- Break large tasks into focused subtasks touching 3-5 files max
- Each subtask gets a clear, bounded deliverable
- If a subtask returns "incomplete" or "ran out of context", it was scoped too broadly — decompose further next time
- Prefer 3 small subtasks over 1 large one

## Progressive Disclosure

Load knowledge incrementally, not all at once:
- Phase 1: Load only the rule/skill relevant to the current step
- Phase 2: Load additional context only when the step requires it
- Never preload "just in case" — every context byte has a cost
