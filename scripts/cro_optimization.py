#!/usr/bin/env python3
"""Conversion rate optimization (CRO) automation.

Manages screenshot A/B testing variants, localized metadata for top markets,
and title/subtitle experiments. Tracks experiment results and recommends
winning variants.

Designed to run weekly via GitHub Actions.
"""

from __future__ import annotations

import argparse
import json
import datetime as dt
import zlib
from pathlib import Path
from typing import Any, Dict, List, Optional

# Top 5 markets by revenue for timer/fitness apps
TOP_MARKETS = {
    "en-US": "English (US)",
    "ja": "Japanese",
    "de-DE": "German",
    "ko": "Korean",
    "pt-BR": "Portuguese (Brazil)",
}

# Localized short descriptions for top markets
LOCALIZED_SHORT_DESCRIPTIONS = {
    "en-US": "Random timer for HIIT, drills & party games. Set a range — boom.",
    "ja": "HIIT、ドリル、パーティーゲーム用ランダムタイマー。範囲を設定して、スタート。",
    "de-DE": "Zufallstimer für HIIT, Drills & Partyspiele. Bereich festlegen — los!",
    "ko": "HIIT, 드릴, 파티 게임을 위한 랜덤 타이머. 범위 설정 후 시작!",
    "pt-BR": "Timer aleatório para HIIT, treinos e jogos. Defina um intervalo — boom.",
}

LOCALIZED_TITLES = {
    "en-US": "OpenClaw Console",
    "ja": "ランダム タクティカル タイマー",
    "de-DE": "Zufalls-Taktiktimer",
    "ko": "랜덤 전술 타이머",
    "pt-BR": "Timer Tático Aleatório",
}

EXPERIMENTS_PATH = "marketing/data/cro_experiments.json"
LOCALIZATION_STATUS_PATH = "marketing/data/localization_status.json"


def load_experiments(repo_root: Path) -> Dict[str, Any]:
    path = repo_root / EXPERIMENTS_PATH
    if path.is_file():
        return json.loads(path.read_text(encoding="utf-8"))
    return {"experiments": [], "active_variants": {}}


def save_experiments(repo_root: Path, data: Dict[str, Any]) -> None:
    path = repo_root / EXPERIMENTS_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def create_title_experiment(repo_root: Path) -> Dict[str, Any]:
    """Create a title A/B test experiment for Google Play."""
    base_title = "OpenClaw Console"
    variants = [
        {"id": "control", "title": base_title},
        {"id": "variant_a", "title": "OpenClaw Console - HIIT & Drills"},
        {"id": "variant_b", "title": "Tactical Timer - Random Intervals"},
        {"id": "variant_c", "title": "Random Workout Timer"},
    ]

    experiment = {
        "id": format(zlib.crc32(f"title-{dt.date.today().isoformat()}".encode()) & 0xFFFFFFFF, "08x"),
        "type": "title_ab_test",
        "platform": "android",
        "created": dt.datetime.now(dt.timezone.utc).isoformat(),
        "status": "proposed",
        "variants": variants,
        "metric": "conversion_rate",
        "duration_days": 14,
        "notes": "Test title variants focusing on different keyword strategies",
    }
    return experiment


def create_short_description_experiment(repo_root: Path) -> Dict[str, Any]:
    """Create a short description A/B test for Google Play."""
    variants = [
        {"id": "control", "text": "Random timer for HIIT, drills & party games. Set a range — boom."},
        {"id": "variant_a", "text": "Surprise timer for workouts, games & drills. Never know when it fires!"},
        {"id": "variant_b", "text": "Unpredictable interval timer for HIIT, boxing & reaction training."},
    ]

    experiment = {
        "id": format(zlib.crc32(f"desc-{dt.date.today().isoformat()}".encode()) & 0xFFFFFFFF, "08x"),
        "type": "short_description_ab_test",
        "platform": "android",
        "created": dt.datetime.now(dt.timezone.utc).isoformat(),
        "status": "proposed",
        "variants": variants,
        "metric": "conversion_rate",
        "duration_days": 14,
    }
    return experiment


def create_screenshot_experiment(repo_root: Path) -> Dict[str, Any]:
    """Create a screenshot order experiment."""
    variants = [
        {
            "id": "control",
            "order": ["hero_timer", "alarm_screen", "settings", "loop_mode"],
            "description": "Current order: timer > alarm > settings > loop",
        },
        {
            "id": "variant_a",
            "order": ["hero_alarm", "loop_mode", "hero_timer", "settings"],
            "description": "Lead with alarm impact > loop > timer > settings",
        },
        {
            "id": "variant_b",
            "order": ["use_case_hiit", "hero_timer", "alarm_screen", "loop_mode"],
            "description": "Lead with use case > timer > alarm > loop",
        },
    ]

    experiment = {
        "id": format(zlib.crc32(f"screenshot-{dt.date.today().isoformat()}".encode()) & 0xFFFFFFFF, "08x"),
        "type": "screenshot_ab_test",
        "platform": "both",
        "created": dt.datetime.now(dt.timezone.utc).isoformat(),
        "status": "proposed",
        "variants": variants,
        "metric": "conversion_rate",
        "duration_days": 21,
    }
    return experiment


