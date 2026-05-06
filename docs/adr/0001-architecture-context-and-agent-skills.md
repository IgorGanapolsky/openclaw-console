# ADR 0001: Architecture Context And Agent Skills

## Status

Accepted

## Context

OpenClaw Console is being modified by multiple agents across native mobile apps, TypeScript gateway code, GitHub Actions, release tooling, and store metadata. The repo already has strong operational rules, but architecture language was spread across `README.md`, `docs/architecture.md`, `llms.txt`, and agent directive files.

That made it easy for agents to re-litigate stable decisions, invent new terms for existing concepts, or make shallow refactors that improve file shape without improving operator value.

## Decision

Use root `CONTEXT.md` as the canonical architecture and domain glossary for agent work. Keep architectural decisions in `docs/adr/`. Add repo-local architecture skills under `.agents/skills/` with valid YAML frontmatter so Codex/Claude-style agents can load them without warnings.

Architecture review must use OpenClaw domain language such as Gateway, Skill, Task, Incident, Approval Request, Gateway Connection, Store Release, and Daily Active Approver.

## Consequences

- Agents have one place to learn OpenClaw domain language before proposing refactors.
- Architecture reviews can focus on module depth, locality, leverage, and test surface instead of generic cleanup.
- CI and hooks can catch missing or malformed architecture instructions.
- Future decisions that reject a recurring refactor should be recorded as ADRs instead of rediscovered repeatedly.

## Verification

`scripts/check_architecture_context_guardrails.py` verifies the context file, ADR directory, repo-local architecture skill, CI wiring, and hook wiring.
