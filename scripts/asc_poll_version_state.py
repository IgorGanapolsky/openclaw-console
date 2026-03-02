#!/usr/bin/env python3
"""Poll App Store Connect for an iOS App Store version state.

Used by CI to read back *actual* submission state after fastlane `deliver` submits a version.
This script only reads ASC and does not mutate anything.
"""

from __future__ import annotations

import argparse
import json
import sys

from scripts.asc_client import ASCClient, AscClientError
from scripts.asc_submit_for_review import die, first, get_app, get_version_state, info, wait_for_state


def find_app_store_version_id(client: ASCClient, *, app_id: str, version: str) -> tuple[str, str]:
    versions = client.get_all(
        f"/apps/{app_id}/appStoreVersions",
        params={
            "filter[platform]": "IOS",
            "filter[versionString]": version,
            "limit": 10,
            "fields[appStoreVersions]": "versionString,appStoreState",
        },
    )
    v = first(versions)
    if not v:
        die(f"App Store version {version} not found for app id={app_id}")
    vid = v.get("id") or ""
    state = ((v.get("attributes") or {}) if isinstance(v, dict) else {}).get("appStoreState", "UNKNOWN")
    if not vid:
        die(f"App Store version {version} returned without an id (unexpected)")
    return vid, state


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Poll App Store Connect for an App Store version state.")
    p.add_argument("--bundle-id", default="com.openclaw.console")
    p.add_argument("--version", required=True, help="Marketing version (e.g. 1.1.1)")
    p.add_argument("--wait", action="store_true", help="Poll until a submitted/review state or terminal failure.")
    p.add_argument("--timeout", type=int, default=1800)
    p.add_argument("--poll-interval", type=int, default=20)
    p.add_argument("--json", action="store_true", help="Emit a single JSON object to stdout (no progress logs).")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    try:
        client = ASCClient.from_env(timeout=30)
    except AscClientError as exc:
        die(str(exc), code=2)

    app = get_app(client, args.bundle_id)
    app_id = app["id"]
    version_id, discovered_state = find_app_store_version_id(client, app_id=app_id, version=args.version)

    if args.json:
        # Keep this stable for CI parsing.
        print(json.dumps({"app_id": app_id, "version_id": version_id, "state": discovered_state}))
        return 0

    info(f"App: {args.bundle_id} (id={app_id})")
    info(f"App Store version id={version_id} state={discovered_state}")

    if args.wait:
        final_state = wait_for_state(client, version_id, timeout=args.timeout, poll_interval=args.poll_interval)
        info(f"Final App Store version state: {final_state}")

    # Always read back once more at the end (defensive against racey intermediate states).
    state = get_version_state(client, version_id)
    info(f"Read-back App Store version state: {state}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
