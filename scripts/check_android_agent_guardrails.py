#!/usr/bin/env python3
"""Validate Android agent workflow guardrails stay wired into the repo."""

from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

REQUIRED_SNIPPETS: dict[str, tuple[str, ...]] = {
    ".agents/skills/android-agent-workflow/SKILL.md": (
        "python3 scripts/check_android_cli.py",
        "android sdk",
        "android emulator",
        "android run",
        "android docs",
        "android skills",
        "python3 scripts/sync_app_icons.py --check",
        "./scripts/check-brand-parity.sh",
        ":app:compileDebugKotlin :app:testDebugUnitTest :app:lintDebug",
        "Keep summaries concise",
        "Never claim Android readiness until the checks above have been read back.",
    ),
    ".github/instructions/android.instructions.md": (
        "Android CLI",
        "check_android_cli.py",
        "android docs",
        "android skills",
        "scripts/sync_app_icons.py --check",
        "check-brand-parity.sh",
        "collectAsStateWithLifecycle",
        "Do not paste full Gradle logs",
    ),
    "AGENTS.md": (
        "Android Agent Workflow",
        ".agents/skills/android-agent-workflow/SKILL.md",
        "Android CLI",
    ),
    "CLAUDE.md": (
        "Android Agent Workflow",
        ".agents/skills/android-agent-workflow/SKILL.md",
        "Android CLI",
    ),
    "GEMINI.md": (
        "Android Agent Workflow",
        ".agents/skills/android-agent-workflow/SKILL.md",
        "Android CLI",
    ),
    ".github/workflows/ci.yml": (
        "Android Agent Guardrails",
        "python3 scripts/check_android_cli.py --allow-missing-tools",
        "python3 scripts/check_android_agent_guardrails.py",
    ),
    "scripts/check_android_cli.py": (
        "Android CLI: unavailable on PATH",
        "--allow-missing-tools",
        "--require-android-cli",
        "android init",
    ),
    "scripts/pre-commit": (
        "check_android_cli.py",
        "check_android_agent_guardrails.py",
    ),
    "scripts/pre-push": (
        "check_android_cli.py",
        "check_android_agent_guardrails.py",
    ),
}


def main() -> int:
    failures: list[str] = []

    for relative_path, snippets in REQUIRED_SNIPPETS.items():
        path = ROOT / relative_path
        if not path.exists():
            failures.append(f"missing {relative_path}")
            continue

        text = path.read_text(encoding="utf-8")
        for snippet in snippets:
            if snippet not in text:
                failures.append(f"{relative_path}: missing `{snippet}`")

    if failures:
        print("Android agent guardrails are incomplete:")
        for failure in failures:
            print(f" - {failure}")
        return 1

    print("Android agent guardrails are present.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
