# Architecture Agent Instructions

- Read `CONTEXT.md` before proposing architecture changes.
- Read relevant ADRs in `docs/adr/` before changing stable decisions.
- Use `.agents/skills/improve-codebase-architecture/SKILL.md` for architecture refactors, testability work, module consolidation, or agent navigability improvements.
- Use OpenClaw domain terms from `CONTEXT.md`: Gateway, Mobile Console, Skill, Agent, Task, Task Step, Incident, Approval Request, Approval Decision, Gateway Connection, Store Release, and Daily Active Approver.
- Judge refactors by module depth, interface size, locality, leverage, and test surface.
- Do not move intelligence from the Gateway or Skills into mobile clients.
- Do not weaken biometric approval, TLS, release read-back, app icon parity, or store metadata verification.
- If a new durable domain term is introduced, update `CONTEXT.md`.
- If a durable architecture decision is made or rejected, add an ADR under `docs/adr/`.
