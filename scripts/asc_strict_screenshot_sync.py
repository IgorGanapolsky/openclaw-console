#!/usr/bin/env python3
"""Strict iOS screenshot replacement with lock-aware retry gating.

Workflow:
1. Verify current App Store version state.
2. If state is editable, run one full screenshot replacement:
   - delete existing screenshots for the localization
   - run `fastlane metadata` to upload fresh metadata/screenshots
   - verify ASC readiness
3. Retry one more full replacement only when screenshot checks failed AND
   App Store version state is still editable.

The script emits a JSON report with attempt-level evidence.
"""

from __future__ import annotations

import argparse
import json
import os
import shlex
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, Sequence, Tuple

from scripts.asc_client import AscClientError
from scripts.asc_reset_screenshots import reset_screenshots
from scripts.asc_resolve_version import _is_editable_state
from scripts.asc_verify_ready import DEFAULT_BUNDLE_ID, DEFAULT_LOCALE, verify_ready


def _print_cmd(cmd: Sequence[str], cwd: Path) -> None:
    rendered = " ".join(shlex.quote(x) for x in cmd)
    print(f"$ (cd {cwd} && {rendered})")


def _run_fastlane_metadata(*, repo_root: Path, version: str, dry_run: bool) -> int:
    cmd = ["fastlane", "metadata", f"version:{version}"]
    ios_dir = repo_root / "ios/OpenClawConsole"
    _print_cmd(cmd, ios_dir)
    if dry_run:
        return 0
    completed = subprocess.run(cmd, cwd=str(ios_dir), env=os.environ.copy(), check=False)
    return int(completed.returncode)


def _check_map(report: Dict[str, Any]) -> Dict[str, bool]:
    checks: Dict[str, bool] = {}
    for item in report.get("checks", []) or []:
        name = str(item.get("name") or "")
        checks[name] = bool(item.get("passed"))
    return checks


def _screenshot_status(report: Dict[str, Any]) -> Dict[str, bool]:
    checks = _check_map(report)
    iphone = bool(checks.get("Screenshots (iPhone)", False))
    ipad = bool(checks.get("Screenshots (iPad)", False))
    return {"iphone": iphone, "ipad": ipad, "passed": iphone and ipad}


def _verify_once(
    *,
    bundle_id: str,
    version: str,
    locale: str,
    min_iphone: int,
    min_ipad: int,
    require_build: bool,
) -> Dict[str, Any]:
    verify_passed, report = verify_ready(
        bundle_id=bundle_id,
        version=version,
        locale=locale,
        min_iphone=min_iphone,
        min_ipad=min_ipad,
        require_build=require_build,
    )
    state = str(report.get("app_store_state") or "UNKNOWN")
    screenshots = _screenshot_status(report)
    return {
        "verify_ready_passed": bool(verify_passed),
        "app_store_state": state,
        "is_editable_state": _is_editable_state(state),
        "screenshot_checks": screenshots,
        "report": report,
    }


