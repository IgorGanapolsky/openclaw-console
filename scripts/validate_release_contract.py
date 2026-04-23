#!/usr/bin/env python3
"""Validate OpenClaw's release contract across icons, metadata, and release inputs."""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ANDROID_METADATA = ROOT / "android/fastlane/metadata/android/en-US"
IOS_METADATA = ROOT / "ios/OpenClawConsole/fastlane/metadata/en-US"
ANDROID_GRADLE = ROOT / "android/app/build.gradle.kts"
IOS_PBXPROJ = ROOT / "ios/OpenClawConsole/OpenClawConsole.xcodeproj/project.pbxproj"
PRIVACY_POLICY = ROOT / "PRIVACY_POLICY.md"


@dataclass
class ValidationResult:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def error(self, message: str) -> None:
        self.errors.append(message)

    def warn(self, message: str) -> None:
        self.warnings.append(message)

    def note(self, message: str) -> None:
        self.notes.append(message)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--platform",
        choices=("android", "ios", "both"),
        default="both",
        help="Release surface to validate.",
    )
    parser.add_argument(
        "--strict-screenshots",
        action="store_true",
        help="Treat missing screenshot directories as errors instead of warnings.",
    )
    return parser.parse_args()


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8").strip()


def validate_nonempty_file(result: ValidationResult, path: Path, label: str) -> str | None:
    if not path.is_file():
        result.error(f"Missing required {label}: {path.relative_to(ROOT)}")
        return None

    content = read_text(path)
    if not content:
        result.error(f"Required {label} is empty: {path.relative_to(ROOT)}")
        return None
    return content


def validate_max_length(
    result: ValidationResult,
    label: str,
    value: str | None,
    limit: int,
) -> None:
    if value is None:
        return
    if len(value) > limit:
        result.error(f"{label} exceeds {limit} characters ({len(value)})")


def validate_https_url(result: ValidationResult, path: Path, label: str) -> str | None:
    value = validate_nonempty_file(result, path, label)
    if value is None:
        return None
    if not value.startswith("https://"):
        result.error(f"{label} must start with https://: {path.relative_to(ROOT)}")
    return value


def find_first(pattern: str, text: str) -> str | None:
    match = re.search(pattern, text, re.MULTILINE)
    return match.group(1).strip() if match else None


def android_version_info() -> tuple[str | None, str | None, bool]:
    if not ANDROID_GRADLE.is_file():
        return None, None, False

    content = ANDROID_GRADLE.read_text(encoding="utf-8")
    version_name = find_first(r'versionName\s*=\s*"([^"]+)"', content)
    version_code = find_first(r"versionCode\s*=\s*([0-9]+)", content)
    is_dynamic = "ciVersionCode ?:" in content or 'System.getenv("GITHUB_RUN_NUMBER")' in content
    return version_name, version_code, is_dynamic


def ios_version_info() -> tuple[str | None, str | None]:
    if not IOS_PBXPROJ.is_file():
        return None, None

    content = IOS_PBXPROJ.read_text(encoding="utf-8")
    marketing_version = find_first(r"MARKETING_VERSION = ([^;]+);", content)
    build_number = find_first(r"CURRENT_PROJECT_VERSION = ([^;]+);", content)
    return marketing_version, build_number


def check_icon_parity(result: ValidationResult) -> None:
    command = [sys.executable, str(ROOT / "scripts/sync_app_icons.py"), "--check"]
    run = subprocess.run(command, capture_output=True, text=True, cwd=ROOT)
    if run.returncode == 0:
        summary = run.stdout.strip() or "App icon assets match the canonical iOS marketing icon."
        result.note(summary)
        return

    stderr = run.stderr.strip()
    stdout = run.stdout.strip()
    details = "\n".join(part for part in (stdout, stderr) if part)
    if details:
        for line in details.splitlines():
            result.error(line)
    else:
        result.error("App icon parity validation failed.")


def check_privacy_policy(result: ValidationResult) -> None:
    validate_nonempty_file(result, PRIVACY_POLICY, "privacy policy")


