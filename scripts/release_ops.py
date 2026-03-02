#!/usr/bin/env python3
"""High-level release operations interface for OpenClaw Console.

Commands:
  - check_readiness: local preflight + consolidated release context snapshot
  - sync_listing: upload iOS listing metadata/screenshots via fastlane
  - review_ops: run App Store review SLA monitor
  - review_autopilot: review_ops + anomaly detection + policy routing
"""

from __future__ import annotations

import argparse
import json
import os
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import List, Sequence

try:
    # Works when running as module/package import.
    from scripts.delegation_contract import evaluate_contract
except ModuleNotFoundError:
    # Works when invoking as: python scripts/release_ops.py ...
    from delegation_contract import evaluate_contract


class ReleaseOpsError(RuntimeError):
    """Raised for malformed command usage."""


def _repo_root(value: str) -> Path:
    return Path(value).resolve()


def _run(cmd: Sequence[str], cwd: Path, env: dict | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=str(cwd), env=env)


def _print_cmd(cmd: Sequence[str], cwd: Path) -> None:
    rendered = " ".join(shlex.quote(x) for x in cmd)
    print(f"$ (cd {cwd} && {rendered})")


def _append_jsonl(path: Path, payload: dict, max_lines: int = 2000) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    line = json.dumps(payload, ensure_ascii=True)
    existing = path.read_text(encoding="utf-8").splitlines() if path.is_file() else []
    existing.append(line)
    if len(existing) > max_lines:
        existing = existing[-max_lines:]
    path.write_text("\n".join(existing) + "\n", encoding="utf-8")  # NOSONAR


