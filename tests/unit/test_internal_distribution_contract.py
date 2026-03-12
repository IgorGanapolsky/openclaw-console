import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = (ROOT / ".github/workflows/internal-distribution.yml").read_text()
SETUP_SCRIPT = (ROOT / "scripts/setup-secrets.sh").read_text()
FASTFILE = (ROOT / "ios/OpenClawConsole/fastlane/Fastfile").read_text()


class InternalDistributionContractTest(unittest.TestCase):
    def test_manual_dispatch_description_matches_current_ref_behavior(self):
        self.assertIn('defaults to the branch or tag you dispatch from', WORKFLOW)
        self.assertIn('REF="${INPUT_REF:-$GITHUB_REF_NAME}"', WORKFLOW)

    def test_concurrency_separates_triggering_ci_workflows(self):
        self.assertIn("internal-distribution-${{ github.event_name }}-${{ github.event.workflow_run.head_sha || inputs.ref || github.ref_name }}", WORKFLOW)
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

    def test_workflow_uses_supported_firebase_verification_commands(self):
        self.assertIn('firebase_json appdistribution:groups:list -P "$FIREBASE_PROJECT_ID"', WORKFLOW)
        self.assertIn('firebase_json appdistribution:testers:list "$group_alias" -P "$FIREBASE_PROJECT_ID"', WORKFLOW)
        self.assertNotIn("appdistribution:releases:list", WORKFLOW)
        self.assertNotIn("--format=json", WORKFLOW)

    def test_workflow_requires_secret_only_group_based_firebase_audience(self):
        self.assertIn("FIREBASE_INTERNAL_TESTERS direct-email distribution is no longer supported", WORKFLOW)
        self.assertIn("Firebase internal audience must be configured as GitHub Actions secrets only.", WORKFLOW)
        self.assertIn('echo "❌ Missing required secret: FIREBASE_PROJECT_ID"', WORKFLOW)
        self.assertIn("Missing FIREBASE_INTERNAL_GROUPS secret. Android internal distribution requires explicit Firebase tester groups.", WORKFLOW)
        self.assertIn("Missing FIREBASE_REQUIRED_TESTER_EMAIL secret. Android internal distribution requires a proof tester in the target group.", WORKFLOW)
        self.assertNotIn('resolve_distribution_config "FIREBASE_INTERNAL_TESTERS"', WORKFLOW)
        self.assertNotIn('resolve_distribution_config "FIREBASE_INTERNAL_GROUPS"', WORKFLOW)
        self.assertNotIn('resolve_distribution_config "FIREBASE_REQUIRED_TESTER_EMAIL"', WORKFLOW)

    def test_workflow_prefers_ci_token_before_google_play_fallback(self):
        self.assertIn('AUTH_MODE="ci_token"', WORKFLOW)
        self.assertIn('AUTH_MODE="google_play_service_account"', WORKFLOW)
        self.assertIn('FIREBASE_AUTH_MODE: ${{ steps.firebase_distribute.outputs.auth_mode }}', WORKFLOW)
        self.assertIn('Falling back to FIREBASE_TOKEN for this run.', WORKFLOW)
        self.assertIn('unset FIREBASE_TOKEN', WORKFLOW)
        self.assertIn('FIREBASE_TOKEN_FALLBACK="${FIREBASE_TOKEN:-}"', WORKFLOW)

    def test_workflow_verifies_group_based_release_access_path(self):
        self.assertIn('echo "requested_groups=$DIST_GROUPS"', WORKFLOW)
        self.assertIn('REQUESTED_GROUPS: ${{ steps.firebase_distribute.outputs.requested_groups }}', WORKFLOW)
        self.assertIn('echo "project_id=$PROJECT_ID" >> "$GITHUB_OUTPUT"', WORKFLOW)
        self.assertIn('--project "$FIREBASE_PROJECT_ID"', WORKFLOW)
        self.assertIn('if ! curl -fsSIL "$TESTING_URL" >/dev/null; then', WORKFLOW)
        self.assertIn('curl -fsSIL "$BINARY_DOWNLOAD_URL"', WORKFLOW)
        self.assertIn('Successful appdistribution:distribute with --groups is the release-level access assignment.', WORKFLOW)
        self.assertIn('GROUP_ACCESS_READBACK="verified"', WORKFLOW)
        self.assertIn('GROUP_ACCESS_READBACK="skipped"', WORKFLOW)
        self.assertIn('Firebase CLI could not list App Distribution groups for project $FIREBASE_PROJECT_ID.', WORKFLOW)
        self.assertIn('Firebase CLI could not list testers for group $group_alias in project $FIREBASE_PROJECT_ID.', WORKFLOW)
        self.assertIn('Firebase accepted this release distribution request for group alias(es): $TARGET_GROUPS', WORKFLOW)
        self.assertIn('Required Firebase proof tester belongs to the configured Firebase group access path', WORKFLOW)
        self.assertIn('Release-specific proof remains the successful distribute call plus the returned release URLs above.', WORKFLOW)
        self.assertNotIn('Firebase release was distributed to group alias(es): $TARGET_GROUPS', WORKFLOW)
        self.assertNotIn('Distribution targeted tester(s): $TARGET_TESTERS', WORKFLOW)

    def test_workflow_resolves_android_app_id_by_package_name(self):
        self.assertIn('android_client_info.package_name == "com.openclaw.console"', WORKFLOW)

    def test_setup_script_collects_distribution_proof_inputs(self):
        self.assertIn("FIREBASE_REQUIRED_TESTER_EMAIL", SETUP_SCRIPT)
        self.assertIn("TESTFLIGHT_GROUPS", SETUP_SCRIPT)
        self.assertIn("TESTFLIGHT_REQUIRED_TESTER_EMAIL", SETUP_SCRIPT)
        self.assertIn("FIREBASE_SERVICE_ACCOUNT_JSON", SETUP_SCRIPT)
        self.assertIn("FIREBASE_PROJECT_ID", SETUP_SCRIPT)
        self.assertIn("set_secret_authoritative", SETUP_SCRIPT)
        self.assertIn("prompt_required_value", SETUP_SCRIPT)
        self.assertIn('FB_PROJECT_ID="$(prompt_required_value "Firebase project ID for App Distribution" project_id)"', SETUP_SCRIPT)
        self.assertIn('FB_REQUIRED_TESTER="$(prompt_required_value "Firebase required tester email for group-based proof" email)"', SETUP_SCRIPT)
        self.assertIn('FB_GROUPS="$(prompt_required_value "Firebase internal groups (comma-separated)" csv_aliases)"', SETUP_SCRIPT)
        self.assertIn('TF_GROUPS="$(prompt_required_value "TestFlight internal beta groups (comma-separated)" csv_names)"', SETUP_SCRIPT)
        self.assertIn('TF_REQUIRED_TESTER="$(prompt_required_value "TestFlight required internal tester email for proof" email)"', SETUP_SCRIPT)
        self.assertIn("secret_exists", SETUP_SCRIPT)
        self.assertIn("environment_secret_exists", SETUP_SCRIPT)
        self.assertIn("variable_exists", SETUP_SCRIPT)
        self.assertIn("environment_variable_exists", SETUP_SCRIPT)
        self.assertIn("delete_environment_secret_if_present", SETUP_SCRIPT)
        self.assertIn("delete_environment_variable_if_present", SETUP_SCRIPT)
        self.assertIn('gh variable delete "$name" --repo="$REPO" --env "$ENVIRONMENT_NAME"', SETUP_SCRIPT)
        self.assertIn("for legacy_name in FIREBASE_INTERNAL_TESTERS FIREBASE_INTERNAL_GROUPS FIREBASE_REQUIRED_TESTER_EMAIL; do", SETUP_SCRIPT)
        self.assertIn("Legacy Firebase audience settings were removed from repo/production scopes where they existed.", SETUP_SCRIPT)
        self.assertIn("No legacy Firebase audience settings were present in repo/production scopes.", SETUP_SCRIPT)
        self.assertIn("valid_project_id", SETUP_SCRIPT)
        self.assertIn("valid_email", SETUP_SCRIPT)
        self.assertIn("valid_csv_aliases", SETUP_SCRIPT)
        self.assertIn("valid_csv_names", SETUP_SCRIPT)
        self.assertEqual(SETUP_SCRIPT.count('gh secret set GOOGLE_PLAY_JSON_KEY --repo="$REPO"'), 1)
        self.assertNotIn('Firebase internal tester emails (comma-separated, or \'skip\')', SETUP_SCRIPT)
        self.assertNotIn("After this, TestFlight + Firebase builds will work automatically.", SETUP_SCRIPT)

    def test_fastfile_persists_metadata_beside_lane_and_requires_groups(self):
        self.assertIn('File.join(__dir__, "testflight_build.json")', FASTFILE)
        self.assertIn('TESTFLIGHT_GROUPS is required for internal TestFlight distribution', FASTFILE)
        self.assertIn('TESTFLIGHT_REQUIRED_TESTER_EMAIL is required for internal TestFlight delivery proof', FASTFILE)
        self.assertIn('strict_csv_env("TESTFLIGHT_GROUPS_SECRET", "TESTFLIGHT_GROUPS")', FASTFILE)
        self.assertIn("submit_beta_review: false", FASTFILE)

    def test_fastfile_uses_readonly_match_in_ci(self):
        self.assertIn('readonly: ENV["CI"] == "true"', FASTFILE)
        self.assertIn('must match when both are set', FASTFILE)

    def test_testflight_verifier_supports_base64_keys_and_required_tester_membership(self):
        verifier = (ROOT / "scripts/assign_testflight_build_to_groups.rb").read_text()
        self.assertIn('Base64.decode64(private_key)', verifier)
        self.assertIn('"/v1/betaGroups/#{group.fetch(\'id\')}/betaTesters?limit=200"', verifier)
        self.assertIn("TESTFLIGHT_REQUIRED_TESTER_EMAIL", verifier)
        self.assertIn('"/v1/builds?#{query}"', verifier)
        self.assertIn('strict_csv_env("TESTFLIGHT_GROUPS_SECRET", "TESTFLIGHT_GROUPS")', verifier)
        self.assertNotIn("add_build_to_groups", verifier)


if __name__ == "__main__":
    unittest.main()
