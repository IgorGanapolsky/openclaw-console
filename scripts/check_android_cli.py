#!/usr/bin/env python3
"""Preflight Android CLI availability without dumping noisy SDK output."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from dataclasses import dataclass


FALLBACK_TOOLS = ("sdkmanager", "avdmanager", "adb")


@dataclass(frozen=True)
class ToolStatus:
    name: str
    path: str | None

    @property
    def available(self) -> bool:
        return self.path is not None


def tool_status(name: str) -> ToolStatus:
    return ToolStatus(name=name, path=shutil.which(name))


def android_version() -> str:
    try:
        result = subprocess.run(
            ["android", "--version"],
            check=False,
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return f"version unavailable: {exc}"

    output = "\n".join(
        line.strip()
        for line in (result.stdout + "\n" + result.stderr).splitlines()
        if line.strip()
    )
    if result.returncode == 0 and output:
        return output.splitlines()[0]
    if output:
        return f"version command exited {result.returncode}: {output.splitlines()[0]}"
    return f"version command exited {result.returncode} with no output"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Check whether Android CLI or SDK fallback tools are available."
    )
    parser.add_argument(
        "--require-android-cli",
        action="store_true",
        help="Fail unless the preview Android CLI `android` command is on PATH.",
    )
    parser.add_argument(
        "--allow-missing-tools",
        action="store_true",
        help="Pass when neither Android CLI nor SDK tools are installed, for lightweight CI guardrail jobs.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    android = tool_status("android")
    fallbacks = [tool_status(name) for name in FALLBACK_TOOLS]
    fallback_names = [tool.name for tool in fallbacks if tool.available]

    if android.available:
        print(f"Android CLI: available at {android.path}")
        print(f"Android CLI version: {android_version()}")
        return 0

    print("Android CLI: unavailable on PATH")
    if fallback_names:
        print(f"SDK fallback tools: available ({', '.join(fallback_names)})")
    else:
        print("SDK fallback tools: unavailable")

    print(
        "Guidance: use repo Gradle/SDK commands now; after installing the preview "
        "Android CLI from official docs, run `android init` to install Android skills."
    )

    if args.require_android_cli:
        print("Result: failed because --require-android-cli was set.")
        return 1
    if fallback_names:
        print("Result: passed with SDK fallback tools.")
        return 0
    if args.allow_missing_tools:
        print("Result: passed because --allow-missing-tools was set.")
        return 0

    print("Result: failed because neither Android CLI nor SDK fallback tools were found.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
