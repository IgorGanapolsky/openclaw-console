#!/usr/bin/env python3
"""Post-upload release verification for Google Play and App Store Connect.

Queries official APIs to confirm that uploaded builds landed on the correct
track, processed successfully, and (optionally) entered review.

Exit codes:
    0 - All checks passed
    1 - Verification failed (build missing, wrong track, processing error)
    2 - Configuration error (missing credentials, invalid arguments)

Usage:
    python scripts/verify_release.py --platform android --track alpha --version-code 5
    python scripts/verify_release.py --platform ios --version 1.1.1
    python scripts/verify_release.py --platform both --version 1.1.1 --version-code 5 --wait
"""

import argparse
import json
import os
import sys
import tempfile
import time
from typing import Optional

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ANDROID_PACKAGE = "com.openclaw.console"
IOS_BUNDLE_ID = "com.openclaw.console"
APP_STORE_CONNECT_API = "https://api.appstoreconnect.apple.com/v1"

DEFAULT_POLL_INTERVAL = 30  # seconds
DEFAULT_TIMEOUT = 600  # 10 minutes


# ---------------------------------------------------------------------------
# Google Play Verifier
# ---------------------------------------------------------------------------

class GooglePlayVerifier:
    """Verify a build exists on the expected Google Play track (read-only)."""

    def __init__(self, package_name: str = ANDROID_PACKAGE):
        self.package_name = package_name
        self.service = None
        self._service_account_email: Optional[str] = None

    @staticmethod
    def _patch_importlib_metadata():
        """Patch stdlib importlib.metadata for Python < 3.10 compatibility.

        google-api-python-client (and its deps) may call
        importlib.metadata.packages_distributions, which is only present in
        Python 3.10+. We have importlib_metadata installed as a backport.
        """
        try:
            import importlib.metadata as md  # stdlib
            if hasattr(md, "packages_distributions"):
                return
            import importlib_metadata as md_backport  # type: ignore
            md.packages_distributions = md_backport.packages_distributions  # type: ignore[attr-defined]
        except Exception:
            # Best-effort: if this fails, we'll surface the import error later.
            pass

    @staticmethod
    def _resolve_google_play_key() -> str:
        """Return GOOGLE_PLAY_JSON_KEY(_PATH) or a conventional fallback path."""
        key_env = (os.environ.get("GOOGLE_PLAY_JSON_KEY") or "").strip()
        if key_env:
            return key_env

        key_path = (os.environ.get("GOOGLE_PLAY_JSON_KEY_PATH") or "").strip()
        if key_path:
            return key_path

        # Fastlane default in this repo (android/fastlane/Appfile)
        fallback = os.path.join(tempfile.gettempdir(), "play-service-account.json")
        if os.path.isfile(fallback):
            return fallback

        return ""

    def _extract_service_account_email(self, key_value: str) -> Optional[str]:
        """Return client_email from a service account JSON (path or raw JSON)."""
        try:
            if os.path.isfile(key_value):
                with open(key_value, "r", encoding="utf-8") as f:
                    info = json.load(f)
            else:
                info = json.loads(key_value)
            email = info.get("client_email")
            return str(email) if email else None
        except Exception:
            return None

    def authenticate(self):
        """Build the androidpublisher service from GOOGLE_PLAY_JSON_KEY."""
        self._patch_importlib_metadata()
        try:
            from google.oauth2 import service_account
            from googleapiclient.discovery import build
        except ImportError:
            print("❌ Missing google-api-python-client / google-auth. "
                  "Install: pip install google-api-python-client google-auth",
                  file=sys.stderr)
            sys.exit(2)

        key_env = self._resolve_google_play_key()
        if not key_env:
            print(
                "❌ Missing Google Play service account key.\n"
                "Set one of:\n"
                "  - GOOGLE_PLAY_JSON_KEY (path or raw JSON)\n"
                "  - GOOGLE_PLAY_JSON_KEY_PATH (path)\n"
                "Or ensure /tmp/play-service-account.json exists.",
                  file=sys.stderr)
            sys.exit(2)

        self._service_account_email = self._extract_service_account_email(key_env)

        scopes = ["https://www.googleapis.com/auth/androidpublisher"]

        # Accept either a file path or raw JSON string
        if os.path.isfile(key_env):
            credentials = service_account.Credentials.from_service_account_file(
                key_env, scopes=scopes
            )
        else:
            info = json.loads(key_env)
            credentials = service_account.Credentials.from_service_account_info(
                info, scopes=scopes
            )

        self.service = build("androidpublisher", "v3", credentials=credentials)

    def verify(self, track: str, version_code: int) -> dict:
        """Check that version_code appears on the given track.

        Creates a read-only edit, queries the track, then deletes the edit.
        Returns dict with keys: passed (bool), status (str), details (str).
        """
        if self.service is None:
            self.authenticate()

        edits = self.service.edits()
        edit_id = None

        try:
            edit = edits.insert(body={}, packageName=self.package_name).execute()
            edit_id = edit["id"]

            track_info = edits.tracks().get(
                packageName=self.package_name,
                editId=edit_id,
                track=track,
            ).execute()

            releases = track_info.get("releases", [])
            for release in releases:
                codes = [int(c) for c in release.get("versionCodes", [])]
                if version_code in codes:
                    status = release.get("status", "unknown")
                    return {
                        "passed": status in ("completed", "inProgress", "draft", "halted"),
                        "status": status,
                        "details": (
                            f"versionCode {version_code} found on '{track}' "
                            f"track with status '{status}'"
                        ),
                    }

            # Not found on any release in this track
            all_codes = []
            for r in releases:
                all_codes.extend(r.get("versionCodes", []))
            return {
                "passed": False,
                "status": "NOT_FOUND",
                "details": (
                    f"versionCode {version_code} not found on '{track}' track. "
                    f"Codes on track: {all_codes or 'none'}"
                ),
            }

        except Exception as e:
            # Add extra context for the common 403 "caller does not have permission".
            details = f"Google Play API error: {e}"
            if "403" in str(e) and self._service_account_email:
                details += (
                    f"\n  Service account: {self._service_account_email}\n"
                    "  Fix: Add this service account as a user in Play Console with\n"
                    "  sufficient access to the app, and ensure 'API access' is set up."
                )
            return {
                "passed": False,
                "status": "ERROR",
                "details": details,
            }
        finally:
            if edit_id is not None:
                try:
                    edits.delete(
                        packageName=self.package_name, editId=edit_id
                    ).execute()
                except Exception:
                    pass  # Best-effort cleanup


