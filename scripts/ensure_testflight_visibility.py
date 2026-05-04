#!/usr/bin/env python3
"""Verify an OpenClaw TestFlight build is processed and visible to internal testers."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen


APP_STORE_CONNECT_API = "https://api.appstoreconnect.apple.com/v1"
IOS_BUNDLE_ID = "com.openclaw.console"
INTERNAL_PSEUDO_GROUPS = {
    "app store connect users",
    "appstore connect users",
    "asc users",
}


def csv(raw: str) -> list[str]:
    return [item.strip() for item in raw.split(",") if item.strip()]


def is_internal_pseudo_group(name: str) -> bool:
    return " ".join(name.strip().lower().split()) in INTERNAL_PSEUDO_GROUPS


def private_key_from_env() -> str:
    raw = (os.environ.get("APPSTORE_PRIVATE_KEY") or "").strip()
    if raw and "-----BEGIN" in raw:
        return raw

    path = (
        os.environ.get("APPSTORE_PRIVATE_KEY_PATH")
        or os.environ.get("APPSTORE_KEY_PATH")
        or ""
    ).strip()
    if not path and os.environ.get("APPSTORE_KEY_ID"):
        path = f"~/.appstoreconnect/private_keys/AuthKey_{os.environ['APPSTORE_KEY_ID']}.p8"

    expanded = Path(path).expanduser() if path else None
    if expanded and expanded.is_file():
        return expanded.read_text(encoding="utf-8")

    if raw:
        return raw

    raise RuntimeError("Missing APPSTORE_PRIVATE_KEY or APPSTORE_PRIVATE_KEY_PATH")


def asc_token() -> str:
    try:
        import jwt
    except ImportError as exc:
        raise RuntimeError("Missing PyJWT. Install pyjwt and cryptography.") from exc

    key_id = os.environ.get("APPSTORE_KEY_ID", "").strip()
    issuer_id = os.environ.get("APPSTORE_ISSUER_ID", "").strip()
    if not key_id or not issuer_id:
        raise RuntimeError("Missing APPSTORE_KEY_ID or APPSTORE_ISSUER_ID")

    now = int(time.time())
    return jwt.encode(
        {
            "iss": issuer_id,
            "iat": now,
            "exp": now + 20 * 60,
            "aud": "appstoreconnect-v1",
        },
        private_key_from_env(),
        algorithm="ES256",
        headers={"kid": key_id, "typ": "JWT"},
    )


class ASCClient:
    def __init__(self) -> None:
        self.token = asc_token()

    def request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, str] | None = None,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        query = f"?{urlencode(params)}" if params else ""
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        req = Request(
            f"{APP_STORE_CONNECT_API}{path}{query}",
            data=data,
            method=method,
            headers={
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json",
            },
        )
        with urlopen(req, timeout=30) as response:
            body = response.read().decode("utf-8")
            return json.loads(body) if body else {}

    def get_all(self, path: str, *, params: dict[str, str] | None = None) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        next_url: str | None = None
        while True:
            if next_url:
                req = Request(next_url, headers={"Authorization": f"Bearer {self.token}"})
                with urlopen(req, timeout=30) as response:
                    payload = json.loads(response.read().decode("utf-8"))
            else:
                payload = self.request("GET", path, params=params)
            items.extend(payload.get("data", []))
            next_url = payload.get("links", {}).get("next")
            if not next_url:
                return items


class TestFlightVisibility:
    def __init__(self, client: ASCClient, bundle_id: str) -> None:
        self.client = client
        self.bundle_id = bundle_id

    def app_id(self) -> str:
        payload = self.client.request("GET", "/apps", params={"filter[bundleId]": self.bundle_id})
        apps = payload.get("data", [])
        if not apps:
            raise RuntimeError(f"No App Store Connect app found for bundle id {self.bundle_id}")
        return apps[0]["id"]

    def latest_build(self, app_id: str, marketing_version: str) -> dict[str, Any]:
        payload = self.client.request(
            "GET",
            "/builds",
            params={
                "filter[app]": app_id,
                "include": "preReleaseVersion",
                "sort": "-uploadedDate",
                "limit": "50",
                "fields[builds]": "version,processingState,uploadedDate,preReleaseVersion",
                "fields[preReleaseVersions]": "version",
            },
        )
        versions = {
            item["id"]: item.get("attributes", {}).get("version")
            for item in payload.get("included", [])
            if item.get("type") == "preReleaseVersions"
        }
        for build in payload.get("data", []):
            rel = build.get("relationships", {}).get("preReleaseVersion", {}).get("data")
            rel_id = rel.get("id") if isinstance(rel, dict) else None
            if versions.get(rel_id) == marketing_version:
                return build
        raise RuntimeError(f"No TestFlight build found for marketing version {marketing_version}")

    def groups(self, app_id: str) -> dict[str, dict[str, Any]]:
        groups = self.client.get_all(f"/apps/{app_id}/betaGroups", params={"limit": "200"})
        return {group["attributes"]["name"]: group for group in groups}

    def group_build_ids(self, group_id: str) -> set[str]:
        builds = self.client.get_all(f"/betaGroups/{group_id}/builds", params={"limit": "200"})
        return {build["id"] for build in builds}

    def group_testers(self, group_id: str) -> set[str]:
        testers = self.client.get_all(f"/betaGroups/{group_id}/betaTesters", params={"limit": "200"})
        return {
            (tester.get("attributes", {}).get("email") or "").strip().lower()
            for tester in testers
            if tester.get("attributes", {}).get("email")
        }

    def beta_tester(self, email: str) -> dict[str, Any] | None:
        payload = self.client.request(
            "GET",
            "/betaTesters",
            params={
                "filter[email]": email,
                "fields[betaTesters]": "email,firstName,lastName,inviteType",
                "limit": "1",
            },
        )
        testers = payload.get("data", [])
        return testers[0] if testers else None

    def beta_tester_build_ids(self, tester_id: str) -> set[str]:
        builds = self.client.get_all(f"/betaTesters/{tester_id}/relationships/builds", params={"limit": "200"})
        return {build["id"] for build in builds}

    def attach_beta_tester_build(self, tester_id: str, build_id: str) -> None:
        try:
            self.client.request(
                "POST",
                f"/betaTesters/{tester_id}/relationships/builds",
                payload={"data": [{"type": "builds", "id": build_id}]},
            )
        except Exception as exc:
            if "409" not in str(exc):
                raise

    def attach_external_group_build(self, group_id: str, build_id: str) -> None:
        try:
            self.client.request(
                "POST",
                f"/betaGroups/{group_id}/relationships/builds",
                payload={"data": [{"type": "builds", "id": build_id}]},
            )
        except Exception as exc:
            if "409" not in str(exc):
                raise

    def ensure(
        self,
        version: str,
        groups: list[str],
        required_testers: list[str],
        *,
        assign_required_testers: bool = False,
    ) -> dict[str, Any]:
        app_id = self.app_id()
        build = self.latest_build(app_id, version)
        build_id = build["id"]
        attrs = build.get("attributes", {})
        build_number = str(attrs.get("version", "?"))
        processing_state = attrs.get("processingState", "UNKNOWN")
        if processing_state != "VALID":
            raise RuntimeError(
                f"Latest TestFlight build {version} ({build_number}) is not VALID; processingState={processing_state}"
            )

        real_groups = [name for name in groups if not is_internal_pseudo_group(name)]
        app_groups = self.groups(app_id) if real_groups else {}
        verified_groups: list[str] = []
        missing_groups: list[str] = []
        missing_testers: list[str] = []
        assigned_required_testers: list[str] = []

        for name in groups:
            if is_internal_pseudo_group(name):
                verified_groups.append(name)
                continue

            group = app_groups.get(name)
            if not group:
                missing_groups.append(name)
                continue

            group_id = group["id"]
            attrs = group.get("attributes", {})
            if not bool(attrs.get("isInternalGroup")):
                self.attach_external_group_build(group_id, build_id)

            if build_id not in self.group_build_ids(group_id):
                raise RuntimeError(f"Build {version} ({build_number}) is missing from TestFlight group '{name}'")

            testers = self.group_testers(group_id)
            missing = [email for email in required_testers if email.lower() not in testers]
            if missing:
                missing_testers.append(f"{name}: {', '.join(missing)}")
            verified_groups.append(name)

        if missing_groups:
            raise RuntimeError("Missing TestFlight groups: " + ", ".join(missing_groups))

        if groups and all(is_internal_pseudo_group(name) for name in groups):
            missing: list[str] = []
            missing_build_access: list[str] = []
            for email in required_testers:
                normalized_email = email.lower()
                tester = self.beta_tester(normalized_email)
                if not tester:
                    missing.append(normalized_email)
                    continue

                tester_id = tester["id"]
                if build_id in self.beta_tester_build_ids(tester_id):
                    continue

                if assign_required_testers:
                    self.attach_beta_tester_build(tester_id, build_id)
                    if build_id in self.beta_tester_build_ids(tester_id):
                        assigned_required_testers.append(normalized_email)
                        continue

                missing_build_access.append(normalized_email)

            if missing:
                raise RuntimeError(
                    "Required internal TestFlight testers missing from App Store Connect beta testers: "
                    + ", ".join(missing)
                )
            if missing_build_access:
                raise RuntimeError(
                    "Required internal TestFlight testers are not assigned to build "
                    f"{version} ({build_number}): " + ", ".join(missing_build_access)
                )

        if missing_testers:
            raise RuntimeError("Required TestFlight testers missing from group membership: " + "; ".join(missing_testers))

        return {
            "status": "VISIBLE",
            "version": version,
            "build_number": build_number,
            "processing_state": processing_state,
            "groups": verified_groups,
            "required_testers_checked": len(required_testers),
            "required_testers_assigned": len(assigned_required_testers),
        }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", required=True)
    parser.add_argument("--bundle-id", default=IOS_BUNDLE_ID)
    parser.add_argument("--groups", default="")
    parser.add_argument("--required-testers", default="")
    parser.add_argument("--assign-required-testers", action="store_true")
    parser.add_argument("--wait", action="store_true")
    parser.add_argument("--timeout", type=int, default=900)
    parser.add_argument("--poll-interval", type=int, default=60)
    args = parser.parse_args()

    deadline = time.monotonic() + args.timeout
    last_error: Exception | None = None

    while True:
        try:
            result = TestFlightVisibility(ASCClient(), args.bundle_id).ensure(
                args.version,
                csv(args.groups),
                [email.lower() for email in csv(args.required_testers)],
                assign_required_testers=args.assign_required_testers,
            )
            print(json.dumps(result, sort_keys=True))
            return 0
        except Exception as exc:
            last_error = exc
            if not args.wait or time.monotonic() >= deadline:
                break
            print(f"Waiting for TestFlight visibility: {exc}", file=sys.stderr)
            time.sleep(args.poll_interval)

    print(f"TestFlight visibility check failed: {last_error}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
