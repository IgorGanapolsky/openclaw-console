#!/usr/bin/env python3
"""Compute a North Star metric snapshot and optionally enforce a guardrail.

This script is intentionally resilient for scheduled CI runs:
- it always writes a JSON snapshot to marketing/data/north_star.json
- it only fails guardrail enforcement when a numeric DAA value is available
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--lookback-days", type=int, default=30)
    parser.add_argument("--wqtu-window-days", type=int, default=7)
    parser.add_argument("--enforce-guardrail", action="store_true")
    parser.add_argument("--require-posthog-when-active", action="store_true")
    return parser.parse_args()


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def parse_float(value: str) -> Optional[float]:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def read_existing_daa(snapshot_path: Path) -> Optional[float]:
    if not snapshot_path.exists():
        return None
    try:
        payload = json.loads(snapshot_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    raw = payload.get("daily_active_approvers")
    if isinstance(raw, (int, float)):
        return float(raw)
    return None


def main() -> int:
    args = parse_args()
    repo_root = Path(args.repo_root).resolve()
    output_path = repo_root / "marketing" / "data" / "north_star.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    posthog_key = os.getenv("POSTHOG_PERSONAL_API_KEY", "").strip()
    posthog_project = os.getenv("POSTHOG_PROJECT_ID", "").strip()
    posthog_configured = bool(posthog_key and posthog_project)

    if args.require_posthog_when_active and not posthog_configured:
        print("ERROR: POSTHOG_PERSONAL_API_KEY/POSTHOG_PROJECT_ID are required")
        return 2

    # Primary source: explicitly injected CI/runtime value.
    daa = parse_float(os.getenv("NORTH_STAR_DAA_CURRENT", ""))
    source = "env:NORTH_STAR_DAA_CURRENT" if daa is not None else "none"

    # Secondary source: previously persisted snapshot field.
    if daa is None:
        daa = read_existing_daa(output_path)
        if daa is not None:
            source = "snapshot:daily_active_approvers"

    min_daa = parse_float(os.getenv("NORTH_STAR_MIN_DAA", "1")) or 1.0
    status = "unknown"
    guardrail_ok = None

    if daa is not None:
        guardrail_ok = daa >= min_daa
        status = "ok" if guardrail_ok else "breach"

    snapshot = {
        "metric": "Daily Active Approvers (DAA)",
        "description": "Unique users who approve at least one agent action per day",
        "daily_active_approvers": daa,
        "minimum_guardrail": min_daa,
        "status": status,
        "guardrail_ok": guardrail_ok,
        "source": source,
        "lookback_days": args.lookback_days,
        "window_days": args.wqtu_window_days,
        "posthog_configured": posthog_configured,
        "last_updated": utc_now_iso(),
    }

    output_path.write_text(json.dumps(snapshot, indent=2) + "\n", encoding="utf-8")

    if args.enforce_guardrail and guardrail_ok is False:
        print(
            f"ERROR: North Star guardrail breached. "
            f"DAA={daa:.2f} < minimum={min_daa:.2f}"
        )
        return 1

    if guardrail_ok is None:
        print("INFO: No numeric DAA source available; snapshot written with status=unknown")
    else:
        print(f"INFO: Guardrail check status={status} (DAA={daa:.2f}, min={min_daa:.2f})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
