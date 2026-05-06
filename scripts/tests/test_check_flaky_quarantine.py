#!/usr/bin/env python3

from __future__ import annotations

import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

from scripts.check_flaky_quarantine import validate_manifest


def write_manifest(payload: dict) -> Path:
    handle = tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False)
    with handle:
        json.dump(payload, handle)
    return Path(handle.name)


class TestFlakyQuarantineValidation(unittest.TestCase):
    def test_empty_manifest_passes(self) -> None:
        path = write_manifest({"version": 1, "quarantines": []})
        result = validate_manifest(path, today=date(2026, 5, 4))
        self.assertEqual(result.errors, [])
        self.assertEqual(result.quarantine_count, 0)

    def test_valid_quarantine_passes(self) -> None:
        path = write_manifest(
            {
                "version": 1,
                "quarantines": [
                    {
                        "test_id": "android.smoke.launch",
                        "platform": "android",
                        "owner": "@IgorGanapolsky",
                        "issue": "#123",
                        "reason": "Emulator boot race during GitHub-hosted runner startup",
                        "skip_strategy": "retry_only",
                        "expires_on": "2026-05-20",
                    }
                ],
            }
        )
        result = validate_manifest(path, today=date(2026, 5, 4))
        self.assertEqual(result.errors, [])
        self.assertEqual(result.quarantine_count, 1)

    def test_expired_quarantine_fails(self) -> None:
        path = write_manifest(
            {
                "version": 1,
                "quarantines": [
                    {
                        "test_id": "ios.smoke.launch",
                        "platform": "ios",
                        "owner": "@IgorGanapolsky",
                        "issue": "https://github.com/IgorGanapolsky/openclaw-console/issues/42",
                        "reason": "Simulator startup instability on macOS image",
                        "skip_strategy": "retry_only",
                        "expires_on": "2026-04-30",
                    }
                ],
            }
        )
        result = validate_manifest(path, today=date(2026, 5, 4))
        self.assertTrue(any("expired on 2026-04-30" in error for error in result.errors))

    def test_missing_required_metadata_fails(self) -> None:
        path = write_manifest({"version": 1, "quarantines": [{"test_id": "gateway.test"}]})
        result = validate_manifest(path, today=date(2026, 5, 4))
        self.assertTrue(any("platform" in error for error in result.errors))


if __name__ == "__main__":
    unittest.main()
