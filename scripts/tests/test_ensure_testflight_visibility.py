#!/usr/bin/env python3

from __future__ import annotations

import unittest

from scripts.ensure_testflight_visibility import TestFlightVisibility, is_internal_pseudo_group


class FakeClient:
    def __init__(self, *, tester_exists: bool = True, tester_has_build: bool = True) -> None:
        self.tester_exists = tester_exists
        self.tester_has_build = tester_has_build
        self.group_requests = 0
        self.assigned_builds: list[tuple[str, str]] = []

    def request(self, method, path, *, params=None, payload=None):
        if path == "/apps":
            return {"data": [{"id": "app-1"}]}
        if path == "/builds":
            return {
                "data": [
                    {
                        "id": "build-1",
                        "attributes": {"version": "260504133807", "processingState": "VALID"},
                        "relationships": {"preReleaseVersion": {"data": {"id": "pr-1"}}},
                    }
                ],
                "included": [{"type": "preReleaseVersions", "id": "pr-1", "attributes": {"version": "1.0.0"}}],
            }
        if path == "/betaTesters":
            return {"data": [{"id": "tester-1", "attributes": {"email": "iganapolsky@gmail.com"}}] if self.tester_exists else []}
        if path == "/betaTesters/tester-1/relationships/builds":
            if method == "POST":
                self.assigned_builds.append(("tester-1", payload["data"][0]["id"]))
                self.tester_has_build = True
                return {}
        raise AssertionError(f"unexpected request: {method} {path}")

    def get_all(self, path, *, params=None):
        if path == "/apps/app-1/betaGroups":
            self.group_requests += 1
            return []
        if path == "/betaTesters/tester-1/relationships/builds":
            return [{"id": "build-1"}] if self.tester_has_build else []
        raise AssertionError(f"unexpected get_all: {path}")


class TestInternalPseudoGroups(unittest.TestCase):
    def test_recognizes_app_store_connect_users_alias(self) -> None:
        self.assertTrue(is_internal_pseudo_group("App Store Connect Users"))
        self.assertTrue(is_internal_pseudo_group("  appstore   connect users "))
        self.assertFalse(is_internal_pseudo_group("Internal Testers"))

    def test_pseudo_group_checks_build_and_required_tester_without_beta_group(self) -> None:
        client = FakeClient(tester_exists=True)
        result = TestFlightVisibility(client, "com.openclaw.console").ensure(
            "1.0.0",
            ["App Store Connect Users"],
            ["iganapolsky@gmail.com"],
        )
        self.assertEqual(result["status"], "VISIBLE")
        self.assertEqual(result["build_number"], "260504133807")
        self.assertEqual(result["groups"], ["App Store Connect Users"])
        self.assertEqual(result["required_testers_checked"], 1)
        self.assertEqual(result["required_testers_assigned"], 0)
        self.assertEqual(client.group_requests, 0)

    def test_pseudo_group_fails_when_required_tester_is_missing(self) -> None:
        client = FakeClient(tester_exists=False)
        with self.assertRaisesRegex(RuntimeError, "Required internal TestFlight testers missing"):
            TestFlightVisibility(client, "com.openclaw.console").ensure(
                "1.0.0",
                ["App Store Connect Users"],
                ["iganapolsky@gmail.com"],
            )

    def test_pseudo_group_fails_when_required_tester_lacks_build_access(self) -> None:
        client = FakeClient(tester_exists=True, tester_has_build=False)
        with self.assertRaisesRegex(RuntimeError, "not assigned to build"):
            TestFlightVisibility(client, "com.openclaw.console").ensure(
                "1.0.0",
                ["App Store Connect Users"],
                ["iganapolsky@gmail.com"],
            )

    def test_pseudo_group_assigns_required_tester_to_build_when_requested(self) -> None:
        client = FakeClient(tester_exists=True, tester_has_build=False)
        result = TestFlightVisibility(client, "com.openclaw.console").ensure(
            "1.0.0",
            ["App Store Connect Users"],
            ["iganapolsky@gmail.com"],
            assign_required_testers=True,
        )
        self.assertEqual(result["status"], "VISIBLE")
        self.assertEqual(result["required_testers_assigned"], 1)
        self.assertEqual(client.assigned_builds, [("tester-1", "build-1")])


if __name__ == "__main__":
    unittest.main()
