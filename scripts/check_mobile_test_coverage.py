#!/usr/bin/env python3
"""Validate critical mobile flow coverage mapping."""

from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MAP_PATH = ROOT / "docs/testing/mobile-critical-flow-coverage.json"
REQUIRED_SURFACES = (
    ("android", "unit"),
    ("android", "e2e"),
    ("ios", "unit"),
    ("ios", "e2e"),
)


def load_map() -> dict:
    try:
        return json.loads(MAP_PATH.read_text(encoding="utf-8"))
    except FileNotFoundError:
        raise SystemExit(f"missing coverage map: {MAP_PATH.relative_to(ROOT)}")
    except json.JSONDecodeError as exc:
        raise SystemExit(f"invalid coverage map JSON: {exc}")


def validate_path(flow_id: str, platform: str, surface: str, raw_path: str) -> list[str]:
    errors: list[str] = []
    if not raw_path or raw_path.strip() != raw_path:
        errors.append(f"{flow_id}: {platform}.{surface} has an empty or untrimmed path")
        return errors

    path = Path(raw_path)
    if path.is_absolute():
        errors.append(f"{flow_id}: {platform}.{surface} path must be relative: {raw_path}")
        return errors

    resolved = (ROOT / path).resolve()
    try:
        resolved.relative_to(ROOT)
    except ValueError:
        errors.append(f"{flow_id}: {platform}.{surface} path escapes repo: {raw_path}")
        return errors

    if not resolved.exists():
        errors.append(f"{flow_id}: {platform}.{surface} path does not exist: {raw_path}")
    elif resolved.is_dir():
        errors.append(f"{flow_id}: {platform}.{surface} path must be a file: {raw_path}")

    return errors


def main() -> int:
    coverage = load_map()
    flows = coverage.get("critical_flows")
    if not isinstance(flows, list) or not flows:
        print("mobile test coverage map has no critical_flows")
        return 1

    errors: list[str] = []
    seen_ids: set[str] = set()

    for index, flow in enumerate(flows, start=1):
        flow_id = flow.get("id")
        if not isinstance(flow_id, str) or not flow_id:
            errors.append(f"flow #{index}: missing id")
            continue
        if flow_id in seen_ids:
            errors.append(f"{flow_id}: duplicate flow id")
        seen_ids.add(flow_id)

        for platform, surface in REQUIRED_SURFACES:
            entries = flow.get(platform, {}).get(surface)
            if not isinstance(entries, list) or not entries:
                errors.append(f"{flow_id}: missing {platform}.{surface} coverage")
                continue

            for raw_path in entries:
                if not isinstance(raw_path, str):
                    errors.append(f"{flow_id}: {platform}.{surface} contains non-string path")
                    continue
                errors.extend(validate_path(flow_id, platform, surface, raw_path))

    if errors:
        print("Mobile test coverage validation failed:")
        for error in errors:
            print(f" - {error}")
        return 1

    print(
        "Mobile test coverage map passed: "
        f"{len(flows)} critical flow(s), {len(REQUIRED_SURFACES)} required surface(s) each."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
