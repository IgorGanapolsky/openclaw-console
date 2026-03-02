#!/usr/bin/env python3
"""Resolve an editable iOS App Store version for metadata/release automation.

Why this exists:
- Uploading screenshots/metadata to a live App Store version can appear to "succeed"
  while storefront media remains unchanged.
- CI should deterministically target an editable App Store version, creating one
  only when explicitly allowed.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from scripts.asc_client import ASCClient, AscClientError
from scripts.asc_submit_for_review import die, get_app


# States that are not safe targets for listing edits.
NON_EDITABLE_STATES = {
    "ACCEPTED",
    "APPROVED",
    "IN_REVIEW",
    "INVALID_BINARY",
    "PENDING_APPLE_RELEASE",
    "PENDING_DEVELOPER_RELEASE",
    "PENDING_DEVELOPER_RELEASE_REJECTED",
    "PENDING_RELEASE",
    "PREORDER_READY_FOR_SALE",
    "PROCESSING_FOR_DISTRIBUTION",
    "READY_FOR_DISTRIBUTION",
    "READY_FOR_SALE",
    "REMOVED_FROM_SALE",
    "REPLACED_WITH_NEW_VERSION",
    "WAITING_FOR_EXPORT_COMPLIANCE",
    "WAITING_FOR_REVIEW",
}


def info(msg: str) -> None:
    print(f"▸ {msg}")


def _parse_semver(value: str) -> Tuple[int, int, int]:
    m = re.fullmatch(r"\s*(\d+)\.(\d+)\.(\d+)\s*", value or "")
    if not m:
        raise ValueError(f"Invalid semantic version: {value!r} (expected X.Y.Z)")
    return int(m.group(1)), int(m.group(2)), int(m.group(3))


def _bump_patch(value: str) -> str:
    major, minor, patch = _parse_semver(value)
    return f"{major}.{minor}.{patch + 1}"


def _is_editable_state(state: Optional[str]) -> bool:
    s = (state or "").strip().upper()
    if not s:
        return False
    return s not in NON_EDITABLE_STATES


def _list_ios_versions(client: ASCClient, app_id: str) -> List[Dict[str, Any]]:
    return client.get_all(
        f"/apps/{app_id}/appStoreVersions",
        params={
            "filter[platform]": "IOS",
            "limit": 200,
            "fields[appStoreVersions]": "versionString,appStoreState,platform,createdDate",
        },
    )


def _find_version(versions: List[Dict[str, Any]], version: str) -> Optional[Dict[str, Any]]:
    for v in versions:
        attrs = v.get("attributes") or {}
        if str(attrs.get("versionString") or "") == version:
            return v
    return None


def _semver_or_none(value: str) -> Optional[Tuple[int, int, int]]:
    try:
        return _parse_semver(value)
    except ValueError:
        return None


def _pick_highest_editable_version(versions: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    editable: List[Tuple[Tuple[int, int, int], Dict[str, Any]]] = []
    fallback: List[Dict[str, Any]] = []
    for item in versions:
        attrs = item.get("attributes") or {}
        state = str(attrs.get("appStoreState") or "UNKNOWN")
        if not _is_editable_state(state):
            continue
        fallback.append(item)
        parsed = _semver_or_none(str(attrs.get("versionString") or ""))
        if parsed is not None:
            editable.append((parsed, item))

    if editable:
        editable.sort(key=lambda x: x[0], reverse=True)
        return editable[0][1]
    if fallback:
        return fallback[0]
    return None


def _create_ios_version(client: ASCClient, app_id: str, version: str) -> Dict[str, Any]:
    payload = client.request(
        "POST",
        "/appStoreVersions",
        payload={
            "data": {
                "type": "appStoreVersions",
                "attributes": {"platform": "IOS", "versionString": version},
                "relationships": {"app": {"data": {"type": "apps", "id": app_id}}},
            }
        },
    )
    data = payload.get("data")
    if not isinstance(data, dict):
        die(f"Failed to create App Store version {version}: malformed response", code=2)
    return data


@dataclass
class Resolution:
    selected_version: str
    selected_state: str
    created: bool
    reason: str
    selected_id: Optional[str] = None
    preferred_version: Optional[str] = None


def resolve_version(
    *,
    client: ASCClient,
    app_id: str,
    preferred_version: str,
    create_if_needed: bool,
    auto_next_patch: bool,
) -> Resolution:
    versions = _list_ios_versions(client, app_id)
    highest_editable = _pick_highest_editable_version(versions)
    current = _find_version(versions, preferred_version)
    if current:
        attrs = current.get("attributes") or {}
        state = str(attrs.get("appStoreState") or "UNKNOWN")
        if _is_editable_state(state):
            return Resolution(
                selected_version=preferred_version,
                selected_state=state,
                created=False,
                reason="preferred_version_editable",
                selected_id=str(current.get("id") or ""),
                preferred_version=preferred_version,
            )

        if not auto_next_patch:
            die(
                f"Preferred App Store version {preferred_version} exists but is not editable (state={state}). "
                "Provide an editable version or enable --auto-next-patch.",
                code=1,
            )

        if highest_editable:
            editable_attrs = highest_editable.get("attributes") or {}
            editable_version = str(editable_attrs.get("versionString") or "")
            editable_state = str(editable_attrs.get("appStoreState") or "UNKNOWN")
            return Resolution(
                selected_version=editable_version,
                selected_state=editable_state,
                created=False,
                reason=f"preferred_non_editable_{state}_reused_highest_editable",
                selected_id=str(highest_editable.get("id") or ""),
                preferred_version=preferred_version,
            )

        candidate = _bump_patch(preferred_version)
        while True:
            existing = _find_version(versions, candidate)
            if not existing:
                if not create_if_needed:
                    die(
                        f"Next patch version {candidate} does not exist and create_if_needed is disabled.",
                        code=1,
                    )
                try:
                    created = _create_ios_version(client, app_id, candidate)
                except RuntimeError as exc:
                    if "409" in str(exc):
                        # ASC won't allow creating new versions while another is in review.
                        # Return the preferred version as-is so downstream steps can check its state.
                        info(f"Cannot create {candidate} (HTTP 409). Returning preferred {preferred_version} (state={state}).")
                        return Resolution(
                            selected_version=preferred_version,
                            selected_state=state,
                            created=False,
                            reason=f"preferred_non_editable_{state}_create_blocked_409",
                            selected_id=str(current.get("id") or ""),
                            preferred_version=preferred_version,
                        )
                    raise
                created_state = str((created.get("attributes") or {}).get("appStoreState") or "UNKNOWN")
                return Resolution(
                    selected_version=candidate,
                    selected_state=created_state,
                    created=True,
                    reason=f"preferred_non_editable_{state}_created_next_patch",
                    selected_id=str(created.get("id") or ""),
                    preferred_version=preferred_version,
                )

            existing_state = str((existing.get("attributes") or {}).get("appStoreState") or "UNKNOWN")
            if _is_editable_state(existing_state):
                return Resolution(
                    selected_version=candidate,
                    selected_state=existing_state,
                    created=False,
                    reason=f"preferred_non_editable_{state}_reused_existing_patch",
                    selected_id=str(existing.get("id") or ""),
                    preferred_version=preferred_version,
                )
            candidate = _bump_patch(candidate)

    if auto_next_patch and highest_editable:
        editable_attrs = highest_editable.get("attributes") or {}
        editable_version = str(editable_attrs.get("versionString") or "")
        editable_state = str(editable_attrs.get("appStoreState") or "UNKNOWN")
        return Resolution(
            selected_version=editable_version,
            selected_state=editable_state,
            created=False,
            reason="preferred_missing_reused_highest_editable",
            selected_id=str(highest_editable.get("id") or ""),
            preferred_version=preferred_version,
        )

    if not create_if_needed:
        die(f"Preferred App Store version {preferred_version} does not exist and create_if_needed is disabled.", code=1)

    created = _create_ios_version(client, app_id, preferred_version)
    created_state = str((created.get("attributes") or {}).get("appStoreState") or "UNKNOWN")
    return Resolution(
        selected_version=preferred_version,
        selected_state=created_state,
        created=True,
        reason="preferred_missing_created",
        selected_id=str(created.get("id") or ""),
        preferred_version=preferred_version,
    )


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Resolve an editable App Store version for iOS listing automation.")
    p.add_argument("--bundle-id", default="com.openclaw.console")
    p.add_argument("--preferred-version", required=True, help="Preferred marketing version (X.Y.Z).")
    p.add_argument("--create-if-needed", action="store_true", help="Create target version when missing.")
    p.add_argument("--auto-next-patch", action="store_true", help="If preferred version is not editable, target next patch.")
    p.add_argument("--json-out", help="Write JSON resolution payload to this path.")
    return p.parse_args()


def main() -> int:
    args = _parse_args()
    try:
        _parse_semver(args.preferred_version)
    except ValueError as exc:
        die(str(exc), code=2)

    try:
        client = ASCClient.from_env(timeout=30)
    except AscClientError as exc:
        die(str(exc), code=2)
    app = get_app(client, args.bundle_id)
    app_id = str(app.get("id") or "")
    if not app_id:
        die(f"Could not resolve app id for bundleId={args.bundle_id}", code=2)

    result = resolve_version(
        client=client,
        app_id=app_id,
        preferred_version=args.preferred_version,
        create_if_needed=args.create_if_needed,
        auto_next_patch=args.auto_next_patch,
    )
    payload = {
        "bundle_id": args.bundle_id,
        "app_id": app_id,
        "preferred_version": result.preferred_version,
        "selected_version": result.selected_version,
        "selected_state": result.selected_state,
        "selected_id": result.selected_id,
        "created": result.created,
        "reason": result.reason,
    }

    info(
        "Resolved App Store version "
        f"{result.selected_version} (state={result.selected_state}, created={str(result.created).lower()}, reason={result.reason})"
    )
    print(result.selected_version)

    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, sort_keys=True)
        info(f"Wrote JSON report: {args.json_out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