def run_strict_screenshot_sync(
    *,
    repo_root: Path,
    bundle_id: str,
    version: str,
    locale: str,
    min_iphone: int,
    min_ipad: int,
    require_build: bool,
    retry_on_editable: bool,
    dry_run: bool,
) -> Tuple[int, Dict[str, Any]]:
    precheck = _verify_once(
        bundle_id=bundle_id,
        version=version,
        locale=locale,
        min_iphone=min_iphone,
        min_ipad=min_ipad,
        require_build=require_build,
    )
    payload: Dict[str, Any] = {
        "bundle_id": bundle_id,
        "version": version,
        "locale": locale,
        "retry_on_editable": retry_on_editable,
        "dry_run": dry_run,
        "precheck": {
            "verify_ready_passed": precheck["verify_ready_passed"],
            "app_store_state": precheck["app_store_state"],
            "is_editable_state": precheck["is_editable_state"],
            "screenshot_checks": precheck["screenshot_checks"],
        },
        "precheck_report": precheck["report"],
        "attempts": [],
    }
    final_verify = precheck

    if not precheck["is_editable_state"]:
        payload["result"] = "failed_locked_before_replacement"
        payload["reason"] = (
            f"App Store version state '{precheck['app_store_state']}' is not editable; "
            "skipping screenshot replacement."
        )
        payload["final"] = payload["precheck"]
        payload["final_verify_report"] = precheck["report"]
        return 1, payload

    for attempt_number in (1, 2):
        reset_summary = reset_screenshots(
            version=version,
            locale=locale,
            bundle_id=bundle_id,
            dry_run=dry_run,
        )
        fastlane_rc = _run_fastlane_metadata(repo_root=repo_root, version=version, dry_run=dry_run)
        if fastlane_rc != 0:
            # Re-read ASC state after fastlane failure so artifacts reflect the latest reality.
            verify_error = None
            try:
                final_verify = _verify_once(
                    bundle_id=bundle_id,
                    version=version,
                    locale=locale,
                    min_iphone=min_iphone,
                    min_ipad=min_ipad,
                    require_build=require_build,
                )
            except AscClientError as exc:
                verify_error = str(exc)
            payload["result"] = "failed_fastlane_metadata"
            payload["reason"] = f"fastlane metadata exited with code {fastlane_rc}"
            payload["attempts"].append(
                {
                    "attempt": attempt_number,
                    "reset_summary": reset_summary,
                    "fastlane_exit_code": fastlane_rc,
                }
            )
            payload["final"] = {
                "verify_ready_passed": final_verify["verify_ready_passed"],
                "app_store_state": final_verify["app_store_state"],
                "is_editable_state": final_verify["is_editable_state"],
                "screenshot_checks": final_verify["screenshot_checks"],
            }
            if verify_error:
                payload["post_failure_verify_error"] = verify_error
            payload["final_verify_report"] = final_verify["report"]
            return 2, payload

        verified = _verify_once(
            bundle_id=bundle_id,
            version=version,
            locale=locale,
            min_iphone=min_iphone,
            min_ipad=min_ipad,
            require_build=require_build,
        )
        final_verify = verified
        payload["attempts"].append(
            {
                "attempt": attempt_number,
                "reset_summary": reset_summary,
                "fastlane_exit_code": fastlane_rc,
                "verify_ready_passed": verified["verify_ready_passed"],
                "app_store_state": verified["app_store_state"],
                "is_editable_state": verified["is_editable_state"],
                "screenshot_checks": verified["screenshot_checks"],
                "screenshot_counts": verified["report"].get("screenshot_counts", {}),
                "screenshot_total_counts": verified["report"].get("screenshot_total_counts", {}),
                "screenshot_asset_states": verified["report"].get("screenshot_asset_states", {}),
                "verify_report": verified["report"],
            }
        )

        if verified["verify_ready_passed"]:
            payload["result"] = "success"
            payload["reason"] = f"verify_ready passed on attempt {attempt_number}"
            payload["final"] = payload["attempts"][-1]
            payload["final_verify_report"] = verified["report"]
            return 0, payload

        screenshot_failed = not verified["screenshot_checks"]["passed"]
        can_retry = (
            attempt_number == 1
            and retry_on_editable
            and screenshot_failed
            and verified["is_editable_state"]
        )
        if can_retry:
            continue
        break

    payload["result"] = "failed_after_replacement_attempts"
    if final_verify["screenshot_checks"]["passed"]:
        payload["reason"] = "Screenshots passed, but other ASC readiness checks are still failing."
    elif final_verify["is_editable_state"]:
        payload["reason"] = "Screenshot checks failed after strict editable-state retry."
    else:
        payload["reason"] = (
            "Screenshot checks failed and App Store version is locked; strict mode skipped retry."
        )
    payload["final"] = {
        "verify_ready_passed": final_verify["verify_ready_passed"],
        "app_store_state": final_verify["app_store_state"],
        "is_editable_state": final_verify["is_editable_state"],
        "screenshot_checks": final_verify["screenshot_checks"],
    }
    payload["final_verify_report"] = final_verify["report"]
    return 1, payload


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Strict iOS screenshot replacement. Retries one full replacement "
            "only when screenshot checks fail in an editable App Store version state."
        )
    )
    parser.add_argument("--bundle-id", default=DEFAULT_BUNDLE_ID)
    parser.add_argument("--version", required=True)
    parser.add_argument("--locale", default=DEFAULT_LOCALE)
    parser.add_argument("--min-iphone", type=int, default=3)
    parser.add_argument("--min-ipad", type=int, default=3)
    parser.add_argument("--skip-build-check", action="store_true")
    parser.add_argument(
        "--retry-on-editable",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Retry one more full screenshot replacement when screenshot checks fail and state is editable.",
    )
    parser.add_argument("--json-out", help="Write orchestration report JSON to this path.")
    parser.add_argument(
        "--asc-ready-json",
        help="Write final asc_verify_ready report JSON to this path (for workflow artifact compatibility).",
    )
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    repo_root = Path(__file__).resolve().parent.parent

    try:
        exit_code, payload = run_strict_screenshot_sync(
            repo_root=repo_root,
            bundle_id=args.bundle_id,
            version=args.version,
            locale=args.locale,
            min_iphone=args.min_iphone,
            min_ipad=args.min_ipad,
            require_build=not args.skip_build_check,
            retry_on_editable=bool(args.retry_on_editable),
            dry_run=args.dry_run,
        )
    except AscClientError as exc:
        print(f"❌ {exc}", file=sys.stderr)
        return 2
    except RuntimeError as exc:
        print(f"❌ {exc}", file=sys.stderr)
        return 2
    except SystemExit as exc:
        code = int(exc.code) if isinstance(exc.code, int) else 1
        return code

    print("══ Strict Screenshot Sync ══════════════════════════")
    print(f"version:           {payload.get('version')}")
    print(f"state(precheck):   {payload.get('precheck', {}).get('app_store_state')}")
    print(f"attempts:          {len(payload.get('attempts', []))}")
    print(f"result:            {payload.get('result')}")
    print(f"reason:            {payload.get('reason')}")
    print("═════════════════════════════════════════════════════")

    if args.json_out:
        out = Path(args.json_out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
        print(f"Wrote strict sync report: {out}")

    if args.asc_ready_json:
        out = Path(args.asc_ready_json)
        out.parent.mkdir(parents=True, exist_ok=True)
        report = payload.get("final_verify_report", {})
        out.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
        print(f"Wrote final ASC readiness report: {out}")

    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