def check_android(result: ValidationResult, strict_screenshots: bool) -> None:
    title = validate_nonempty_file(result, ANDROID_METADATA / "title.txt", "Android title")
    short_description = validate_nonempty_file(
        result,
        ANDROID_METADATA / "short_description.txt",
        "Android short description",
    )
    validate_nonempty_file(result, ANDROID_METADATA / "full_description.txt", "Android full description")

    validate_max_length(result, "Android title", title, 30)
    validate_max_length(result, "Android short description", short_description, 80)

    version_name, version_code, is_dynamic = android_version_info()
    if version_name:
        result.note(f"Android versionName={version_name}")
    if version_code:
        changelog = ANDROID_METADATA / "changelogs" / f"{version_code}.txt"
        validate_nonempty_file(result, changelog, f"Android changelog for versionCode {version_code}")
    else:
        changelog_dir = ANDROID_METADATA / "changelogs"
        changelog_files = sorted(changelog_dir.glob("*.txt")) if changelog_dir.is_dir() else []
        if not changelog_files:
            result.error("Android changelogs directory has no changelog files.")
        else:
            latest = changelog_files[-1]
            validate_nonempty_file(result, latest, "Android changelog")
            if is_dynamic:
                result.warn(
                    "Android versionCode is dynamic; validated the latest tracked changelog instead of an exact versionCode match."
                )
            else:
                result.warn("Android versionCode could not be determined exactly from build.gradle.kts.")

    screenshots_dir = ANDROID_METADATA / "images/phoneScreenshots"
    if screenshots_dir.is_dir():
        screenshot_count = len([path for path in screenshots_dir.iterdir() if path.is_file()])
        if screenshot_count < 2:
            message = (
                f"Android phone screenshots directory contains {screenshot_count} files; expected at least 2."
            )
            if strict_screenshots:
                result.error(message)
            else:
                result.warn(message)
        else:
            result.note(f"Android phone screenshots: {screenshot_count}")
    else:
        message = "Android phone screenshots directory is missing: android/fastlane/metadata/android/en-US/images/phoneScreenshots"
        if strict_screenshots:
            result.error(message)
        else:
            result.warn(message)


def check_ios(result: ValidationResult, strict_screenshots: bool) -> None:
    name = validate_nonempty_file(result, IOS_METADATA / "name.txt", "iOS app name")
    subtitle = validate_nonempty_file(result, IOS_METADATA / "subtitle.txt", "iOS subtitle")
    keywords = validate_nonempty_file(result, IOS_METADATA / "keywords.txt", "iOS keywords")

    for filename, label in (
        ("description.txt", "iOS description"),
        ("release_notes.txt", "iOS release notes"),
    ):
        validate_nonempty_file(result, IOS_METADATA / filename, label)

    validate_https_url(result, IOS_METADATA / "privacy_url.txt", "iOS privacy URL")
    validate_https_url(result, IOS_METADATA / "support_url.txt", "iOS support URL")
    validate_https_url(result, IOS_METADATA / "marketing_url.txt", "iOS marketing URL")

    validate_max_length(result, "iOS app name", name, 30)
    validate_max_length(result, "iOS subtitle", subtitle, 30)
    validate_max_length(result, "iOS keywords", keywords, 100)

    marketing_version, build_number = ios_version_info()
    if marketing_version:
        result.note(f"iOS marketingVersion={marketing_version}")
    if build_number:
        result.note(f"iOS buildNumber={build_number}")

    screenshots_root = ROOT / "ios/OpenClawConsole/fastlane/screenshots"
    locale_dir = screenshots_root / "en-US"
    candidate_dir = locale_dir if locale_dir.is_dir() else screenshots_root
    if candidate_dir.is_dir():
        screenshot_count = len([path for path in candidate_dir.rglob("*") if path.is_file()])
        if screenshot_count == 0:
            message = "iOS fastlane screenshots directory exists but has no files."
            if strict_screenshots:
                result.error(message)
            else:
                result.warn(message)
        else:
            result.note(f"iOS screenshots: {screenshot_count}")
    else:
        message = "iOS fastlane screenshots directory is missing: ios/OpenClawConsole/fastlane/screenshots"
        if strict_screenshots:
            result.error(message)
        else:
            result.warn(message)


def check_cross_platform_parity(result: ValidationResult) -> None:
    android_title = validate_nonempty_file(result, ANDROID_METADATA / "title.txt", "Android title")
    ios_name = validate_nonempty_file(result, IOS_METADATA / "name.txt", "iOS app name")
    if android_title and ios_name and android_title != ios_name:
        result.error(f"App name mismatch: Android '{android_title}' vs iOS '{ios_name}'")

    android_version_name, _, _ = android_version_info()
    ios_marketing_version, _ = ios_version_info()
    if android_version_name and ios_marketing_version and android_version_name != ios_marketing_version:
        result.warn(
            f"Version name mismatch: Android {android_version_name} vs iOS {ios_marketing_version}"
        )


def render(result: ValidationResult) -> int:
    print("OpenClaw release contract")
    print(f"Repo: {ROOT}")

    if result.notes:
        print("\nNotes:")
        for note in result.notes:
            print(f" - {note}")

    if result.warnings:
        print("\nWarnings:")
        for warning in result.warnings:
            print(f" - {warning}")

    if result.errors:
        print("\nErrors:")
        for error in result.errors:
            print(f" - {error}")
        print(f"\nRelease contract failed with {len(result.errors)} error(s).")
        return 1

    warning_summary = f" with {len(result.warnings)} warning(s)" if result.warnings else ""
    print(f"\nRelease contract passed{warning_summary}.")
    return 0


def main() -> int:
    args = parse_args()
    result = ValidationResult()

    check_privacy_policy(result)
    check_icon_parity(result)

    if args.platform in {"android", "both"}:
        check_android(result, args.strict_screenshots)
    if args.platform in {"ios", "both"}:
        check_ios(result, args.strict_screenshots)
    if args.platform == "both":
        check_cross_platform_parity(result)

    return render(result)


if __name__ == "__main__":
    raise SystemExit(main())
