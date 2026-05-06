#!/usr/bin/env python3

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
SETTINGS = ROOT / ".agents/settings.json"

REQUIRED_TOP_LEVEL = {
    "version",
    "workflow",
    "response_style",
    "agent_harnesses",
    "required_context_files",
    "verification_commands",
}
REQUIRED_WORKFLOW = {
    "source_of_truth": "github_issues_and_pull_requests",
    "isolation": "worktree",
    "base_branch": "develop",
}
REQUIRED_COMPLETION = {
    "direct_state_readback",
    "local_validation",
    "pushed_branch",
    "pull_request",
    "ci_status_readback",
}
REQUIRED_VERIFICATION_COMMANDS = {
    "agent_workflow": "python3 scripts/check_agent_workflow_settings.py",
    "flaky_quarantine": "python3 scripts/check_flaky_quarantine.py",
    "android_guardrails": "python3 scripts/check_android_agent_guardrails.py",
}
REQUIRED_REFERENCES = {
    "AGENTS.md": [".agents/settings.json", "GitHub issues and PRs"],
    "CLAUDE.md": [".agents/settings.json", "GitHub issues and PRs"],
    "GEMINI.md": [".agents/settings.json", "GitHub issues and PRs"],
    ".github/workflows/ci.yml": ["Agent Workflow Guardrails", "scripts/check_agent_workflow_settings.py"],
    "scripts/pre-commit": ["check_agent_workflow_settings.py"],
    "scripts/pre-push": ["check_agent_workflow_settings.py"],
}


def load_settings() -> tuple[dict[str, Any] | None, list[str]]:
    if not SETTINGS.exists():
        return None, [".agents/settings.json is missing"]
    try:
        payload = json.loads(SETTINGS.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return None, [f".agents/settings.json is invalid JSON: {exc.msg} at line {exc.lineno}"]
    if not isinstance(payload, dict):
        return None, [".agents/settings.json must contain a JSON object"]
    return payload, []


def validate_settings(settings: dict[str, Any]) -> list[str]:
    errors: list[str] = []

    missing = REQUIRED_TOP_LEVEL - set(settings)
    if missing:
        errors.append(f"settings missing top-level keys: {', '.join(sorted(missing))}")

    if settings.get("version") != 1:
        errors.append("settings.version must be 1")

    workflow = settings.get("workflow")
    if not isinstance(workflow, dict):
        errors.append("settings.workflow must be an object")
    else:
        for key, expected in REQUIRED_WORKFLOW.items():
            if workflow.get(key) != expected:
                errors.append(f"settings.workflow.{key} must be {expected!r}")
        completion = workflow.get("completion_requires")
        if not isinstance(completion, list):
            errors.append("settings.workflow.completion_requires must be a list")
        else:
            missing_completion = REQUIRED_COMPLETION - set(completion)
            if missing_completion:
                errors.append(
                    "settings.workflow.completion_requires missing: "
                    + ", ".join(sorted(missing_completion))
                )

    response_style = settings.get("response_style")
    if not isinstance(response_style, dict):
        errors.append("settings.response_style must be an object")
    else:
        if response_style.get("mode") != "codex_concise":
            errors.append("settings.response_style.mode must be 'codex_concise'")
        if response_style.get("include_evidence") is not True:
            errors.append("settings.response_style.include_evidence must be true")

    harnesses = settings.get("agent_harnesses")
    if not isinstance(harnesses, list) or len(harnesses) < 3:
        errors.append("settings.agent_harnesses must list at least three harnesses")
    else:
        names = {entry.get("name") for entry in harnesses if isinstance(entry, dict)}
        for required in {"Codex", "Claude Code", "Gemini CLI", "GitHub CLI"}:
            if required not in names:
                errors.append(f"settings.agent_harnesses missing {required}")

    context_files = settings.get("required_context_files")
    if not isinstance(context_files, list):
        errors.append("settings.required_context_files must be a list")
    else:
        for raw_path in context_files:
            if not isinstance(raw_path, str) or not (ROOT / raw_path).exists():
                errors.append(f"required context file missing or invalid: {raw_path!r}")

    commands = settings.get("verification_commands")
    if not isinstance(commands, dict):
        errors.append("settings.verification_commands must be an object")
    else:
        for key, expected in REQUIRED_VERIFICATION_COMMANDS.items():
            if commands.get(key) != expected:
                errors.append(f"settings.verification_commands.{key} must be {expected!r}")

    return errors


def validate_wiring() -> list[str]:
    errors: list[str] = []
    for raw_path, fragments in REQUIRED_REFERENCES.items():
        path = ROOT / raw_path
        if not path.exists():
            errors.append(f"{raw_path} is missing")
            continue
        text = path.read_text(encoding="utf-8")
        for fragment in fragments:
            if fragment not in text:
                errors.append(f"{raw_path} missing required reference: {fragment}")
    return errors


def main() -> int:
    settings, errors = load_settings()
    if settings is not None:
        errors.extend(validate_settings(settings))
    errors.extend(validate_wiring())

    for error in errors:
        print(f"error: {error}")
    if errors:
        print(f"Agent workflow settings validation failed: {len(errors)} error(s)")
        return 1

    harness_count = len(settings.get("agent_harnesses", [])) if settings else 0
    print(f"Agent workflow settings validation passed: {harness_count} harness(es)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
