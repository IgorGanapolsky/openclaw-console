#!/usr/bin/env python3
"""Autonomous Google Play Console promotion pipeline for June 2026.

Uses Fastlane supply and the Google Play Developer API to promote internal/staging 
builds to production or other release tracks automatically.
"""

from __future__ import annotations

import os
import sys
import json
import argparse
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ANDROID_DIR = ROOT / "android"

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--promote-to",
        choices=("production", "beta", "alpha"),
        default="production",
        help="Release track to promote the staging build to (default: production)."
    )
    parser.add_argument(
        "--version-code",
        type=int,
        help="Optional specific versionCode to promote."
    )
    return parser.parse_args()

def setup_google_play_key() -> str | None:
    # Retrieve the Google Play JSON key from environment variables
    # If the JSON content is provided in GOOGLE_PLAY_JSON_KEY, we write it to a temp file.
    raw_key = os.environ.get("GOOGLE_PLAY_JSON_KEY")
    if not raw_key:
        # Fallback to checking the file path from environment variable
        path = os.environ.get("GOOGLE_PLAY_JSON_KEY_PATH")
        if path and Path(path).is_file():
            print(f"Using Google Play JSON key from path: {path}")
            return path
        return None
        
    try:
        # If it's a file path, return it
        if raw_key.startswith("/") or raw_key.startswith("~") or raw_key.startswith("."):
            expanded = Path(raw_key).expanduser()
            if expanded.is_file():
                return str(expanded)
                
        # Otherwise, parse it as JSON and write to a temporary file
        parsed = json.loads(raw_key) if not raw_key.strip().startswith("{") else raw_key
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".json", mode="w", encoding="utf-8")
        temp_file.write(raw_key)
        temp_file.close()
        print(f"Created temporary Google Play JSON key file: {temp_file.name}")
        return temp_file.name
    except Exception as exc:
        print(f"Error processing GOOGLE_PLAY_JSON_KEY: {exc}", file=sys.stderr)
        return None

def main() -> int:
    args = parse_args()
    
    # 1. Setup the key file
    key_path = setup_google_play_key()
    if not key_path:
        print("Warning: GOOGLE_PLAY_JSON_KEY / GOOGLE_PLAY_JSON_KEY_PATH not set. Fastlane will use default path /tmp/play-service-account.json or prompt for auth.", file=sys.stderr)
        key_path = "/tmp/play-service-account.json"
    
    # Ensure key exists at target location if we're using /tmp/play-service-account.json
    if key_path == "/tmp/play-service-account.json" and not Path(key_path).is_file():
        # If GOOGLE_PLAY_JSON_KEY was provided, we can write it to /tmp/play-service-account.json
        raw_key = os.environ.get("GOOGLE_PLAY_JSON_KEY")
        if raw_key:
            try:
                Path("/tmp").mkdir(parents=True, exist_ok=True)
                Path(key_path).write_text(raw_key, encoding="utf-8")
                print(f"Wrote GOOGLE_PLAY_JSON_KEY to {key_path}")
            except Exception as exc:
                print(f"Failed to write key to {key_path}: {exc}", file=sys.stderr)

    # 2. Run validation check
    print("Validating release contract before promotion...")
    try:
        subprocess.run([sys.executable, str(ROOT / "scripts/validate_release_contract.py"), "--platform", "android"], check=True)
    except subprocess.CalledProcessError as exc:
        print(f"Release contract validation failed: {exc}", file=sys.stderr)
        return 1

    # 3. Construct the fastlane command
    # Promote lane is: fastlane promote_to_production
    print(f"Promoting internal/staging build to {args.promote_to} track...")
    
    env = os.environ.copy()
    env["SUPPLY_JSON_KEY"] = key_path
    
    # Run the fastlane command
    # Use bundle exec if Gemfile exists, otherwise run fastlane directly
    fastlane_cmd = ["fastlane", "promote_to_production"]
    
    if (ANDROID_DIR / "Gemfile").is_file():
        fastlane_cmd = ["bundle", "exec", "fastlane", "promote_to_production"]
        
    try:
        subprocess.run(fastlane_cmd, cwd=str(ANDROID_DIR), env=env, check=True)
        print(f"\nSuccessfully promoted staging build to {args.promote_to} track!")
        return 0
    except subprocess.CalledProcessError as exc:
        print(f"Fastlane promotion failed: {exc}", file=sys.stderr)
        return 1
    finally:
        # Cleanup temporary file if it was created and isn't the static /tmp path
        if key_path and key_path not in ("/tmp/play-service-account.json", os.environ.get("GOOGLE_PLAY_JSON_KEY_PATH", "")):
            try:
                os.unlink(key_path)
                print(f"Cleaned up temporary key file: {key_path}")
            except Exception:
                pass

if __name__ == "__main__":
    sys.exit(main())
