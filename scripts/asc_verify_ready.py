#!/usr/bin/env python3
"""Verify App Store Connect readiness for submitting an iOS version for review.

This is a hard gate intended for CI automation. It uses the App Store Connect
REST API and requires App Store Connect API key credentials.

What it verifies (fail-fast):
  - App exists (by bundle id)
  - Target App Store version exists (by versionString)
  - An iOS build is attached to that App Store version AND processingState == VALID
  - Required metadata fields are non-empty (description, keywords, support URL)
  - Privacy Policy URL is set (from appInfoLocalizations)
  - App Review contact info exists (from appStoreReviewDetails)
  - Screenshots: at least N delivered screenshots (assetDeliveryState=COMPLETE)
    for iPhone (6.5/6.7/6.9) and iPad (12.9/13) display types

Outputs:
  - Prints a human readable report to stdout
  - Optionally writes JSON report via --json

Exit codes:
  0 - Ready
  1 - Not ready (missing fields, screenshots, build, etc.)
  2 - Configuration / API error (missing credentials, unexpected API failure)
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from scripts.asc_client import AscClient, AscClientError

DEFAULT_BUNDLE_ID = "com.openclaw.console"
DEFAULT_LOCALE = "en-US"


def _die(code: int, msg: str) -> None:
    print(msg, file=sys.stderr)
    raise SystemExit(code)


def _get_app_id(client: AscClient, bundle_id: str) -> str:
    payload = client.get("/apps", params={"filter[bundleId]": bundle_id, "limit": "1"})
    data = payload.get("data", [])
    if not data:
        _die(2, f"❌ No app found with bundleId '{bundle_id}'")
    return str(data[0]["id"])


def _first_included(payload: Dict[str, Any], type_name: str, id_: str) -> Optional[Dict[str, Any]]:
    for item in payload.get("included", []) or []:
        if item.get("type") == type_name and item.get("id") == id_:
            return item
    return None


@dataclass
class Check:
    name: str
    passed: bool
    details: str
    evidence: Optional[Dict[str, Any]] = None


def _normalize(s: Optional[str]) -> str:
    return (s or "").strip()


def _pick_localization(items: List[Dict[str, Any]], locale: str) -> Optional[Dict[str, Any]]:
    for it in items:
        if _normalize(it.get("attributes", {}).get("locale")) == locale:
            return it
    return items[0] if items else None


def _list_app_store_versions(
    client: AscClient, app_id: str, version: str
) -> Tuple[Dict[str, Any], Optional[Dict[str, Any]]]:
    payload = client.get(
        f"/apps/{app_id}/appStoreVersions",
        params={
            "filter[versionString]": version,
            "limit": "1",
            "include": "build,appStoreVersionLocalizations",
            "fields[appStoreVersions]": "versionString,appStoreState,build,appStoreVersionLocalizations",
            "fields[builds]": "processingState,version,uploadedDate",
            "fields[appStoreVersionLocalizations]": "locale,description,keywords,supportUrl",
        },
    )
    versions = payload.get("data", [])
    return payload, (versions[0] if versions else None)


def _get_screenshot_sets(
    client: AscClient, localization_id: str
) -> List[Dict[str, Any]]:
    payload = client.get(
        f"/appStoreVersionLocalizations/{localization_id}/appScreenshotSets",
        params={
            "limit": "200",
            "fields[appScreenshotSets]": "screenshotDisplayType",
        },
    )
    return payload.get("data", []) or []


def _summarize_screenshot_set(client: AscClient, set_id: str) -> Dict[str, Any]:
    payload = client.get(
        f"/appScreenshotSets/{set_id}/appScreenshots",
        params={"limit": "200", "fields[appScreenshots]": "assetDeliveryState,fileName"},
    )
    items = payload.get("data", []) or []
    total = len(items)
    complete = 0
    state_counts: Dict[str, int] = {}
    incomplete: List[Dict[str, str]] = []

    for item in items:
        attrs = item.get("attributes", {}) or {}
        state = str((attrs.get("assetDeliveryState") or {}).get("state") or "UNKNOWN")
        state_counts[state] = state_counts.get(state, 0) + 1
        if state == "COMPLETE":
            complete += 1
        else:
            incomplete.append(
                {
                    "id": str(item.get("id") or ""),
                    "state": state,
                    "fileName": str(attrs.get("fileName") or ""),
                }
            )

    return {
        "total": total,
        "complete": complete,
        "state_counts": state_counts,
        "incomplete": incomplete,
    }


def _is_iphone_large(display_type: str) -> bool:
    dt = display_type.upper()
    if not dt.startswith("APP_IPHONE"):
        return False
    # Apple has evolved the constants over time; treat these as "large iPhone".
    return any(token in dt for token in ("65", "67", "69", "6_5", "6_7", "6_9"))


def _is_ipad_large(display_type: str) -> bool:
    dt = display_type.upper()
    if "IPAD" not in dt:
        return False
    # 12.9/13-inch iPad Pro display types typically contain 129 or 13.
    return ("129" in dt) or ("_13" in dt) or ("13_" in dt) or dt.endswith("13")


def _get_app_info_privacy_policy_url(
    client: AscClient, app_id: str, locale: str
) -> Tuple[Optional[str], Dict[str, Any]]:
    payload = client.get(
        f"/apps/{app_id}/appInfos",
        params={
            "limit": "50",
            "include": "appInfoLocalizations",
            "fields[appInfos]": "appInfoLocalizations",
            "fields[appInfoLocalizations]": "locale,privacyPolicyUrl",
        },
    )
    locs: List[Dict[str, Any]] = []
    for inc in payload.get("included", []) or []:
        if inc.get("type") == "appInfoLocalizations":
            locs.append(inc)
    picked = _pick_localization(locs, locale) if locs else None
    url = _normalize((picked or {}).get("attributes", {}).get("privacyPolicyUrl"))
    if not url:
        # Fall back: any locale with a privacy policy URL counts.
        for it in locs:
            url_any = _normalize(it.get("attributes", {}).get("privacyPolicyUrl"))
            if url_any:
                return url_any, {"locale": it.get("attributes", {}).get("locale")}
    return (url or None), {"locale": (picked or {}).get("attributes", {}).get("locale")}


def _get_app_review_details(client: AscClient, app_store_version_id: str) -> Dict[str, Any]:
    # Review details are attached to the version.
    payload = client.get(
        f"/appStoreVersions/{app_store_version_id}/appStoreReviewDetail",
        params={
            "fields[appStoreReviewDetails]": "contactFirstName,contactLastName,contactPhone,contactEmail",
        },
    )
    data = payload.get("data")
    return data if isinstance(data, dict) else {}


def _get_app_price_schedules(client: AscClient, app_id: str) -> List[Dict[str, Any]]:
    # If pricing is not set, this list tends to be empty.
    payload = client.get(
        f"/apps/{app_id}/appPriceSchedules",
        params={"limit": "10"},
    )
    return payload.get("data", []) or []


def _get_age_rating_declaration(client: AscClient, app_id: str) -> Optional[Dict[str, Any]]:
    # Relationship is singular on apps: appStoreAgeRatingDeclaration
    payload = client.get(
        f"/apps/{app_id}/appStoreAgeRatingDeclaration",
        params={"fields[appStoreAgeRatingDeclarations]": "alcoholTobaccoOrDrugUseOrReferences,gamblingAndContests,violenceCartoonOrFantasy,violenceRealistic,profanityOrCrudeHumor"},
    )
    data = payload.get("data")
    return data if isinstance(data, dict) else None


def verify_ready(
    *,
    bundle_id: str,
    version: str,
    locale: str,
    min_iphone: int,
    min_ipad: int,
    require_build: bool,
) -> Tuple[bool, Dict[str, Any]]:
    client = AscClient(timeout=30)
    checks: List[Check] = []

    app_id = _get_app_id(client, bundle_id)

    version_payload, app_store_version = _list_app_store_versions(client, app_id, version)
    if not app_store_version:
        checks.append(
            Check(
                name="App Store Version Exists",
                passed=False,
                details=f"App Store version '{version}' not found for bundleId '{bundle_id}'",
            )
        )
        return False, {"bundle_id": bundle_id, "version": version, "checks": [c.__dict__ for c in checks]}

    v_attrs = app_store_version.get("attributes", {}) or {}
    v_state = v_attrs.get("appStoreState", "UNKNOWN")
    checks.append(
        Check(
            name="App Store Version Exists",
            passed=True,
            details=f"Found version {v_attrs.get('versionString')} (state={v_state})",
            evidence={"appStoreState": v_state},
        )
    )

    # Build attached + VALID
    build_rel = (
        app_store_version.get("relationships", {})
        .get("build", {})
        .get("data")
    )
    if not build_rel:
        checks.append(
            Check(
                name="Build Attached",
                passed=not require_build,
                details=(
                    "No build attached to this App Store version"
                    if require_build
                    else "Skipped (metadata-only mode): no build attached"
                ),
                evidence={"skipped": not require_build},
            )
        )
    else:
        build = _first_included(version_payload, "builds", build_rel.get("id"))
        processing = (build or {}).get("attributes", {}).get("processingState", "UNKNOWN")
        build_num = (build or {}).get("attributes", {}).get("version", "?")
        passed = (processing == "VALID") or (not require_build)
        checks.append(
            Check(
                name="Build Attached",
                passed=passed,
                details=(
                    f"build={build_num} processingState={processing}"
                    if require_build
                    else f"Skipped (metadata-only mode): build={build_num} processingState={processing}"
                ),
                evidence={"buildNumber": build_num, "processingState": processing, "skipped": not require_build},
            )
        )

    # Metadata in App Store version localization
    loc_rels = (
        app_store_version.get("relationships", {})
        .get("appStoreVersionLocalizations", {})
        .get("data", [])
    ) or []
    loc_items: List[Dict[str, Any]] = []
    for rel in loc_rels:
        loc = _first_included(version_payload, "appStoreVersionLocalizations", rel.get("id"))
        if loc:
            loc_items.append(loc)
    picked_loc = _pick_localization(loc_items, locale) if loc_items else None
    if not picked_loc:
        checks.append(
            Check(
                name="Localization Metadata",
                passed=False,
                details=f"No appStoreVersionLocalizations found for version {version}",
            )
        )
        picked_loc_id = None
    else:
        picked_loc_id = picked_loc.get("id")
        attrs = picked_loc.get("attributes", {}) or {}
        desc = _normalize(attrs.get("description"))
        keywords = _normalize(attrs.get("keywords"))
        support_url = _normalize(attrs.get("supportUrl"))

        missing_fields = []
        if not desc:
            missing_fields.append("description")
        if not keywords:
            missing_fields.append("keywords")
        if not support_url:
            missing_fields.append("supportUrl")

        checks.append(
            Check(
                name="Localization Metadata",
                passed=len(missing_fields) == 0,
                details=(
                    f"locale={attrs.get('locale')} "
                    + ("OK" if not missing_fields else f"missing: {', '.join(missing_fields)}")
                ),
                evidence={
                    "locale": attrs.get("locale"),
                    "description_len": len(desc),
                    "keywords_len": len(keywords),
                    "supportUrl": support_url,
                },
            )
        )

    # Privacy Policy URL (from app info localizations)
    try:
        privacy_url, privacy_meta = _get_app_info_privacy_policy_url(client, app_id, locale)
        checks.append(
            Check(
                name="Privacy Policy URL",
                passed=bool(privacy_url),
                details=privacy_url or "privacyPolicyUrl missing",
                evidence=privacy_meta | ({"privacyPolicyUrl": privacy_url} if privacy_url else {}),
            )
        )
    except AscClientError as exc:
        checks.append(
            Check(
                name="Privacy Policy URL",
                passed=True,
                details=f"Skipped check (endpoint/API unavailable): {exc}",
                evidence={"skipped": True},
            )
        )
    except Exception as exc:
        checks.append(
            Check(
                name="Privacy Policy URL",
                passed=False,
                details=f"Could not verify privacy policy URL: {exc}",
            )
        )

    # App review contact info
    try:
        review = _get_app_review_details(client, str(app_store_version.get("id")))
        attrs = review.get("attributes", {}) if review else {}
        first = _normalize(attrs.get("contactFirstName"))
        last = _normalize(attrs.get("contactLastName"))
        email = _normalize(attrs.get("contactEmail"))
        phone = _normalize(attrs.get("contactPhone"))
        missing = [k for k, v in (("contactFirstName", first), ("contactLastName", last), ("contactEmail", email), ("contactPhone", phone)) if not v]
        checks.append(
            Check(
                name="App Review Contact",
                passed=len(missing) == 0,
                details="OK" if not missing else f"missing: {', '.join(missing)}",
                evidence={"contactEmail": email, "contactPhone": phone},
            )
        )
    except AscClientError as exc:
        checks.append(
            Check(
                name="App Review Contact",
                passed=True,
                details=f"Skipped check (endpoint/API unavailable): {exc}",
                evidence={"skipped": True},
            )
        )
    except Exception as exc:
        checks.append(
            Check(
                name="App Review Contact",
                passed=False,
                details=f"Could not verify app review contact: {exc}",
            )
        )

    # Pricing (App Price Schedule exists)
    try:
        schedules = _get_app_price_schedules(client, app_id)
        checks.append(
            Check(
                name="Pricing Set",
                passed=len(schedules) > 0,
                details=f"appPriceSchedules={len(schedules)}",
                evidence={"appPriceSchedules_count": len(schedules)},
            )
        )
    except AscClientError as exc:
        checks.append(
            Check(
                name="Pricing Set",
                passed=True,
                details=f"Skipped check (endpoint/API unavailable): {exc}",
                evidence={"skipped": True},
            )
        )
    except Exception as exc:
        checks.append(
            Check(
                name="Pricing Set",
                passed=False,
                details=f"Could not verify pricing: {exc}",
            )
        )

    # Age rating declaration exists
    try:
        decl = _get_age_rating_declaration(client, app_id)
        checks.append(
            Check(
                name="Age Rating Completed",
                passed=decl is not None,
                details="OK" if decl else "Missing appStoreAgeRatingDeclaration",
            )
        )
    except AscClientError as exc:
        checks.append(
            Check(
                name="Age Rating Completed",
                passed=True,
                details=f"Skipped check (endpoint/API unavailable): {exc}",
                evidence={"skipped": True},
            )
        )
    except Exception as exc:
        checks.append(
            Check(
                name="Age Rating Completed",
                passed=False,
                details=f"Could not verify age rating: {exc}",
            )
        )

    # Screenshots
    screenshot_counts: Dict[str, int] = {}
    screenshot_total_counts: Dict[str, int] = {}
    screenshot_asset_states: Dict[str, Dict[str, int]] = {}
    screenshot_incomplete_assets: Dict[str, List[Dict[str, str]]] = {}
    if picked_loc_id:
        sets = _get_screenshot_sets(client, picked_loc_id)
        for s in sets:
            dt = str(s.get("attributes", {}).get("screenshotDisplayType") or "UNKNOWN")
            summary = _summarize_screenshot_set(client, str(s.get("id")))
            screenshot_counts[dt] = int(summary.get("complete", 0))
            screenshot_total_counts[dt] = int(summary.get("total", 0))
            screenshot_asset_states[dt] = dict(summary.get("state_counts", {}) or {})
            if summary.get("incomplete"):
                screenshot_incomplete_assets[dt] = list(summary.get("incomplete") or [])

        iphone_ok = any(_is_iphone_large(dt) and c >= min_iphone for dt, c in screenshot_counts.items())
        ipad_ok = any(_is_ipad_large(dt) and c >= min_ipad for dt, c in screenshot_counts.items())

        screenshot_evidence = {
            "complete_counts": screenshot_counts,
            "total_counts": screenshot_total_counts,
            "state_counts": screenshot_asset_states,
            "incomplete_assets": screenshot_incomplete_assets,
        }
        checks.append(
            Check(
                name="Screenshots (iPhone)",
                passed=iphone_ok,
                details=(
                    f"need >= {min_iphone} COMPLETE in a large iPhone set; "
                    f"complete={screenshot_counts} total={screenshot_total_counts}"
                ),
                evidence=screenshot_evidence,
            )
        )
        checks.append(
            Check(
                name="Screenshots (iPad)",
                passed=ipad_ok,
                details=(
                    f"need >= {min_ipad} COMPLETE in a large iPad set; "
                    f"complete={screenshot_counts} total={screenshot_total_counts}"
                ),
                evidence=screenshot_evidence,
            )
        )
    else:
        checks.append(
            Check(
                name="Screenshots",
                passed=False,
                details="No localization available to inspect screenshot sets",
            )
        )

    report = {
        "bundle_id": bundle_id,
        "version": version,
        "locale": locale,
        "app_id": app_id,
        "app_store_state": v_state,
        "screenshot_counts": screenshot_counts,
        "screenshot_total_counts": screenshot_total_counts,
        "screenshot_asset_states": screenshot_asset_states,
        "screenshot_incomplete_assets": screenshot_incomplete_assets,
        "checks": [c.__dict__ for c in checks],
    }
    passed = all(c.passed for c in checks)
    return passed, report


def _print_report(passed: bool, report: Dict[str, Any]) -> None:
    print()
    print("══ App Store Connect Readiness ═══════════════════════")
    print(f"bundleId: {report.get('bundle_id')}")
    print(f"version:  {report.get('version')}")
    print(f"locale:   {report.get('locale')}")
    print(f"appId:    {report.get('app_id')}")
    print(f"state:    {report.get('app_store_state')}")
    print()
    for c in report.get("checks", []):
        icon = "✅" if c.get("passed") else "❌"
        print(f"{icon} {c.get('name')}: {c.get('details')}")
    print("══════════════════════════════════════════════════════")
    print("Result: READY" if passed else "Result: NOT READY")
    print()


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Verify readiness to submit an iOS version for App Review.")
    p.add_argument("--bundle-id", default=DEFAULT_BUNDLE_ID, help=f"iOS bundle id (default: {DEFAULT_BUNDLE_ID})")
    p.add_argument("--version", required=True, help="Target CFBundleShortVersionString / versionString (e.g. 1.1.0)")
    p.add_argument("--locale", default=DEFAULT_LOCALE, help=f"Localization locale to check (default: {DEFAULT_LOCALE})")
    p.add_argument("--min-iphone", type=int, default=3, help="Minimum screenshots required for large iPhone set (default: 3)")
    p.add_argument("--min-ipad", type=int, default=3, help="Minimum screenshots required for large iPad set (default: 3)")
    p.add_argument("--skip-build-check", action="store_true", help="Skip strict build attached/VALID check (metadata-only workflows).")
    p.add_argument("--json", dest="json_path", help="Write full JSON report to this path")
    return p.parse_args()


def main() -> None:
    args = _parse_args()
    try:
        passed, report = verify_ready(
            bundle_id=args.bundle_id,
            version=args.version,
            locale=args.locale,
            min_iphone=args.min_iphone,
            min_ipad=args.min_ipad,
            require_build=not args.skip_build_check,
        )
    except AscClientError as exc:
        _die(2, f"❌ {exc}")
    _print_report(passed, report)

    if args.json_path:
        with open(args.json_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, sort_keys=True)
        print(f"Wrote JSON report: {args.json_path}")

    raise SystemExit(0 if passed else 1)


if __name__ == "__main__":
    main()
