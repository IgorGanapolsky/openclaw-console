#!/usr/bin/env python3

from __future__ import annotations

import unittest

from scripts.ensure_testflight_visibility import (
    TestFlightVisibility,
    is_internal_pseudo_group,
    summarize_asc_error,
)


class FakeClient:
    def __init__(
        self,
        *,
        tester_exists: bool = True,
        tester_has_build: bool = True,
        user_exists: bool = True,
        user_roles: list[str] | None = None,
        all_apps_visible: bool = True,
        visible_app_ids: set[str] | None = None,
    ) -> None:
        self.tester_exists = tester_exists
        self.tester_has_build = tester_has_build
        self.user_exists = user_exists
        self.user_roles = user_roles or ["ADMIN"]
        self.all_apps_visible = all_apps_visible
        self.visible_app_ids = visible_app_ids if visible_app_ids is not None else {"app-1"}
        self.group_requests = 0
        self.assigned_builds: list[tuple[str, str]] = []
        self.user_query_params: dict[str, str] | None = None

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
        if path == "/users":
            self.user_query_params = params
            return {
                "data": [
                    {
                        "id": "user-1",
                        "attributes": {
                            "username": "iganapolsky@gmail.com",
                            "roles": self.user_roles,
                            "allAppsVisible": self.all_apps_visible,
                        },
                    }
                ]
                if self.user_exists
                else []
            }
        raise AssertionError(f"unexpected request: {method} {path}")

    def get_all(self, path, *, params=None):
        if path == "/apps/app-1/betaGroups":
            self.group_requests += 1
            return []
        if path == "/betaTesters/tester-1/relationships/builds":
            return [{"id": "build-1"}] if self.tester_has_build else []
        if path == "/users/user-1/visibleApps":
            return [{"id": app_id} for app_id in sorted(self.visible_app_ids)]
        raise AssertionError(f"unexpected get_all: {path}")


class TestInternalPseudoGroups(unittest.TestCase):
    def test_recognizes_app_store_connect_users_alias(self) -> None:
        self.assertTrue(is_internal_pseudo_group("App Store Connect Users"))
        self.assertTrue(is_internal_pseudo_group("  appstore   connect users "))
        self.assertFalse(is_internal_pseudo_group("Internal Testers"))

    def test_pseudo_group_checks_build_and_required_asc_user_without_beta_group(self) -> None:
        client = FakeClient(user_exists=True)
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
        self.assertEqual(client.user_query_params["filter[username]"], "iganapolsky@gmail.com")
        self.assertEqual(client.user_query_params["fields[users]"], "username,roles,allAppsVisible")

    def test_pseudo_group_fails_when_required_tester_is_missing(self) -> None:
        client = FakeClient(user_exists=False)
        with self.assertRaisesRegex(RuntimeError, "missing from App Store Connect users"):
            TestFlightVisibility(client, "com.openclaw.console").ensure(
                "1.0.0",
                ["App Store Connect Users"],
                ["iganapolsky@gmail.com"],
            )

    def test_pseudo_group_fails_when_required_user_lacks_internal_tester_role(self) -> None:
        client = FakeClient(user_exists=True, user_roles=["CUSTOMER_SUPPORT"])
        with self.assertRaisesRegex(RuntimeError, "do not have an internal testing role"):
            TestFlightVisibility(client, "com.openclaw.console").ensure(
                "1.0.0",
                ["App Store Connect Users"],
                ["iganapolsky@gmail.com"],
            )

    def test_pseudo_group_fails_when_required_user_lacks_app_access(self) -> None:
        client = FakeClient(user_exists=True, all_apps_visible=False, visible_app_ids={"other-app"})
        with self.assertRaisesRegex(RuntimeError, "do not have access to app"):
            TestFlightVisibility(client, "com.openclaw.console").ensure(
                "1.0.0",
                ["App Store Connect Users"],
                ["iganapolsky@gmail.com"],
            )

    def test_pseudo_group_passes_when_required_user_has_specific_app_access(self) -> None:
        client = FakeClient(user_exists=True, all_apps_visible=False, visible_app_ids={"app-1"})
        result = TestFlightVisibility(client, "com.openclaw.console").ensure(
            "1.0.0",
            ["App Store Connect Users"],
            ["iganapolsky@gmail.com"],
            assign_required_testers=True,
        )
        self.assertEqual(result["status"], "VISIBLE")
        self.assertEqual(result["required_testers_assigned"], 0)
        self.assertEqual(client.assigned_builds, [])

    def test_summarizes_app_store_connect_error_body(self) -> None:
        body = """
        {
          "errors": [
            {
              "status": "400",
              "code": "PARAMETER_ERROR.INVALID",
              "title": "A parameter has an invalid value",
              "detail": "filter[email] is not a valid filter"
            }
          ]
        }
        """
        summary = summarize_asc_error(body)
        self.assertIn("400", summary)
        self.assertIn("PARAMETER_ERROR.INVALID", summary)
        self.assertIn("filter[email] is not a valid filter", summary)


if __name__ == "__main__":
    unittest.main()
