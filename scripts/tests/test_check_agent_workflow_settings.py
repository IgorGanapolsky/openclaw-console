#!/usr/bin/env python3

from __future__ import annotations

import unittest

from scripts.check_agent_workflow_settings import load_settings, validate_settings


class TestAgentWorkflowSettings(unittest.TestCase):
    def test_repo_settings_are_valid(self) -> None:
        settings, errors = load_settings()
        self.assertEqual(errors, [])
        self.assertIsNotNone(settings)
        self.assertEqual(validate_settings(settings or {}), [])

    def test_requires_worktree_isolation(self) -> None:
        settings, errors = load_settings()
        self.assertEqual(errors, [])
        broken = dict(settings or {})
        broken["workflow"] = dict(broken["workflow"])
        broken["workflow"]["isolation"] = "shared_checkout"
        result = validate_settings(broken)
        self.assertIn("settings.workflow.isolation must be 'worktree'", result)


if __name__ == "__main__":
    unittest.main()