def _read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _is_within(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def _safe_io_path(raw_path: str, repo_root: Path) -> Path:
    candidate = Path(raw_path).expanduser().resolve()
    allowed_roots = {
        repo_root.resolve(),
        Path(tempfile.gettempdir()).resolve(),
    }
    if any(_is_within(candidate, root) for root in allowed_roots):
        return candidate
    allowed_str = ", ".join(sorted(str(r) for r in allowed_roots))
    raise ReleaseOpsError(f"Path outside allowed roots ({allowed_str}): {candidate}")


def _has_asc_credentials(env: dict) -> bool:
    key_id = (env.get("APPSTORE_KEY_ID") or "").strip()
    issuer_id = (env.get("APPSTORE_ISSUER_ID") or "").strip()
    key_material = (env.get("APPSTORE_PRIVATE_KEY") or env.get("APPSTORE_PRIVATE_KEY_PATH") or "").strip()
    if not key_material and key_id:
        default_key = Path.home() / ".appstoreconnect" / "private_keys" / f"AuthKey_{key_id}.p8"
        key_material = str(default_key) if default_key.is_file() else ""
    return bool(key_id and issuer_id and key_material)


def check_readiness(args: argparse.Namespace, repo_root: Path) -> int:
    env = os.environ.copy()
    context_out = _safe_io_path(args.context_out, repo_root)

    preflight_cmd = [
        "bash",
        str(repo_root / "scripts" / "preflight-release.sh"),
        "--platform",
        args.platform,
        "--layer",
        "1",
    ]
    _print_cmd(preflight_cmd, repo_root)
    preflight = _run(preflight_cmd, repo_root, env=env)
    if preflight.returncode != 0:
        return preflight.returncode

    context_cmd: List[str] = [
        sys.executable,
        str(repo_root / "scripts" / "release_context.py"),
        "--repo-root",
        str(repo_root),
        "--json-out",
        str(context_out),
        "--locale",
        args.locale,
        "--review-limit",
        str(args.review_limit),
        "--sla-hours",
        str(args.sla_hours),
    ]
    if args.version:
        context_cmd.extend(["--version", args.version])
    if args.no_remote:
        context_cmd.append("--no-remote")

    _print_cmd(context_cmd, repo_root)
    context_proc = _run(context_cmd, repo_root, env=env)
    if context_proc.returncode != 0:
        return context_proc.returncode

    if not context_out.is_file():
        print(f"❌ Context output not found: {context_out}", file=sys.stderr)
        return 2

    payload = json.loads(context_out.read_text(encoding="utf-8"))
    summary = payload.get("summary", {})
    contract = evaluate_contract(
        operation="ios_metadata_sync",
        context_payload=payload,
        intent=True,
    )

    contract_out_raw = getattr(args, "contract_out", None)
    if contract_out_raw:
        contract_out = _safe_io_path(contract_out_raw, repo_root)
        contract_out.parent.mkdir(parents=True, exist_ok=True)
        contract_out.write_text(json.dumps(contract, indent=2, sort_keys=True), encoding="utf-8")
        print(f"Delegation contract: {contract_out}")

    if args.strict_remote and summary.get("remote_status") not in ("success", "skipped_no_remote"):
        print(
            "❌ strict_remote enabled and remote context is not fully successful: "
            f"{summary.get('remote_status')}",
            file=sys.stderr,
        )
        return 1

    if args.fail_on_sla and int(summary.get("sla_breach_count") or 0) > 0:
        print("❌ fail_on_sla enabled and SLA breaches are present", file=sys.stderr)
        return 1

    if not contract["passed"]:
        print(
            "❌ delegation contract failed: "
            + ", ".join(str(item) for item in contract.get("blockers", [])),
            file=sys.stderr,
        )
        if getattr(args, "enforce_contract", True):
            return 1

    blockers = summary.get("blockers") or []
    print("══ Release Ops Readiness ═══════════════════════════")
    print(f"Context:      {context_out}")
    print(f"Local ready:  {summary.get('local_ready')}")
    print(f"Remote:       {summary.get('remote_status')}")
    print(f"SLA breaches: {summary.get('sla_breach_count')}")
    print(f"Blockers:     {', '.join(blockers) if blockers else 'none'}")
    print(f"Contract:     {'pass' if contract['passed'] else 'fail'}")
    print("═════════════════════════════════════════════════════")

    return 0


def sync_listing(args: argparse.Namespace, repo_root: Path) -> int:
    env = os.environ.copy()

    if not _has_asc_credentials(env):
        print("❌ Missing APPSTORE_KEY_ID / APPSTORE_ISSUER_ID for sync_listing", file=sys.stderr)
        return 2

    cmd: List[str] = ["fastlane", "metadata"]
    if args.version:
        cmd.append(f"version:{args.version}")
    cmd.append(f"upload_metadata:{str(args.upload_metadata).lower()}")

    ios_dir = repo_root / "ios/OpenClawConsole"
    _print_cmd(cmd, ios_dir)
    if args.dry_run:
        return 0

    return _run(cmd, ios_dir, env=env).returncode


def review_ops(args: argparse.Namespace, repo_root: Path) -> int:
    env = os.environ.copy()

    cmd: List[str] = [
        sys.executable,
        str(repo_root / "scripts" / "asc_reviews_ops.py"),
        "--bundle-id",
        "com.openclaw.console",
        "--limit",
        str(args.limit),
        "--sla-hours",
        str(args.sla_hours),
        "--json-out",
        str(Path(args.json_out).resolve()),
    ]

    if args.markdown_out:
        cmd.extend(["--markdown-out", str(Path(args.markdown_out).resolve())])
    if args.fail_on_sla:
        cmd.append("--fail-on-sla")

    _print_cmd(cmd, repo_root)
    return _run(cmd, repo_root, env=env).returncode


def review_autopilot(args: argparse.Namespace, repo_root: Path) -> int:
    env = os.environ.copy()
    history_jsonl = _safe_io_path(args.history_jsonl, repo_root)
    reviews_json = _safe_io_path(args.reviews_json_out, repo_root)
    anomaly_json = _safe_io_path(args.anomaly_json_out, repo_root)
    policy_json = _safe_io_path(args.policy_json_out, repo_root)

    review_cmd: List[str] = [
        sys.executable,
        str(repo_root / "scripts" / "asc_reviews_ops.py"),
        "--bundle-id",
        "com.openclaw.console",
        "--limit",
        str(args.limit),
        "--sla-hours",
        str(args.sla_hours),
        "--json-out",
        str(reviews_json),
    ]
    if args.reviews_markdown_out:
        review_cmd.extend(["--markdown-out", str(_safe_io_path(args.reviews_markdown_out, repo_root))])
    if args.fail_on_sla:
        review_cmd.append("--fail-on-sla")
    _print_cmd(review_cmd, repo_root)
    review_rc = _run(review_cmd, repo_root, env=env).returncode
    if review_rc != 0:
        return review_rc

    anomaly_cmd: List[str] = [
        sys.executable,
        str(repo_root / "scripts" / "review_anomaly_detector.py"),
        "--current-json",
        str(reviews_json),
        "--history-jsonl",
        str(history_jsonl),
        "--json-out",
        str(anomaly_json),
        "--min-history",
        str(args.min_history),
        "--max-age-days",
        str(args.max_age_days),
        "--rating-drop-threshold",
        str(args.rating_drop_threshold),
        "--low-star-rate-spike-threshold",
        str(args.low_star_rate_spike_threshold),
        "--unresolved-spike-threshold",
        str(args.unresolved_spike_threshold),
        "--sla-breach-spike-threshold",
        str(args.sla_breach_spike_threshold),
    ]
    if args.anomaly_markdown_out:
        anomaly_cmd.extend(["--markdown-out", str(_safe_io_path(args.anomaly_markdown_out, repo_root))])
    _print_cmd(anomaly_cmd, repo_root)
    anomaly_rc = _run(anomaly_cmd, repo_root, env=env).returncode
    if anomaly_rc != 0:
        return anomaly_rc

    policy_cmd: List[str] = [
        sys.executable,
        str(repo_root / "scripts" / "review_action_policy.py"),
        "--reviews-json",
        str(reviews_json),
        "--anomaly-json",
        str(anomaly_json),
        "--json-out",
        str(policy_json),
        "--mode",
        str(args.mode),
    ]
    if args.policy_markdown_out:
        policy_cmd.extend(["--markdown-out", str(_safe_io_path(args.policy_markdown_out, repo_root))])
    if args.fail_on_blocking:
        policy_cmd.append("--fail-on-blocking")
    _print_cmd(policy_cmd, repo_root)
    policy_rc = _run(policy_cmd, repo_root, env=env).returncode

    # Persist latest sample after successful data collection.
    try:
        report_payload = _read_json(reviews_json)
        _append_jsonl(history_jsonl, report_payload, max_lines=int(args.history_max_lines))
    except Exception as exc:
        print(f"⚠️ Could not append reviews history JSONL: {exc}", file=sys.stderr)
        if policy_rc == 0:
            return 2

    if not policy_json.is_file():
        print(f"❌ Policy output not found: {policy_json}", file=sys.stderr)
        return 2

    policy_payload = _read_json(policy_json)
    decision = policy_payload.get("decision", {}) or {}
    print("══ Review Autopilot ═══════════════════════════════")
    print(f"History file:      {history_jsonl}")
    print(f"Route:             {decision.get('route')}")
    print(f"Blocking:          {decision.get('blocking')}")
    print(f"Mode:              {policy_payload.get('mode')}")
    print(f"Anomaly status:    {policy_payload.get('anomalyStatus')}")
    print("═══════════════════════════════════════════════════")

    return policy_rc


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Autonomous release operations control plane.")
    parser.add_argument("--repo-root", default=".", help="Repository root (default: current directory)")

    sub = parser.add_subparsers(dest="command", required=True)

    p_ready = sub.add_parser("check_readiness", help="Run preflight and generate release context snapshot")
    p_ready.add_argument("--platform", choices=["ios", "both"], default="ios")
    p_ready.add_argument("--version", help="iOS marketing version (auto-detected by release_context if omitted)")
    p_ready.add_argument("--locale", default="en-US")
    p_ready.add_argument("--context-out", required=True, help="Path for release context JSON")
    p_ready.add_argument("--review-limit", type=int, default=200)
    p_ready.add_argument("--sla-hours", type=int, default=24)
    p_ready.add_argument("--strict-remote", action="store_true", help="Fail if remote checks are not fully successful")
    p_ready.add_argument("--fail-on-sla", action="store_true", help="Fail if review SLA breaches are present")
    p_ready.add_argument("--no-remote", action="store_true", help="Skip remote ASC checks")
    p_ready.add_argument("--contract-out", help="Optional path for delegation contract decision JSON")
    p_ready.add_argument(
        "--enforce-contract",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Fail when delegation contract is not satisfied (default: true)",
    )

    p_sync = sub.add_parser("sync_listing", help="Upload listing metadata/screenshots via fastlane")
    p_sync.add_argument("--version", help="iOS marketing version")
    p_sync.add_argument("--upload-metadata", action=argparse.BooleanOptionalAction, default=True)
    p_sync.add_argument("--dry-run", action="store_true")

    p_reviews = sub.add_parser("review_ops", help="Run App Store review SLA monitor")
    p_reviews.add_argument("--limit", type=int, default=200)
    p_reviews.add_argument("--sla-hours", type=int, default=24)
    p_reviews.add_argument("--json-out", required=True)
    p_reviews.add_argument("--markdown-out")
    p_reviews.add_argument("--fail-on-sla", action="store_true")

    p_auto = sub.add_parser("review_autopilot", help="Autonomous review ops: monitor + anomaly + action policy")
    p_auto.add_argument("--limit", type=int, default=200)
    p_auto.add_argument("--sla-hours", type=int, default=24)
    p_auto.add_argument(
        "--history-jsonl",
        default=".artifacts/asc-reviews-history.jsonl",
        help="Path to persistent review history jsonl",
    )
    p_auto.add_argument("--history-max-lines", type=int, default=2000)
    p_auto.add_argument("--min-history", type=int, default=8)
    p_auto.add_argument("--max-age-days", type=int, default=30)
    p_auto.add_argument("--rating-drop-threshold", type=float, default=0.25)
    p_auto.add_argument("--low-star-rate-spike-threshold", type=float, default=0.05)
    p_auto.add_argument("--unresolved-spike-threshold", type=float, default=3.0)
    p_auto.add_argument("--sla-breach-spike-threshold", type=float, default=1.0)
    p_auto.add_argument("--mode", choices=["observe", "enforce"], default="observe")
    p_auto.add_argument("--reviews-json-out", default=".artifacts/asc-reviews-ops.json")
    p_auto.add_argument("--reviews-markdown-out", default=".artifacts/asc-reviews-ops.md")
    p_auto.add_argument("--anomaly-json-out", default=".artifacts/asc-reviews-anomaly.json")
    p_auto.add_argument("--anomaly-markdown-out", default=".artifacts/asc-reviews-anomaly.md")
    p_auto.add_argument("--policy-json-out", default=".artifacts/asc-reviews-policy.json")
    p_auto.add_argument("--policy-markdown-out", default=".artifacts/asc-reviews-policy.md")
    p_auto.add_argument("--fail-on-sla", action="store_true")
    p_auto.add_argument("--fail-on-blocking", action="store_true")

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    repo_root = _repo_root(args.repo_root)

    if args.command == "check_readiness":
        return check_readiness(args, repo_root)
    if args.command == "sync_listing":
        return sync_listing(args, repo_root)
    if args.command == "review_ops":
        return review_ops(args, repo_root)
    if args.command == "review_autopilot":
        return review_autopilot(args, repo_root)

    raise ReleaseOpsError(f"Unknown command: {args.command}")


if __name__ == "__main__":
    raise SystemExit(main())
