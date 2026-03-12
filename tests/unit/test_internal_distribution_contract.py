import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = (ROOT / ".github/workflows/internal-distribution.yml").read_text()
SETUP_SCRIPT = (ROOT / "scripts/setup-secrets.sh").read_text()
FASTFILE = (ROOT / "ios/OpenClawConsole/fastlane/Fastfile").read_text()


class InternalDistributionContractTest(unittest.TestCase):
    def test_manual_dispatch_description_matches_current_ref_behavior(self):
        self.assertIn('defaults to the branch or tag you dispatch from', WORKFLOW)

    def test_concurrency_separates_triggering_ci_workflows(self):
        self.assertIn("internal-distribution-${{ github.event_name }}-${{ github.event.workflow_run.head_sha || inputs.ref || github.ref_name }}", WORKFLOW)
        self.assertIn("github.event.workflow_run.head_sha || inputs.ref || github.ref_name", WORKFLOW)
        self.assertIn("waiting_for_both_ci_on_", WORKFLOW)
        self.assertIn("not_latest_ci_finisher_for_", WORKFLOW)

    def test_gate_only_auto_distributes_from_develop(self):
        self.assertIn('"$WORKFLOW_BRANCH" == "develop"', WORKFLOW)
        self.assertIn('select(.name == "iOS CI" and .conclusion == "success")', WORKFLOW)
        self.assertIn('select(.name == "Android CI" and .conclusion == "success")', WORKFLOW)
        self.assertIn('max_by(.updated_at) | .id // empty', WORKFLOW)

    def test_workflow_requires_testflight_group_and_required_tester(self):
        self.assertIn("TESTFLIGHT_GROUPS", WORKFLOW)
        self.assertIn("TESTFLIGHT_REQUIRED_TESTER_EMAIL", WORKFLOW)
        self.assertIn("Verify TestFlight build delivery to internal beta groups", WORKFLOW)
        self.assertIn("xcodegen generate", WORKFLOW)

    def test_workflow_uses_supported_firebase_verification_commands(self):
        self.assertIn('firebase_json appdistribution:testers:list -P openclaw-console-mobile', WORKFLOW)
        self.assertIn('firebase_json appdistribution:groups:list -P openclaw-console-mobile', WORKFLOW)
        self.assertNotIn("appdistribution:releases:list", WORKFLOW)
        self.assertNotIn("--format=json", WORKFLOW)

    def test_workflow_prefers_secret_backed_audience_and_ci_token_before_google_play_fallback(self):
        self.assertIn('resolve_distribution_config "FIREBASE_INTERNAL_TESTERS"', WORKFLOW)
        self.assertIn('resolve_distribution_config "FIREBASE_INTERNAL_GROUPS"', WORKFLOW)
        self.assertIn('resolve_distribution_config "FIREBASE_REQUIRED_TESTER_EMAIL"', WORKFLOW)
        self.assertIn('AUTH_METHOD="ci_token_fallback"', WORKFLOW)
        self.assertIn('AUTH_METHOD="google_play_service_account_fallback"', WORKFLOW)
        self.assertIn('FIREBASE_AUTH_MODE: ${{ steps.firebase_auth.outputs.mode }}', WORKFLOW)
        self.assertIn('Falling back to FIREBASE_TOKEN for this run.', WORKFLOW)

    def test_workflow_resolves_android_app_id_by_package_name(self):
        self.assertIn('android_client_info.package_name == "com.openclaw.console"', WORKFLOW)

    def test_setup_script_collects_distribution_proof_inputs(self):
        self.assertIn("FIREBASE_REQUIRED_TESTER_EMAIL", SETUP_SCRIPT)
        self.assertIn("TESTFLIGHT_GROUPS", SETUP_SCRIPT)
        self.assertIn("TESTFLIGHT_REQUIRED_TESTER_EMAIL", SETUP_SCRIPT)
        self.assertIn("gh variable delete", SETUP_SCRIPT)

    def test_fastfile_persists_metadata_beside_lane_and_requires_groups(self):
        self.assertIn('File.join(__dir__, "testflight_build.json")', FASTFILE)
        self.assertIn('TESTFLIGHT_GROUPS is required for internal TestFlight distribution', FASTFILE)
        self.assertIn('TESTFLIGHT_REQUIRED_TESTER_EMAIL is required for internal TestFlight delivery proof', FASTFILE)
        self.assertIn('csv_env("TESTFLIGHT_GROUPS_SECRET", "TESTFLIGHT_GROUPS")', FASTFILE)

    def test_fastfile_uses_readonly_match_in_ci(self):
        self.assertIn('readonly: ENV["CI"] == "true"', FASTFILE)

    def test_testflight_verifier_supports_base64_keys_and_required_tester_membership(self):
        verifier = (ROOT / "scripts/assign_testflight_build_to_groups.rb").read_text()
        self.assertIn('Base64.decode64(private_key)', verifier)
        self.assertIn('"/v1/betaGroups/#{group.fetch(\'id\')}/betaTesters?limit=200"', verifier)
        self.assertIn("TESTFLIGHT_REQUIRED_TESTER_EMAIL", verifier)
        self.assertIn('"/v1/builds?#{query}"', verifier)
        self.assertIn("TESTFLIGHT_GROUPS_SECRET", verifier)
        self.assertNotIn("add_build_to_groups", verifier)


if __name__ == "__main__":
    unittest.main()
