# OpenClaw Console Context

This file defines the domain language agents must use when discussing architecture, refactors, and module design in this repository.

## Product Model

- OpenClaw Console: the native mobile control plane for supervising self-hosted OpenClaw agents.
- Daily Active Approver: a unique user who approves at least one agent action in a day. This is the North Star metric.
- Gateway: the user-hosted Node.js/TypeScript process that owns auth, state, HTTP, WebSocket streams, and skill coordination.
- Mobile Console: the iOS and Android apps. They are thin clients for display, secure storage, notifications, and biometric approvals.
- Skill: a server-side OpenClaw capability that creates tasks, incidents, approval requests, or operator summaries through the gateway.
- Agent: an OpenClaw worker or managed process visible through the console.
- Task: the primary unit of agent work. Tasks have status, steps, links, and optional chat.
- Task Step: one timeline entry inside a task, such as a log, tool call, output, error, or info update.
- Incident: an actionable operational problem surfaced to the operator.
- Approval Request: a dangerous action that requires explicit biometric confirmation before execution.
- Approval Decision: the operator response to an approval request, including biometric verification evidence.
- Gateway Connection: a saved mobile-to-gateway endpoint plus token and security settings.
- Store Release: a TestFlight, Firebase, App Store, or Play Store build with verified metadata and distribution read-back.

## Architecture Language

- Module: anything with an interface and implementation: a function, class, package, app layer, gateway slice, workflow, or script.
- Interface: everything a caller must know to use a module, including types, invariants, error modes, ordering, config, and side effects.
- Implementation: the code behind the interface.
- Depth: leverage at the interface. A deep module hides meaningful behavior behind a small interface.
- Shallow Module: a module whose interface is nearly as complicated as its implementation.
- Adapter: a concrete implementation at a seam.
- Locality: the amount of change, knowledge, and failure handling concentrated in one place instead of scattered across callers.
- Leverage: the useful behavior callers get from a module without learning its internals.

## Stable Seams

- Gateway state seam: `openclaw-skills/src/gateway/state-interface.ts` defines the state surface skills and routes should use.
- Protocol seam: `docs/protocol.md` and `openclaw-skills/src/types/protocol.ts` define mobile/gateway contracts.
- Approval seam: approval creation, policy, biometric requirement, and audit behavior belong behind the approval gate.
- Supply-chain guardrail seam: command/repository risk classification belongs behind supply-chain guardrails before policy auto-approval.
- Mobile storage seam: iOS Keychain and Android encrypted storage hide token persistence from UI code.
- Mobile networking seam: platform API/WebSocket services hide HTTP/WSS details from views and view models.
- Release verification seam: release workflows must read back distribution state instead of trusting upload commands.
- Agent workflow seam: repo-local skills under `.agents/skills/` define repeatable workflows for specialized agents.

## Non-Negotiable Decisions

- Mobile apps stay thin. Business intelligence and external integrations live in the gateway and skills.
- Approval flows require biometric verification. No production bypass path is acceptable.
- Production gateway traffic uses HTTPS/WSS. Plain HTTP/WS is local-development-only or explicit opt-in with warning.
- iOS/TestFlight app icon is canonical for brand parity. Android icons are generated from the iOS source asset.
- Release readiness requires read-back evidence from CI, App Store Connect, Firebase, or store metadata checks.
- Architecture changes must preserve or improve Daily Active Approvers, operator trust, release reliability, or agent navigability.

## Review Questions

- Does this change make the module deeper, or just move code around?
- Would deleting this module remove complexity, or scatter it across callers?
- Is the interface the right test surface?
- Does the change improve locality for failures, release evidence, security policy, or gateway state?
- Does the change make future agents more likely to modify the right file first?