# ---------------------------------------------------------------------------
# App Store Connect Verifier
# ---------------------------------------------------------------------------

class AppStoreVerifier:
    """Verify a build processed on TestFlight / App Store Connect."""

    def __init__(self, bundle_id: str = IOS_BUNDLE_ID):
        self.bundle_id = bundle_id
        self._token = None
        self._token_expiry = 0

    def _get_token(self) -> str:
        """Generate a JWT for App Store Connect API."""
        now = time.time()
        if self._token and now < self._token_expiry - 30:
            return self._token

        try:
            import jwt  # PyJWT
        except ImportError:
            print("❌ Missing PyJWT. Install: pip install pyjwt cryptography",
                  file=sys.stderr)
            sys.exit(2)

        key_id = os.environ.get("APPSTORE_KEY_ID", "")
        issuer_id = os.environ.get("APPSTORE_ISSUER_ID", "")
        private_key = (os.environ.get("APPSTORE_PRIVATE_KEY") or "").strip()
        if not private_key:
            private_key = (os.environ.get("APPSTORE_PRIVATE_KEY_PATH") or "").strip()
        if not private_key:
            # Fastlane convention in this repo: ~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8
            default_key_path = os.path.expanduser(
                f"~/.appstoreconnect/private_keys/AuthKey_{key_id}.p8"
            )
            if os.path.isfile(default_key_path):
                private_key = default_key_path

        if not all([key_id, issuer_id, private_key]):
            missing = []
            if not key_id:
                missing.append("APPSTORE_KEY_ID")
            if not issuer_id:
                missing.append("APPSTORE_ISSUER_ID")
            if not private_key:
                missing.append("APPSTORE_PRIVATE_KEY (or APPSTORE_PRIVATE_KEY_PATH)")
            print(f"❌ Missing env vars: {', '.join(missing)}", file=sys.stderr)
            sys.exit(2)

        # Support both raw key content and file path
        if os.path.isfile(private_key):
            with open(private_key) as f:
                private_key = f.read()

        exp = int(now) + 1200  # 20 minutes
        payload = {
            "iss": issuer_id,
            "iat": int(now),
            "exp": exp,
            "aud": "appstoreconnect-v1",
        }
        headers = {
            "alg": "ES256",
            "kid": key_id,
            "typ": "JWT",
        }

        self._token = jwt.encode(payload, private_key, algorithm="ES256", headers=headers)
        self._token_expiry = exp
        return self._token

    def _request(self, path: str, params: dict = None) -> dict:
        """Make an authenticated GET request to App Store Connect API."""
        try:
            import requests
        except ImportError:
            print("❌ Missing requests. Install: pip install requests",
                  file=sys.stderr)
            sys.exit(2)

        url = f"{APP_STORE_CONNECT_API}{path}"
        headers = {
            "Authorization": f"Bearer {self._get_token()}",
            "Content-Type": "application/json",
        }
        resp = requests.get(url, headers=headers, params=params, timeout=30)
        resp.raise_for_status()
        try:
            return resp.json()
        except Exception as exc:
            raise RuntimeError(
                f"GET {path} returned non-JSON payload: HTTP {resp.status_code} body={resp.text[:400]}"
            ) from exc

    def _get_app_id(self) -> str:
        """Look up the app ID by bundle ID."""
        data = self._request("/apps", params={"filter[bundleId]": self.bundle_id})
        apps = data.get("data", [])
        if not apps:
            print(f"❌ No app found with bundleId '{self.bundle_id}'",
                  file=sys.stderr)
            sys.exit(2)
        return apps[0]["id"]

    def verify(self, version: str) -> dict:
        """Check that a build with the given version exists and processed.

        Returns dict with keys: passed (bool), status (str), details (str).
        """
        try:
            app_id = self._get_app_id()

            # App Store Connect /builds does not consistently support filter[version].
            # Query by app and filter by version client-side.
            data = self._request(
                "/builds",
                params={
                    "filter[app]": app_id,
                    "include": "preReleaseVersion",
                    "sort": "-uploadedDate",
                    "limit": 50,
                    "fields[builds]": "version,processingState,uploadedDate,preReleaseVersion",
                    "fields[preReleaseVersions]": "version",
                },
            )

            pre_release_versions = {}
            for item in data.get("included", []):
                if item.get("type") == "preReleaseVersions":
                    pre_release_versions[item.get("id")] = (
                        item.get("attributes", {}).get("version")
                    )

            builds = []
            for build in data.get("data", []):
                pre_release_rel = (
                    build.get("relationships", {})
                    .get("preReleaseVersion", {})
                    .get("data")
                )
                pre_release_id = pre_release_rel.get("id") if pre_release_rel else None
                marketing_version = pre_release_versions.get(pre_release_id)
                if marketing_version == version:
                    builds.append(build)
            if not builds:
                return {
                    "passed": False,
                    "status": "NOT_FOUND",
                    "details": f"No builds found for version '{version}'",
                }

            latest = builds[0]
            attrs = latest.get("attributes", {})
            processing_state = attrs.get("processingState", "UNKNOWN")
            build_number = attrs.get("version", "?")

            passed = processing_state == "VALID"
            return {
                "passed": passed,
                "status": processing_state,
                "details": (
                    f"Build {build_number} (v{version}): "
                    f"processingState={processing_state}"
                ),
            }

        except Exception as e:
            return {
                "passed": False,
                "status": "ERROR",
                "details": f"App Store Connect API error: {e}",
            }

    def verify_app_store_version(self, version: str) -> dict:
        """Check the App Store version submission state."""
        try:
            app_id = self._get_app_id()

            data = self._request(
                f"/apps/{app_id}/appStoreVersions",
                params={
                    "filter[versionString]": version,
                    "limit": 1,
                    "fields[appStoreVersions]": "versionString,appStoreState,releaseType",
                },
            )

            versions = data.get("data", [])
            if not versions:
                return {
                    "passed": True,  # Not submitted yet is OK for TestFlight
                    "status": "NOT_SUBMITTED",
                    "details": f"No App Store version '{version}' submitted (TestFlight only)",
                }

            attrs = versions[0].get("attributes", {})
            state = attrs.get("appStoreState", "UNKNOWN")
            return {
                "passed": state not in ("REJECTED", "REMOVED_FROM_SALE", "DEVELOPER_REMOVED_FROM_SALE"),
                "status": state,
                "details": f"App Store version {version}: appStoreState={state}",
            }

        except Exception as e:
            return {
                "passed": False,
                "status": "ERROR",
                "details": f"App Store Connect API error: {e}",
            }


