#!/usr/bin/env python3
"""Review velocity tracker.

Monitors review counts and ratings across both app stores,
detects velocity drops, and generates alerts. Tracks weekly
and monthly review velocity trends.

Designed to run on schedule via GitHub Actions.
"""

from __future__ import annotations

import argparse
import json
import datetime as dt
from pathlib import Path
from typing import Any, Dict, List, Optional


HISTORY_PATH = "marketing/data/review_velocity.json"
ALERT_THRESHOLD_PCT = -20  # Alert if velocity drops by 20%+


def load_velocity_history(repo_root: Path) -> Dict[str, Any]:
    path = repo_root / HISTORY_PATH
    if path.is_file():
        return json.loads(path.read_text(encoding="utf-8"))
    return {
        "snapshots": [],
        "alerts": [],
        "ios": {"total_reviews": 0, "avg_rating": 0.0},
        "android": {"total_reviews": 0, "avg_rating": 0.0},
    }


def save_velocity_history(repo_root: Path, history: Dict[str, Any]) -> None:
    path = repo_root / HISTORY_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(history, indent=2) + "\n", encoding="utf-8")


def fetch_ios_reviews_count(repo_root: Path) -> Dict[str, Any]:
    """Fetch iOS review data from ASC reviews history.

    In production, call App Store Connect API directly.
    Falls back to reading local history JSONL from ios-reviews-ops workflow.
    """
    history_path = repo_root / "marketing/data/asc_reviews_cache.json"
    if history_path.is_file():
        data = json.loads(history_path.read_text(encoding="utf-8"))
        return {
            "total_reviews": data.get("total_count", 0),
            "avg_rating": data.get("avg_rating", 0.0),
            "recent_count": data.get("recent_7d", 0),
        }
    # Placeholder when no real data available
    return {"total_reviews": 0, "avg_rating": 0.0, "recent_count": 0}


def fetch_android_reviews_count(repo_root: Path) -> Dict[str, Any]:
    """Fetch Android review data from Play Console.

    In production, integrate with Google Play Developer API.
    Falls back to local cache.
    """
    cache_path = repo_root / "marketing/data/play_reviews_cache.json"
    if cache_path.is_file():
        data = json.loads(cache_path.read_text(encoding="utf-8"))
        return {
            "total_reviews": data.get("total_count", 0),
            "avg_rating": data.get("avg_rating", 0.0),
            "recent_count": data.get("recent_7d", 0),
        }
    return {"total_reviews": 0, "avg_rating": 0.0, "recent_count": 0}


def compute_velocity(snapshots: List[Dict[str, Any]], window_days: int = 7) -> Dict[str, float]:
    """Compute review velocity (reviews per day) over a rolling window."""
    if len(snapshots) < 2:
        return {"ios_velocity": 0.0, "android_velocity": 0.0}

    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=window_days)
    recent = [s for s in snapshots if s.get("timestamp", "") >= cutoff.isoformat()]

    if len(recent) < 2:
        recent = snapshots[-2:]

    first = recent[0]
    last = recent[-1]

    ios_delta = last.get("ios_total", 0) - first.get("ios_total", 0)
    android_delta = last.get("android_total", 0) - first.get("android_total", 0)

    t0 = dt.datetime.fromisoformat(first["timestamp"])
    t1 = dt.datetime.fromisoformat(last["timestamp"])
    days = max(1, (t1 - t0).days)

    return {
        "ios_velocity": round(ios_delta / days, 2),
        "android_velocity": round(android_delta / days, 2),
        "window_days": days,
    }


def detect_velocity_drop(
    current_velocity: Dict[str, float],
    previous_velocity: Dict[str, float],
    threshold_pct: float = ALERT_THRESHOLD_PCT,
) -> List[Dict[str, Any]]:
    """Detect if review velocity has dropped below threshold."""
    alerts = []
    for platform in ["ios", "android"]:
        key = f"{platform}_velocity"
        curr = current_velocity.get(key, 0)
        prev = previous_velocity.get(key, 0)
        if prev > 0:
            change_pct = ((curr - prev) / prev) * 100
            if change_pct <= threshold_pct:
                alerts.append({
                    "platform": platform,
                    "previous_velocity": prev,
                    "current_velocity": curr,
                    "change_pct": round(change_pct, 1),
                    "severity": "high" if change_pct <= -50 else "medium",
                })
    return alerts


