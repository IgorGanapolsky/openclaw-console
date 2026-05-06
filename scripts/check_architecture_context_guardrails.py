#!/usr/bin/env python3
"""Validate architecture context, ADR, and agent-skill guardrails."""

from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ARCHITECTURE_SKILL_PATH = ".agents/skills/improve-codebase-architecture/SKILL.md"

REQUIRED_SNIPPETS: dict[str, tuple[str, ...]] = {
    "CONTEXT.md": (
        "Daily Active Approver",
        "Gateway",
        "Mobile Console",
        "Skill",
        "Task",
        "Incident",
        "Approval Request",
        "Gateway Connection",
        "Store Release",
        "Module",
        "Interface",
        "Depth",
        "Locality",
        "Leverage",
        "Mobile apps stay thin.",
        "Release readiness requires read-back evidence",
    ),
    "docs/adr/README.md": (
        "Architecture Decision Records",
        "Status",
        "Context",
        "Decision",
        "Consequences",
        "Verification",
    ),
    "docs/adr/0001-architecture-context-and-agent-skills.md": (
        "Status",
        "Accepted",
        "CONTEXT.md",
        ".agents/skills/",
        "scripts/check_architecture_context_guardrails.py",
    ),
    ARCHITECTURE_SKILL_PATH: (
        "---",
        "name: improve-codebase-architecture",
        "description:",
        "Read `CONTEXT.md`",
        "Read relevant ADRs",
        "Apply the deletion test",
        "python3 scripts/check_architecture_context_guardrails.py",
    ),
    ".github/instructions/architecture.instructions.md": (
        "CONTEXT.md",
        "docs/adr/",
        ARCHITECTURE_SKILL_PATH,
        "Gateway",
        "Daily Active Approver",
    ),
    "AGENTS.md": (
        "Architecture Agent Workflow",
        ARCHITECTURE_SKILL_PATH,
        "CONTEXT.md",
        "docs/adr/",
    ),
    "CLAUDE.md": (
        "Architecture Agent Workflow",
        ARCHITECTURE_SKILL_PATH,
        "CONTEXT.md",
        "docs/adr/",
    ),
    "GEMINI.md": (
        "Architecture Agent Workflow",
        ARCHITECTURE_SKILL_PATH,
        "CONTEXT.md",
        "docs/adr/",
    ),
    ".github/workflows/ci.yml": (
        "Architecture Context Guardrails",
        "python3 scripts/check_architecture_context_guardrails.py",
    ),
    "scripts/pre-commit": (
        "STAGED_ARCHITECTURE_CONTEXT",
        "check_architecture_context_guardrails.py",
    ),
    "scripts/pre-push": (
        "Checking architecture context guardrails",
        "check_architecture_context_guardrails.py",
    ),
}


def validate_skill_frontmatter(failures: list[str]) -> None:
    path = ROOT / ARCHITECTURE_SKILL_PATH
    if not path.exists():
        return

    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        failures.append(f"{ARCHITECTURE_SKILL_PATH}: missing YAML frontmatter opener")
        return

    frontmatter_end = text.find("\n---\n", 4)
    if frontmatter_end == -1:
        failures.append(f"{ARCHITECTURE_SKILL_PATH}: missing YAML frontmatter closer")
        return

    frontmatter = text[4:frontmatter_end]
    for field in ("name:", "description:"):
        if field not in frontmatter:
            failures.append(f"{ARCHITECTURE_SKILL_PATH}: frontmatter missing `{field}`")


def main() -> int:
    failures: list[str] = []

    adr_dir = ROOT / "docs/adr"
    if not adr_dir.is_dir():
        failures.append("missing docs/adr")

    for relative_path, snippets in REQUIRED_SNIPPETS.items():
        path = ROOT / relative_path
        if not path.exists():
            failures.append(f"missing {relative_path}")
            continue

        text = path.read_text(encoding="utf-8")
        for snippet in snippets:
            if snippet not in text:
                failures.append(f"{relative_path}: missing `{snippet}`")

    validate_skill_frontmatter(failures)

    if failures:
        print("Architecture context guardrails are incomplete:")
        for failure in failures:
            print(f" - {failure}")
        return 1

    print("Architecture context guardrails are present.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
