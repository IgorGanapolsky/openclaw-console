# Agent Workflow

OpenClaw uses issue-driven, multi-harness agent work. The portable settings file is `.agents/settings.json`; humans and agents should read it before changing code.

## High-ROI Defaults

- GitHub issues and PRs are the source of truth for planned work and verification.
- All code changes happen in worktree branches based on `develop`.
- Agents can use Codex, Claude Code, Gemini CLI, Android CLI, GitHub CLI, or another compatible harness, but the same repo guardrails apply.
- Completion requires evidence: direct state read-back, local validation, pushed branch, PR, and CI status read-back.
- Responses should stay concise and include only the exact evidence needed to understand state.

## Task Flow

1. Open an `Agent task` issue for non-trivial work.
2. Create a worktree branch from `origin/develop`.
3. Implement the smallest change that satisfies the issue.
4. Run the verification commands listed in `.agents/settings.json`.
5. Push the branch, open a PR, and link the issue.
6. Read back CI and merge state before claiming readiness.

This follows the same operating model described in Warp's open-source launch: agents do implementation heavy lifting, while humans focus on direction and verification.
