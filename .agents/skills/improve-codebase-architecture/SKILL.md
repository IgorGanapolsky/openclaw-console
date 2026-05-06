---
name: improve-codebase-architecture
description: Use when improving OpenClaw Console architecture, finding refactor candidates, consolidating tightly coupled modules, making modules more testable, or making the repo easier for agents to navigate.
---

# Improve Codebase Architecture

Use this skill before proposing or implementing architecture refactors in OpenClaw Console.

## Required Reading

1. Read `CONTEXT.md` for OpenClaw domain language.
2. Read relevant ADRs in `docs/adr/`.
3. Read the relevant local architecture docs:
   - `docs/architecture.md`
   - `docs/protocol.md`
   - platform README files when touching iOS or Android

## Vocabulary

Use the architecture vocabulary from `CONTEXT.md`:

- Module
- Interface
- Implementation
- Depth
- Shallow Module
- Adapter
- Locality
- Leverage

Use OpenClaw domain terms from `CONTEXT.md` instead of inventing alternatives. For example, say Gateway, Skill, Task, Incident, Approval Request, Gateway Connection, Store Release, and Daily Active Approver.

## Process

1. Explore the area being changed.
2. Identify friction:
   - understanding one concept requires bouncing through many files
   - a module interface is almost as complicated as its implementation
   - policy, error handling, or release evidence is scattered across callers
   - tests cover helper functions but miss the real interface
   - a stable domain concept is missing from `CONTEXT.md`
3. Apply the deletion test:
   - if deleting a module makes complexity disappear, it was probably pass-through code
   - if deleting a module scatters complexity into callers, the module has value
4. Present or implement only high-leverage changes:
   - improve locality
   - reduce caller knowledge
   - make the interface a better test surface
   - preserve mobile-thin-client and gateway-owned intelligence
   - improve release read-back evidence or operator trust

## Output For Architecture Reviews

When asked to review architecture, list candidates with:

- Files
- Problem
- Proposed change
- Benefit in locality, leverage, and testability
- ADR conflict, if any

Do not propose broad rewrites. Prefer small changes that make one module deeper.

## Updating Context

If a real OpenClaw domain concept is missing, update `CONTEXT.md` in the same PR. If a decision should stop future agents from re-suggesting a rejected design, add an ADR under `docs/adr/`.

## Verification

Run:

```bash
python3 scripts/check_architecture_context_guardrails.py
```