def generate_review_prompt_config(history: Dict[str, Any]) -> Dict[str, Any]:
    """Generate optimal in-app review prompt configuration based on velocity data."""
    snapshots = history.get("snapshots", [])

    # Default config
    config = {
        "completions_before_prompt": 3,
        "min_days_between_prompts": 30,
        "prompt_after_positive_experience": True,
        "suppress_during_low_rating_period": False,
    }

    if len(snapshots) >= 4:
        velocity = compute_velocity(snapshots, window_days=14)
        # If velocity is good, we can be less aggressive
        total_velocity = velocity.get("ios_velocity", 0) + velocity.get("android_velocity", 0)
        if total_velocity > 2.0:
            config["completions_before_prompt"] = 5
            config["min_days_between_prompts"] = 45
        elif total_velocity < 0.5:
            # Low velocity — be more aggressive with prompts
            config["completions_before_prompt"] = 2
            config["min_days_between_prompts"] = 21

    return config


def run_tracker(repo_root: Path) -> Dict[str, Any]:
    """Main tracking pipeline."""
    history = load_velocity_history(repo_root)

    ios_data = fetch_ios_reviews_count(repo_root)
    android_data = fetch_android_reviews_count(repo_root)

    now = dt.datetime.now(dt.timezone.utc).isoformat()
    snapshot = {
        "timestamp": now,
        "ios_total": ios_data["total_reviews"],
        "ios_rating": ios_data["avg_rating"],
        "ios_recent_7d": ios_data["recent_count"],
        "android_total": android_data["total_reviews"],
        "android_rating": android_data["avg_rating"],
        "android_recent_7d": android_data["recent_count"],
    }

    history["snapshots"].append(snapshot)
    # Keep last 90 snapshots
    history["snapshots"] = history["snapshots"][-90:]

    # Compute velocity
    current_velocity = compute_velocity(history["snapshots"], window_days=7)
    previous_velocity = compute_velocity(history["snapshots"][:-1], window_days=7) if len(history["snapshots"]) > 1 else current_velocity

    # Detect drops
    alerts = detect_velocity_drop(current_velocity, previous_velocity)
    if alerts:
        for alert in alerts:
            alert["timestamp"] = now
        history["alerts"].extend(alerts)
        history["alerts"] = history["alerts"][-50:]  # Keep last 50 alerts

    # Generate review prompt config
    prompt_config = generate_review_prompt_config(history)

    # Update history
    history["ios"] = {"total_reviews": ios_data["total_reviews"], "avg_rating": ios_data["avg_rating"]}
    history["android"] = {"total_reviews": android_data["total_reviews"], "avg_rating": android_data["avg_rating"]}
    history["latest_velocity"] = current_velocity
    history["review_prompt_config"] = prompt_config

    save_velocity_history(repo_root, history)

    return {
        "snapshot": snapshot,
        "velocity": current_velocity,
        "alerts": alerts,
        "prompt_config": prompt_config,
    }


def build_report(result: Dict[str, Any]) -> str:
    """Build a markdown report."""
    lines = [
        "# Review Velocity Report",
        "",
        f"**Date:** {result['snapshot']['timestamp']}",
        "",
        "## Current Snapshot",
        f"| Platform | Total Reviews | Avg Rating | Recent (7d) |",
        f"|----------|--------------|------------|-------------|",
        f"| iOS | {result['snapshot']['ios_total']} | {result['snapshot']['ios_rating']} | {result['snapshot']['ios_recent_7d']} |",
        f"| Android | {result['snapshot']['android_total']} | {result['snapshot']['android_rating']} | {result['snapshot']['android_recent_7d']} |",
        "",
        "## Velocity (reviews/day)",
        f"- iOS: **{result['velocity'].get('ios_velocity', 0)}** reviews/day",
        f"- Android: **{result['velocity'].get('android_velocity', 0)}** reviews/day",
    ]

    if result["alerts"]:
        lines.extend(["", "## Alerts"])
        for alert in result["alerts"]:
            lines.append(f"- **{alert['severity'].upper()}**: {alert['platform']} velocity dropped {alert['change_pct']}%")

    lines.extend([
        "",
        "## In-App Review Prompt Config",
        f"- Completions before prompt: {result['prompt_config']['completions_before_prompt']}",
        f"- Min days between prompts: {result['prompt_config']['min_days_between_prompts']}",
    ])

    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Review velocity tracker")
    parser.add_argument("--repo-root", default=".", help="Repository root")
    parser.add_argument("--report-out", default=None, help="Markdown report output path")
    args = parser.parse_args()

    result = run_tracker(Path(args.repo_root).resolve())
    report = build_report(result)
    print(report)

    if args.report_out:
        out_path = Path(args.report_out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(report, encoding="utf-8")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
