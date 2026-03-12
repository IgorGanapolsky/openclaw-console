#!/usr/bin/env python3
"""Compute North Star snapshot and enforce a paid-attribution guardrail.

North Star metric for this repo is Daily Active Approvers (DAA):
unique users with >=1 approval action in trailing 24h.

The script writes marketing/data/north_star.json and supports CI guardrail flags:
- --enforce-guardrail
- --require-posthog
- --require-posthog-when-active
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests

POSTHOG_HOST = os.getenv("POSTHOG_HOST", "https://us.i.posthog.com")


def _now_utc() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0)


def _load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        with path.open("r", encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, json.JSONDecodeError):
        return default


def _parse_iso_utc(value: Any) -> Optional[dt.datetime]:
    text = str(value or "").strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = dt.datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=dt.timezone.utc)
    return parsed.astimezone(dt.timezone.utc)


def _active_campaigns(repo_root: Path, active_statuses: List[str]) -> List[Dict[str, Any]]:
    campaigns_path = repo_root / "marketing" / "data" / "paid_campaigns.json"
    payload = _load_json(campaigns_path, {"campaigns": []})
    campaigns = payload.get("campaigns", []) if isinstance(payload, dict) else []
    if not isinstance(campaigns, list):
        return []

    active: List[Dict[str, Any]] = []
    for campaign in campaigns:
        if not isinstance(campaign, dict):
            continue
        status = str(campaign.get("status", "")).strip().lower()
        if status not in active_statuses:
            continue
        active.append(
            {
                "platform": campaign.get("platform", "unknown"),
                "status": campaign.get("status", ""),
                "launched_at": campaign.get("launched_at"),
                "daily_budget_usd": campaign.get("daily_budget_usd"),
            }
        )
    return active


def _outside_grace(campaigns: List[Dict[str, Any]], grace_days: int, now: dt.datetime) -> int:
    mature = 0
    for campaign in campaigns:
        launched = _parse_iso_utc(campaign.get("launched_at"))
        if launched is None:
            mature += 1
            continue
        if launched <= now - dt.timedelta(days=max(0, grace_days)):
            mature += 1
    return mature


def _query_posthog_daa_1d(api_key: str, project_id: str) -> int:
    query = {
        "query": {
            "kind": "HogQLQuery",
            "query": (
                "SELECT count(DISTINCT person_id) AS daa_1d "
                "FROM events "
                "WHERE timestamp > now() - interval 1 day "
                "AND event IN ('approval_submitted','approval_approved','approval_action_taken')"
            ),
        }
    }
    resp = requests.post(
        f"{POSTHOG_HOST}/api/projects/{project_id}/query/",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json=query,
        timeout=30,
    )
    resp.raise_for_status()
    payload = resp.json()

    # PostHog query API response includes a nested "results" table.
    results = payload.get("results")
    if isinstance(results, list) and results:
        first = results[0]
        if isinstance(first, list) and first:
            return int(first[0] or 0)
        return int(first or 0)

    # Fallback for older response wrappers.
    if isinstance(payload.get("result"), list) and payload["result"]:
        row = payload["result"][0]
        if isinstance(row, list) and row:
            return int(row[0] or 0)
    raise ValueError("Unexpected PostHog query response format")


def run(repo_root: Path, lookback_days: int, grace_days: int, active_statuses: List[str]) -> Dict[str, Any]:
    output_path = repo_root / "marketing" / "data" / "north_star.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    current_snapshot = _load_json(output_path, {})
    now = _now_utc()

    api_key = (
        os.getenv("POSTHOG_PERSONAL_API_KEY", "").strip()
        or os.getenv("POSTHOG_API_KEY", "").strip()
        or os.getenv("posthog_api_key", "").strip()
    )
    project_id = os.getenv("POSTHOG_PROJECT_ID", "").strip()

    errors: List[str] = []
    status = "ok"
    status_reason = ""
    daa_1d = int(current_snapshot.get("current", 0) or 0)

    active_campaigns = _active_campaigns(repo_root, active_statuses)
    active_outside_grace = _outside_grace(active_campaigns, grace_days, now)

    if api_key and project_id:
        try:
            daa_1d = _query_posthog_daa_1d(api_key, project_id)
        except Exception as exc:  # pragma: no cover - network/runtime guarded for CI stability
            status = "degraded"
            status_reason = f"posthog_query_failed: {exc}"
            errors.append(status_reason)
    else:
        status = "skipped"
        status_reason = "missing POSTHOG_PERSONAL_API_KEY/POSTHOG_API_KEY or POSTHOG_PROJECT_ID"

    guardrail_violated = (
        len(active_campaigns) > 0 and daa_1d == 0 and active_outside_grace > 0
    )

    payload = {
        "metric": "Daily Active Approvers (DAA)",
        "description": "Unique users who approved at least one action in the trailing 24h",
        "target": "$100/day after-tax from Pro subscriptions",
        "current": daa_1d,
        "last_updated": now.isoformat().replace("+00:00", "Z"),
        "status": status,
        "status_reason": status_reason,
        "lookback_days": lookback_days,
        "paid": {
            "active_campaign_count": len(active_campaigns),
            "active_campaigns_outside_grace_count": active_outside_grace,
            "campaign_grace_days": grace_days,
            "guardrail_violated": guardrail_violated,
            "guardrail_reason": (
                "active paid campaigns outside grace with zero DAA in trailing 24h"
                if guardrail_violated
                else ""
            ),
        },
        "query_diagnostics": {"errors": errors},
    }

    output_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return {
        "status": status,
        "output": str(output_path),
        "daa_1d": daa_1d,
        "active_campaign_count": len(active_campaigns),
        "active_campaigns_outside_grace_count": active_outside_grace,
        "guardrail_violated": guardrail_violated,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Compute North Star metric and enforce paid attribution guardrail")
    parser.add_argument("--repo-root", default=".", help="Repository root path")
    parser.add_argument("--lookback-days", type=int, default=30, help="Lookback window for campaign checks")
    parser.add_argument("--wqtu-window-days", type=int, default=7, help="Kept for workflow compatibility")
    parser.add_argument("--campaign-grace-days", type=int, default=7)
    parser.add_argument(
        "--active-statuses",
        default="active,running,enabled,live,serving,on",
        help="Comma-separated statuses treated as active campaigns",
    )
    parser.add_argument("--enforce-guardrail", action="store_true")
    parser.add_argument("--require-posthog", action="store_true")
    parser.add_argument("--require-posthog-when-active", action="store_true")
    args = parser.parse_args()

    statuses = [s.strip().lower() for s in args.active_statuses.split(",") if s.strip()]
    result = run(
        repo_root=Path(args.repo_root).resolve(),
        lookback_days=args.lookback_days,
        grace_days=args.campaign_grace_days,
        active_statuses=statuses,
    )
    print(json.dumps(result, indent=2))

    if args.require_posthog and result["status"] != "ok":
        return 2

    if (
        args.require_posthog_when_active
        and result["active_campaign_count"] > 0
        and result["status"] != "ok"
    ):
        return 3

    if args.enforce_guardrail and result["guardrail_violated"]:
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