# ---------------------------------------------------------------------------
# Output Formatting
# ---------------------------------------------------------------------------

def print_results(results: list[dict]):
    """Print a formatted verification table."""
    print()
    print("══ Release Verification ══════════════════════════════")
    print(f"{'Platform':<10}{'Track':<12}{'Version':<10}{'Status'}")
    print(f"{'────────':<10}{'──────────':<12}{'─────────':<10}{'──────────────────'}")

    all_passed = True
    for r in results:
        icon = "✅" if r["passed"] else "❌"
        print(f"{r['platform']:<10}{r['track']:<12}{r['version']:<10}{icon} {r['status']}")
        if not r["passed"]:
            all_passed = False
            print(f"{'':>10}{r['details']}")

    print("══════════════════════════════════════════════════════")
    if all_passed:
        print("Result: ALL PASSED")
    else:
        print("Result: FAILED — see details above")
    print()
    return all_passed


# ---------------------------------------------------------------------------
# Polling
# ---------------------------------------------------------------------------

def poll_until_done(verify_fn, poll_interval: int, timeout: int, terminal_statuses: set[str] | None = None) -> dict:
    """Call verify_fn repeatedly until it passes or times out."""
    deadline = time.time() + timeout
    attempt = 0
    terminal_statuses = terminal_statuses or {"ERROR"}

    while True:
        attempt += 1
        result = verify_fn()

        if result["passed"]:
            return result

        if result["status"] in terminal_statuses:
            return result

        remaining = deadline - time.time()
        if remaining <= 0:
            result["details"] += f" (timed out after {timeout}s, {attempt} attempts)"
            return result

        wait = min(poll_interval, remaining)
        print(f"  ⏳ {result['status']} — retrying in {int(wait)}s "
              f"({int(remaining)}s remaining)...")
        time.sleep(wait)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify that uploaded builds landed on the correct store track."
    )
    parser.add_argument(
        "--platform",
        choices=["android", "ios", "both"],
        required=True,
        help="Platform to verify",
    )
    parser.add_argument(
        "--track",
        default="alpha",
        help="Google Play track to check (default: alpha)",
    )
    parser.add_argument(
        "--version-code",
        type=int,
        help="Android versionCode to look for",
    )
    parser.add_argument(
        "--version",
        help="iOS CFBundleShortVersionString (e.g. 1.1.1)",
    )
    parser.add_argument(
        "--wait",
        action="store_true",
        help="Poll until build finishes processing",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=DEFAULT_TIMEOUT,
        help=f"Max seconds to wait in --wait mode (default: {DEFAULT_TIMEOUT})",
    )
    parser.add_argument(
        "--poll-interval",
        type=int,
        default=DEFAULT_POLL_INTERVAL,
        help=f"Seconds between polls in --wait mode (default: {DEFAULT_POLL_INTERVAL})",
    )
    parser.add_argument(
        "--require-appstore-submission",
        action="store_true",
        help=(
            "Fail verification if the App Store version is still NOT_SUBMITTED. "
            "Use this after a submit-for-review automation step."
        ),
    )
    return parser.parse_args()


