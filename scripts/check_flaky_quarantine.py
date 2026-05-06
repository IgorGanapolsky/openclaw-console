#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any


DEFAULT_MANIFEST = Path(".github/flaky-tests.json")
VALID_PLATFORMS = {"android", "ios", "gateway", "ci", "e2e"}
VALID_SKIP_STRATEGIES = {"retry_only", "ci_skip"}
ISSUE_RE = re.compile(r"^(https://github\.com/[^/]+/[^/]+/issues/\d+|#\d+)$")


@dataclass(frozen=True)
class ValidationResult:
    errors: list[str]
    warnings: list[str]
    quarantine_count: int


def _parse_expiry(raw: Any, index: int) -> date | None:
    if not isinstance(raw, str) or not raw:
        raise ValueError(f"quarantines[{index}].expires_on must be YYYY-MM-DD")
    try:
        return datetime.strptime(raw, "%Y-%m-%d").date()
    except ValueError as exc:
        raise ValueError(f"quarantines[{index}].expires_on must be YYYY-MM-DD") from exc


def _require_string(entry: dict[str, Any], key: str, index: int) -> str:
    value = entry.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"quarantines[{index}].{key} must be a non-empty string")
    return value.strip()


def validate_manifest(path: Path, today: date | None = None) -> ValidationResult:
    today = today or date.today()
    errors: list[str] = []
    warnings: list[str] = []

    if not path.exists():
        return ValidationResult([f"{path} is missing"], warnings, 0)

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return ValidationResult([f"{path} is invalid JSON: {exc.msg} at line {exc.lineno}"], warnings, 0)

    if not isinstance(payload, dict):
        return ValidationResult([f"{path} must contain a JSON object"], warnings, 0)

    if payload.get("version") != 1:
        errors.append("version must be 1")

    quarantines = payload.get("quarantines")
    if not isinstance(quarantines, list):
        return ValidationResult(errors + ["quarantines must be a list"], warnings, 0)

    seen_test_ids: set[str] = set()
    for index, entry in enumerate(quarantines):
        if not isinstance(entry, dict):
            errors.append(f"quarantines[{index}] must be an object")
            continue

        try:
            test_id = _require_string(entry, "test_id", index)
            platform = _require_string(entry, "platform", index)
            owner = _require_string(entry, "owner", index)
            issue = _require_string(entry, "issue", index)
            reason = _require_string(entry, "reason", index)
            skip_strategy = _require_string(entry, "skip_strategy", index)
            expires_on = _parse_expiry(entry.get("expires_on"), index)
        except ValueError as exc:
            errors.append(str(exc))
            continue

        if test_id in seen_test_ids:
            errors.append(f"quarantines[{index}].test_id duplicates {test_id}")
        seen_test_ids.add(test_id)

        if platform not in VALID_PLATFORMS:
            errors.append(
                f"quarantines[{index}].platform must be one of: {', '.join(sorted(VALID_PLATFORMS))}"
            )
        if skip_strategy not in VALID_SKIP_STRATEGIES:
            errors.append(
                f"quarantines[{index}].skip_strategy must be one of: {', '.join(sorted(VALID_SKIP_STRATEGIES))}"
            )
        if not ISSUE_RE.match(issue):
            errors.append(f"quarantines[{index}].issue must be a GitHub issue URL or #number")
        if expires_on and expires_on < today:
            errors.append(f"quarantines[{index}] expired on {expires_on.isoformat()}: {test_id}")
        elif expires_on and (expires_on - today).days <= 7:
            warnings.append(f"quarantines[{index}] expires soon on {expires_on.isoformat()}: {test_id}")
        if len(reason) < 12:
            errors.append(f"quarantines[{index}].reason must explain the flake clearly")
        if not owner.startswith("@"):
            warnings.append(f"quarantines[{index}].owner should be a GitHub handle: {owner}")

    return ValidationResult(errors, warnings, len(quarantines))


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate OpenClaw flaky test quarantine metadata.")
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    args = parser.parse_args()

    result = validate_manifest(args.manifest)
    for warning in result.warnings:
        print(f"warning: {warning}")
    for error in result.errors:
        print(f"error: {error}")

    if result.errors:
        print(f"Flaky quarantine validation failed: {len(result.errors)} error(s)")
        return 1

    print(f"Flaky quarantine validation passed: {result.quarantine_count} quarantined test(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