def ensure_localized_metadata(repo_root: Path) -> Dict[str, Any]:
    """Ensure localized metadata exists for top 5 markets."""
    status = {}

    for locale, lang_name in TOP_MARKETS.items():
        # Android metadata
        android_dir = repo_root / f"android/fastlane/metadata/android/{locale}"
        android_dir.mkdir(parents=True, exist_ok=True)

        title_path = android_dir / "title.txt"
        short_desc_path = android_dir / "short_description.txt"

        if not title_path.is_file():
            title_path.write_text(LOCALIZED_TITLES.get(locale, LOCALIZED_TITLES["en-US"]) + "\n", encoding="utf-8")
        if not short_desc_path.is_file():
            short_desc_path.write_text(
                LOCALIZED_SHORT_DESCRIPTIONS.get(locale, LOCALIZED_SHORT_DESCRIPTIONS["en-US"]) + "\n",
                encoding="utf-8",
            )

        # iOS metadata
        ios_dir = repo_root / f"ios/OpenClawConsole/fastlane/metadata/{locale}"
        ios_dir.mkdir(parents=True, exist_ok=True)

        ios_name_path = ios_dir / "name.txt"
        ios_subtitle_path = ios_dir / "subtitle.txt"

        if not ios_name_path.is_file():
            ios_name_path.write_text(LOCALIZED_TITLES.get(locale, LOCALIZED_TITLES["en-US"]) + "\n", encoding="utf-8")
        if not ios_subtitle_path.is_file():
            ios_subtitle_path.write_text(
                LOCALIZED_SHORT_DESCRIPTIONS.get(locale, LOCALIZED_SHORT_DESCRIPTIONS["en-US"]) + "\n",
                encoding="utf-8",
            )

        status[locale] = {
            "language": lang_name,
            "android_title": True,
            "android_short_desc": True,
            "ios_name": True,
            "ios_subtitle": True,
        }

    # Save localization status
    status_path = repo_root / LOCALIZATION_STATUS_PATH
    status_path.parent.mkdir(parents=True, exist_ok=True)
    status_path.write_text(json.dumps(status, indent=2) + "\n", encoding="utf-8")

    return status


def run_cro(repo_root: Path, create_experiments: bool = True) -> Dict[str, Any]:
    """Main CRO pipeline."""
    experiments_data = load_experiments(repo_root)

    # Ensure localized metadata for top markets
    localization = ensure_localized_metadata(repo_root)

    new_experiments = []
    if create_experiments:
        # Check if we need new experiments
        active = [e for e in experiments_data["experiments"] if e.get("status") == "active"]
        if len(active) < 2:
            new_experiments = [
                create_title_experiment(repo_root),
                create_short_description_experiment(repo_root),
                create_screenshot_experiment(repo_root),
            ]
            experiments_data["experiments"].extend(new_experiments)

    save_experiments(repo_root, experiments_data)

    return {
        "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
        "localization": localization,
        "new_experiments": len(new_experiments),
        "total_experiments": len(experiments_data["experiments"]),
        "active_experiments": len([e for e in experiments_data["experiments"] if e.get("status") == "active"]),
        "proposed_experiments": len([e for e in experiments_data["experiments"] if e.get("status") == "proposed"]),
    }


def build_report(result: Dict[str, Any]) -> str:
    lines = [
        "# CRO Optimization Report",
        "",
        f"**Date:** {result['timestamp']}",
        "",
        "## Localization Status (Top 5 Markets)",
        "| Locale | Language | Android | iOS |",
        "|--------|----------|---------|-----|",
    ]
    for locale, info in result["localization"].items():
        lines.append(f"| {locale} | {info['language']} | OK | OK |")

    lines.extend([
        "",
        "## Experiments",
        f"- New experiments proposed: {result['new_experiments']}",
        f"- Total experiments: {result['total_experiments']}",
        f"- Active: {result['active_experiments']}",
        f"- Proposed: {result['proposed_experiments']}",
        "",
        "## Next Steps",
        "1. Review proposed experiments in `marketing/data/cro_experiments.json`",
        "2. Activate experiments via Google Play Console Experiments",
        "3. Monitor conversion rates for 14-21 days",
        "4. Apply winning variants to metadata",
    ])

    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="CRO optimization pipeline")
    parser.add_argument("--repo-root", default=".", help="Repository root")
    parser.add_argument("--no-experiments", action="store_true", help="Skip creating experiments")
    parser.add_argument("--report-out", default=None, help="Markdown report output")
    args = parser.parse_args()

    result = run_cro(Path(args.repo_root).resolve(), not args.no_experiments)
    report = build_report(result)
    print(report)

    if args.report_out:
        out_path = Path(args.report_out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(report, encoding="utf-8")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
