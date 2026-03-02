#!/usr/bin/env python3
"""Enforce delegation contracts for high-impact release operations.

This script turns release preconditions into explicit, machine-checked
delegation decisions with evidence.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List


OPERATION_PROFILES: Dict[str, Dict[str, str]] = {
    "ios_metadata_sync": {
        "criticality": "medium",
        "reversibility": "medium",
        "verifiability": "high",
        "authority_level": "metadata_write",
    },
    "ios_submit_for_review": {
        "criticality": "high",
        "reversibility": "low",
        "verifiability": "high",
        "authority_level": "external_submission",
    },
}

REQUIRED_ASC_CHECKS = (
    "App Store Version Exists",
    "Build Attached",
    "Localization Metadata",
    "Privacy Policy URL",
    "App Review Contact",
    "Pricing Set",
    "Age Rating Completed",
    "Screenshots (iPhone)",
    "Screenshots (iPad)",
)


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _to_bool(raw: Any) -> bool:
    if isinstance(raw, bool):
        return raw
    value = str(raw or "").strip().lower()
    return value in {"1", "true", "yes", "y", "on"}


def _int_or_zero(raw: Any) -> int:
    try:
        return int(raw)
    except (TypeError, ValueError):
        return 0


def _is_iphone_large(display_type: str) -> bool:
    dt = display_type.upper()
    if not dt.startswith("APP_IPHONE"):
        return False
    return any(token in dt for token in ("65", "67", "69", "6_5", "6_7", "6_9"))


def _is_ipad_large(display_type: str) -> bool:
    dt = display_type.upper()
    if "IPAD" not in dt:
        return False
    return ("129" in dt) or ("_13" in dt) or ("13_" in dt) or dt.endswith("13")


def _make_check(name: str, passed: bool, details: str, evidence: Dict[str, Any] | None = None) -> Dict[str, Any]:
    payload = {
        "name": name,
        "passed": bool(passed),
        "details": details,
    }
    if evidence is not None:
        payload["evidence"] = evidence
    return payload


def _check_passed(checks: List[Dict[str, Any]]) -> bool:
    return all(bool(item.get("passed")) for item in checks)


def _load_json(path: str) -> Dict[str, Any]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"expected JSON object in {path}")
    return payload


def _evaluate_ios_metadata_sync(context_payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    summary = context_payload.get("summary")
    if not isinstance(summary, dict):
        return [_make_check("Context Summary Present", False, "Missing summary object in release context JSON")]

    local_ready = bool(summary.get("local_ready"))
    blockers_raw = summary.get("blockers")
    blockers = [str(item) for item in blockers_raw] if isinstance(blockers_raw, list) else []

    checks = [
        _make_check(
            "Local Listing Requirements",
            local_ready,
            "Local listing checks passed" if local_ready else "release_context summary.local_ready is false",
            evidence={"local_ready": local_ready},
        ),
        _make_check(
            "No Active Blockers",
            len(blockers) == 0,
            "No blockers reported" if not blockers else f"Blockers: {', '.join(blockers)}",
            evidence={"blockers": blockers},
        ),
    ]
    return checks


def _extract_check_map(asc_payload: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
    checks_raw = asc_payload.get("checks")
    if not isinstance(checks_raw, list):
        return {}
    out: Dict[str, Dict[str, Any]] = {}
    for item in checks_raw:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        if name:
            out[name] = item
    return out


def _has_complete_large_set(
    complete_counts: Dict[str, Any], minimum: int, matcher: Callable[[str], bool]
) -> bool:
    for display_type, count in complete_counts.items():
        if matcher(str(display_type)) and _int_or_zero(count) >= minimum:
            return True
    return False


def _evaluate_ios_submit_for_review(asc_payload: Dict[str, Any], intent: bool) -> List[Dict[str, Any]]:
    checks: List[Dict[str, Any]] = [
        _make_check(
            "Explicit Human Intent",
            intent,
            "submit_review intent provided" if intent else "submit_review intent missing or false",
            evidence={"intent": intent},
        )
    ]

    check_map = _extract_check_map(asc_payload)
    checks.append(
        _make_check(
            "ASC Report Shape",
            bool(check_map),
            "ASC readiness report contains named checks" if check_map else "ASC readiness report missing checks[]",
            evidence={"check_count": len(check_map)},
        )
    )
    if not check_map:
        return checks

    for name in REQUIRED_ASC_CHECKS:
        item = check_map.get(name)
        if item is None:
            checks.append(_make_check(name, False, "Required ASC check missing from report"))
            continue
        passed = bool(item.get("passed"))
        details = str(item.get("details") or "")
        checks.append(_make_check(name, passed, details, evidence=item.get("evidence") if isinstance(item.get("evidence"), dict) else None))

    build_check = check_map.get("Build Attached") or {}
    build_ev = build_check.get("evidence") if isinstance(build_check.get("evidence"), dict) else {}
    build_state = str(build_ev.get("processingState") or "")
    checks.append(
        _make_check(
            "Build Evidence Integrity",
            build_state == "VALID",
            f"processingState={build_state or 'UNKNOWN'}",
            evidence={"processingState": build_state, "buildNumber": build_ev.get("buildNumber")},
        )
    )

    localization_check = check_map.get("Localization Metadata") or {}
    loc_ev = localization_check.get("evidence") if isinstance(localization_check.get("evidence"), dict) else {}
    desc_len = _int_or_zero(loc_ev.get("description_len"))
    keywords_len = _int_or_zero(loc_ev.get("keywords_len"))
    support_url = str(loc_ev.get("supportUrl") or "").strip()
    checks.append(
        _make_check(
            "Localization Evidence Integrity",
            desc_len > 0 and keywords_len > 0 and support_url.startswith("https://"),
            (
                f"description_len={desc_len} keywords_len={keywords_len} "
                f"supportUrl={'set' if support_url else 'missing'}"
            ),
            evidence={
                "description_len": desc_len,
                "keywords_len": keywords_len,
                "supportUrl": support_url,
            },
        )
    )

    iphone_check = check_map.get("Screenshots (iPhone)") or {}
    ipad_check = check_map.get("Screenshots (iPad)") or {}
    iphone_ev = iphone_check.get("evidence") if isinstance(iphone_check.get("evidence"), dict) else {}
    ipad_ev = ipad_check.get("evidence") if isinstance(ipad_check.get("evidence"), dict) else {}
    complete_counts = iphone_ev.get("complete_counts")
    if not isinstance(complete_counts, dict):
        complete_counts = ipad_ev.get("complete_counts") if isinstance(ipad_ev.get("complete_counts"), dict) else {}

    iphone_proof = _has_complete_large_set(complete_counts, minimum=3, matcher=_is_iphone_large)
    ipad_proof = _has_complete_large_set(complete_counts, minimum=3, matcher=_is_ipad_large)
    checks.append(
        _make_check(
            "Screenshot Evidence Integrity",
            iphone_proof and ipad_proof,
            (
                "Evidence confirms >=3 complete assets for large iPhone and large iPad sets"
                if iphone_proof and ipad_proof
                else "Evidence does not prove required complete screenshot sets"
            ),
            evidence={"complete_counts": complete_counts},
        )
    )

    return checks


def evaluate_contract(
    *,
    operation: str,
    context_payload: Dict[str, Any] | None = None,
    asc_ready_payload: Dict[str, Any] | None = None,
    intent: bool = False,
) -> Dict[str, Any]:
    if operation not in OPERATION_PROFILES:
        raise ValueError(f"Unsupported operation: {operation}")

    if operation == "ios_metadata_sync":
        checks = _evaluate_ios_metadata_sync(context_payload or {})
    elif operation == "ios_submit_for_review":
        checks = _evaluate_ios_submit_for_review(asc_ready_payload or {}, intent=intent)
    else:
        raise ValueError(f"Unsupported operation: {operation}")

    blockers = [item["name"] for item in checks if not item["passed"]]

    return {
        "generated_at": _now_iso(),
        "operation": operation,
        "risk_profile": OPERATION_PROFILES[operation],
        "intent_provided": intent,
        "checks": checks,
        "blockers": blockers,
        "passed": _check_passed(checks),
    }


def _parse_args(argv: List[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate and enforce release delegation contracts.")
    parser.add_argument("--operation", required=True, choices=sorted(OPERATION_PROFILES))
    parser.add_argument("--context-json", help="release_context.py JSON output (required for ios_metadata_sync)")
    parser.add_argument("--asc-ready-json", help="asc_verify_ready.py JSON output (required for ios_submit_for_review)")
    parser.add_argument("--intent", default="false", help="Explicit human intent flag (true/false)")
    parser.add_argument("--json-out", help="Where to write contract decision JSON")
    parser.add_argument("--enforce", action="store_true", help="Exit non-zero when contract fails")
    return parser.parse_args(argv)


def main(argv: List[str]) -> int:
    args = _parse_args(argv)
    intent = _to_bool(args.intent)

    context_payload = _load_json(args.context_json) if args.context_json else None
    asc_ready_payload = _load_json(args.asc_ready_json) if args.asc_ready_json else None

    report = evaluate_contract(
        operation=args.operation,
        context_payload=context_payload,
        asc_ready_payload=asc_ready_payload,
        intent=intent,
    )

    print("== Delegation Contract ==")
    print(f"operation: {report['operation']}")
    print(f"passed:    {report['passed']}")
    print(f"blockers:  {', '.join(report['blockers']) if report['blockers'] else 'none'}")

    if args.json_out:
        out_path = Path(args.json_out).expanduser().resolve()
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
        print(f"json_out:  {out_path}")

    if args.enforce and not report["passed"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