def main():
    args = parse_args()
    do_android = args.platform in ("android", "both")
    do_ios = args.platform in ("ios", "both")

    # Validate required args
    if do_android and args.version_code is None:
        print("❌ --version-code is required for Android verification",
              file=sys.stderr)
        sys.exit(2)
    if do_ios and not args.version:
        print("❌ --version is required for iOS verification", file=sys.stderr)
        sys.exit(2)

    results = []

    # --- Android ---
    if do_android:
        print(f"🔍 Verifying Android: versionCode {args.version_code} on '{args.track}' track...")
        gp = GooglePlayVerifier()

        if args.wait:
            result = poll_until_done(
                lambda: gp.verify(args.track, args.version_code),
                args.poll_interval,
                args.timeout,
                terminal_statuses={"ERROR"},
            )
        else:
            result = gp.verify(args.track, args.version_code)

        results.append({
            "platform": "Android",
            "track": args.track,
            "version": f"{args.version_code}" + (f" ({args.version})" if args.version else ""),
            **result,
        })

    # --- iOS ---
    if do_ios:
        print(f"🔍 Verifying iOS: version {args.version} on TestFlight...")
        asc = AppStoreVerifier()

        if args.wait:
            result = poll_until_done(
                lambda: asc.verify(args.version),
                args.poll_interval,
                args.timeout,
                # For iOS, NOT_FOUND usually means the version is wrong or the build
                # was never uploaded; fail fast instead of waiting out the timeout.
                terminal_statuses={"ERROR", "NOT_FOUND"},
            )
        else:
            result = asc.verify(args.version)

        results.append({
            "platform": "iOS",
            "track": "TestFlight",
            "version": args.version,
            **result,
        })

        # Also check App Store version state
        asv = asc.verify_app_store_version(args.version)
        if args.require_appstore_submission and asv.get("status") == "NOT_SUBMITTED":
            asv = {
                "passed": False,
                "status": "NOT_SUBMITTED",
                "details": (
                    f"App Store version '{args.version}' is still NOT_SUBMITTED "
                    "(expected a submitted state like WAITING_FOR_REVIEW)"
                ),
            }
        results.append({
            "platform": "iOS",
            "track": "App Store",
            "version": args.version,
            **asv,
        })

    # --- Results ---
    all_passed = print_results(results)
    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
