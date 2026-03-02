#!/usr/bin/env python3
"""Upload Android store listing metadata to Google Play using the Developer API.

Bypasses fastlane supply's track/release resolution which fails when
multiple releases exist on a track. Store listing metadata (title,
short description, full description) is app-level, not track-specific.

Usage:
    python3 scripts/sync_android_metadata.py

Requires:
    - GOOGLE_PLAY_JSON_KEY_PATH or /tmp/play-service-account.json
    - google-api-python-client, google-auth
"""

import json
import os
import sys
from pathlib import Path

from google.oauth2 import service_account
from googleapiclient.discovery import build

PACKAGE_NAME = "com.openclaw.console"
METADATA_ROOT = Path(__file__).resolve().parent.parent / "android" / "fastlane" / "metadata" / "android"

# Google Play API language codes differ from fastlane directory names
LANG_MAP = {
    "en-US": "en-US",
    "de-DE": "de-DE",
    "ja": "ja-JP",
    "ko": "ko-KR",
    "pt-BR": "pt-BR",
}


def read_metadata(lang_dir: str, filename: str) -> str:
    path = METADATA_ROOT / lang_dir / filename
    if path.exists():
        return path.read_text().strip()
    return ""


def main():
    key_path = os.environ.get("GOOGLE_PLAY_JSON_KEY_PATH", os.path.join(os.environ.get("RUNNER_TEMP", os.getcwd()), "play-service-account.json"))
    if not os.path.exists(key_path):
        print(f"Service account key not found at {key_path}", file=sys.stderr)
        sys.exit(1)

    credentials = service_account.Credentials.from_service_account_file(
        key_path,
        scopes=["https://www.googleapis.com/auth/androidpublisher"],
    )
    service = build("androidpublisher", "v3", credentials=credentials)
    edits = service.edits()

    # Create edit
    edit = edits.insert(packageName=PACKAGE_NAME, body={}).execute()
    edit_id = edit["id"]
    print(f"Created edit: {edit_id}")

    updated = []
    for local_lang, api_lang in LANG_MAP.items():
        title = read_metadata(local_lang, "title.txt")
        short_desc = read_metadata(local_lang, "short_description.txt")
        full_desc = read_metadata(local_lang, "full_description.txt")

        if not any([title, short_desc, full_desc]):
            continue

        listing = {}
        if title:
            listing["title"] = title
        if short_desc:
            listing["shortDescription"] = short_desc
        if full_desc:
            listing["fullDescription"] = full_desc

        edits.listings().update(
            packageName=PACKAGE_NAME,
            editId=edit_id,
            language=api_lang,
            body=listing,
        ).execute()
        updated.append(api_lang)
        print(f"  Updated listing for {api_lang}: title={'yes' if title else 'no'}, short={'yes' if short_desc else 'no'}, full={'yes' if full_desc else 'no'}")

    if not updated:
        print("No metadata to upload. Discarding edit.")
        edits.delete(packageName=PACKAGE_NAME, editId=edit_id).execute()
        return

    # Commit edit
    edits.commit(packageName=PACKAGE_NAME, editId=edit_id).execute()
    print(f"Committed edit. Updated {len(updated)} languages: {', '.join(updated)}")


if __name__ == "__main__":
    main()
